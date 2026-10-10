import { STAGES, checkStageOrder } from './stages.js';
import { MODES } from './settings.js';

/**
 * The planner: what a run WILL do to one asset, computed from its inspection
 * and the settings without touching the file. The UI shows this as
 * "Preview pipeline", and collects `confirm` items from every selected asset
 * into one dialog before a run — destructive settings are never applied
 * silently.
 */
export function planAsset(inspection, settings) {
  const order = checkStageOrder(settings.stages);
  const f = inspection?.features || {};
  const stats = inspection?.stats || {};
  const g = settings.geometry;
  const t = settings.textures;
  const a = settings.advanced;
  const deforming = f.skins > 0 || f.morphTargets > 0;
  const animated = (f.animations || []).length > 0;
  const confirm = [];
  const notes = [];

  const stages = settings.stages.map((s) => {
    const ops = [];
    const skipped = [];
    if (s.enabled) {
      switch (s.id) {
        case 'inspect':
          ops.push(`${(stats.triangles || 0).toLocaleString('en-GB')} triangles, ${stats.textures || 0} textures, ${stats.materials || 0} materials`);
          break;
        case 'cleanup':
          ops.push('prune unreferenced data', 'deduplicate identical resources');
          if (!a.keepCameras && f.cameras) ops.push(`remove ${f.cameras} camera(s)`);
          if (!a.keepLights && f.lights) ops.push(`remove ${f.lights} light(s)`);
          break;
        case 'scene':
          if (a.scale !== 1) ops.push(`scale ×${a.scale}`);
          if (a.sourceUp === 'z') ops.push('Z-up → Y-up');
          if (a.origin !== 'preserve') (animated || f.skins ? skipped : ops).push(animated || f.skins ? 'move origin (animated/skinned: skipped)' : `origin → ${a.origin === 'below' ? 'base centre' : 'centre'}`);
          if (a.mergeMeshes) (animated || f.skins ? skipped : ops).push(animated || f.skins ? 'merge meshes (animated/skinned: skipped)' : 'merge compatible meshes');
          if (a.instance) ops.push('GPU instancing for repeated meshes');
          if (!ops.length && !skipped.length) ops.push('nothing to change');
          break;
        case 'geometry': {
          if (g.weld) ops.push('weld vertices');
          if (g.removeDegenerate) ops.push('remove degenerate triangles');
          if (g.simplify) {
            const target = g.targetMode === 'triangles' ? `${g.targetTriangles.toLocaleString('en-GB')} triangles${g.scope === 'mesh' ? ' per mesh' : ''}` : `keep ${g.keepPercent}%`;
            ops.push(`simplify: ${target}${g.minTriangles ? `, min ${g.minTriangles}` : ''}${g.maxTriangles ? `, max ${g.maxTriangles}` : ''}`);
            if (deforming && !g.allowDeforming) skipped.push(`simplify ${f.skinnedMeshes || 0} skinned / ${f.morphMeshes || 0} morph-target mesh(es): protected`);
          }
          if (g.recalcNormals) ops.push('recalculate normals');
          if (g.joinPrimitives) ops.push('join primitives sharing a material');
          if (g.reorder) ops.push('reorder for vertex cache');
          break;
        }
        case 'lods':
          ops.push(`${settings.lods.levels.length} levels: ${settings.lods.levels.map((l) => `${l.keep}%`).join(' / ')}${settings.lods.grouping === 'grouped' ? ' (one grouped file)' : ' (separate files)'}`);
          if (settings.lods.collision) (f.skins ? skipped : ops).push(f.skins ? 'collision mesh (skinned: skipped)' : `collision mesh (~${settings.lods.collisionTriangles} triangles)`);
          if (deforming && !g.allowDeforming) skipped.push('deforming meshes are copied unchanged into every LOD');
          break;
        case 'resizeTextures': {
          const over = (inspection?.textures || []).filter((tx) => {
            const cap = t.roles[tx.role]?.maxSize;
            return cap && Math.max(tx.width, tx.height) > cap;
          });
          ops.push(over.length ? `downscale ${over.length} texture(s) over their role limit` : 'no texture exceeds its limit');
          break;
        }
        case 'compressTextures': {
          const byFormat = {};
          for (const tx of inspection?.textures || []) {
            const fmt = t.roles[tx.role]?.format;
            if (fmt && fmt !== 'keep') byFormat[fmt] = (byFormat[fmt] || 0) + 1;
          }
          const parts = Object.entries(byFormat).map(([k, v]) => `${v} → ${k.toUpperCase()}`);
          ops.push(parts.length ? parts.join(', ') : 'keep source formats');
          break;
        }
        case 'animation':
          if (!animated) ops.push('no animations');
          else if (settings.animation.removeAnimations) ops.push(`remove ${f.animations.length} clip(s)`);
          else if (settings.animation.resample) ops.push('remove redundant keyframes (lossless within tolerance)');
          break;
        case 'validate':
          ops.push('re-open outputs; check structure, indices, animations, skins, morph targets, materials');
          break;
        case 'report':
          ops.push([settings.export.reportJson && 'JSON report', settings.export.thumbnails && 'thumbnail', settings.export.manifest && 'manifest'].filter(Boolean).join(', ') || 'nothing selected');
          break;
        case 'export':
          ops.push(`${settings.export.compression === 'meshopt' ? 'Meshopt-compressed ' : ''}${t.output === 'separate' ? '.gltf + .bin + texture files' : 'GLB'}`);
          break;
        default:
      }
    }
    return { id: s.id, label: STAGES[s.id].label, enabled: s.enabled, ops, skipped };
  });

  const on = (id) => settings.stages.find((s) => s.id === id)?.enabled;

  // Destructive or behaviour-changing settings that need explicit confirmation.
  if (on('geometry') && g.simplify && (stats.triangles || 0) > 0) {
    if (g.targetMode === 'percent' && g.keepPercent < 40) confirm.push({ code: 'heavy-simplify', message: `Keeps only ${g.keepPercent}% of triangles: visible shape loss is likely.` });
    if (!g.lockBorder) confirm.push({ code: 'unlocked-borders', message: 'Mesh borders are unlocked: open edges and seams may pull apart.' });
    if (g.error > 0.03) confirm.push({ code: 'high-error', message: `Simplifier error limit ${g.error} is high: silhouettes may change.` });
    if (deforming && g.allowDeforming) confirm.push({ code: 'deforming', message: 'Skinned / morph-target meshes will be simplified: deformation and blend shapes can break.' });
  }
  if (on('geometry') && g.recalcNormals) confirm.push({ code: 'normals', message: 'Normals are recalculated: authored smoothing and custom normals are replaced.' });
  if (on('scene') && a.mergeMeshes && !animated && !f.skins) confirm.push({ code: 'merge', message: 'Merging meshes changes the node hierarchy and mesh names.' });
  if (on('scene') && (a.scale !== 1 || a.sourceUp === 'z' || a.origin !== 'preserve')) confirm.push({ code: 'transform', message: 'Scale, axis or origin changes move the asset relative to its original placement.' });
  if (on('animation') && settings.animation.removeAnimations && animated) confirm.push({ code: 'remove-anims', message: `All ${f.animations.length} animation clip(s) will be removed.` });
  if (on('cleanup') && ((!a.keepCameras && f.cameras) || (!a.keepLights && f.lights))) confirm.push({ code: 'cameras-lights', message: 'Cameras and/or lights will be removed.' });
  if (on('compressTextures') && t.lossyDataMaps && (inspection?.textures || []).some((tx) => tx.role !== 'baseColor' && tx.role !== 'alpha' && tx.role !== 'emissive')) {
    confirm.push({ code: 'lossy-data', message: 'Normal / packed data maps may be lossy-compressed: expect lighting artefacts.' });
  }
  if (on('resizeTextures') && t.roles.normal.maxSize && t.roles.normal.maxSize < 512 && (inspection?.textures || []).some((tx) => tx.role === 'normal' && Math.max(tx.width, tx.height) > t.roles.normal.maxSize)) {
    confirm.push({ code: 'small-normals', message: `Normal maps capped at ${t.roles.normal.maxSize}px: fine surface detail will be lost.` });
  }
  if (MODES[settings.mode]?.destructive) confirm.push({ code: 'maximum', message: 'Maximum optimisation mode: aggressive settings, check every asset in the preview.' });

  if (settings.export.compression === 'meshopt' && ['unity', 'unreal', 'godot'].includes(settings.engine)) {
    notes.push('Meshopt compression is on, but this engine’s stock importer may not decode EXT_meshopt_compression.');
  }
  if (on('lods')) notes.push('LOD files do not switch automatically: your engine (LOD Group, HLOD, THREE.LOD…) or runtime code decides when each level shows.');
  for (const tx of inspection?.textures || []) {
    if (tx.mime === 'image/ktx2' && on('resizeTextures') && t.roles[tx.role]?.maxSize && Math.max(tx.width, tx.height) > t.roles[tx.role].maxSize) {
      notes.push(`"${tx.name}" is already KTX2 and cannot be resized.`);
    }
  }

  return { stages, confirm, notes, orderErrors: order.errors, orderWarnings: order.warnings };
}
