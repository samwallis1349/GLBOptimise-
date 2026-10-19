/**
 * Asset validation. Produces a list of checks, each with:
 *   status: 'pass' | 'warn' | 'fail'
 *   kind:   'failure' (something is broken) | 'recommendation' (it works, but…)
 *   title, detail — plain English.
 *
 * Passing every check does not make a character "game ready"; it means none
 * of the problems this tool can detect were found.
 */
import { trackBinding } from './inspect.js';

export const BUDGETS = {
  trianglesWarn: 50_000,   // typical upper end for a browser/isometric agent character
  trianglesHigh: 150_000,
  bonesWarn: 150,
  heightMin: 0.2,          // metres, assuming 1 unit = 1 m
  heightMax: 5,
  texturesWarn: 16,
};

const pass = (title, detail = '') => ({ status: 'pass', kind: 'ok', title, detail });
const warn = (title, detail, kind = 'recommendation') => ({ status: 'warn', kind, title, detail });
const fail = (title, detail) => ({ status: 'fail', kind: 'failure', title, detail });

/**
 * @param {object} stats    inspectModel() result
 * @param {object} context  { root, clips, source, exportTarget }
 */
export function validateAsset(stats, { root, clips = [], source = {}, exportTarget = 'glb' } = {}) {
  const checks = [];
  const adapter = source.adapter;

  // Geometry
  if (stats.meshCount === 0) checks.push(fail('No mesh loaded', 'The file contains no visible meshes, so there is nothing to render or export.'));
  else if (stats.emptyMeshes === stats.meshCount) checks.push(fail('All meshes are empty', 'Every mesh has zero vertices.'));
  else if (stats.emptyMeshes > 0) checks.push(warn('Empty meshes', `${stats.emptyMeshes} of ${stats.meshCount} meshes have no vertices. They are harmless but can be removed.`));
  else checks.push(pass('Mesh loaded', `${stats.meshCount} mesh${stats.meshCount === 1 ? '' : 'es'}, ${stats.triangles.toLocaleString()} triangles.`));

  if (stats.nanVertices > 0) checks.push(fail('Invalid vertex positions', `${stats.nanVertices} mesh${stats.nanVertices === 1 ? ' has' : 'es have'} NaN or infinite positions. This breaks bounds, shadows and culling; fix it in the source file.`));

  // Rig
  if (!stats.hasSkeleton) {
    checks.push(warn('No skeleton', adapter?.staticOnly
      ? `${adapter.label} files cannot contain a skeleton. This is a static mesh: it can be previewed and exported, but it cannot play character animations until it is rigged (for example in Blender or Mixamo).`
      : 'No bones were found. This is a static mesh: it can be previewed and exported, but character animations need a rigged model.'));
  } else if (stats.skinnedMeshCount === 0) {
    checks.push(warn('Bones without skinning', `${stats.boneCount} bones were found but no mesh is skinned to them, so animating the bones will not deform the mesh.`, 'failure'));
  } else {
    const broken = stats.skinnedInfo.filter((s) => !s.hasSkeleton || !s.hasSkinAttributes || s.missingBones > 0);
    if (broken.length) checks.push(fail('Skinned mesh not connected', `${broken.map((b) => b.name).join(', ')}: missing skeleton, bone references or skin weights. The mesh will not deform correctly.`));
    else checks.push(pass('Skeleton connected', `${stats.boneCount} bones drive ${stats.skinnedMeshCount} skinned mesh${stats.skinnedMeshCount === 1 ? '' : 'es'}.`));
    if (stats.boneCount > BUDGETS.bonesWarn) checks.push(warn('High bone count', `${stats.boneCount} bones. Many engines and mobile GPUs work best below ${BUDGETS.bonesWarn}; consider removing finger or face bones you don't use.`));
  }

  // Animation
  if (clips.length === 0) {
    checks.push(warn('No animation clips', stats.hasSkeleton
      ? 'The rig has no embedded clips. Import an animation pack (GLB or FBX with the same bone names) on the Animations tab.'
      : 'No clips are embedded. This is expected for a static model.'));
  } else {
    const empty = clips.filter((c) => c.tracks.length === 0);
    const zero = clips.filter((c) => c.tracks.length > 0 && !(c.duration > 0));
    const partial = [];
    let unboundTotal = 0;
    if (root) for (const c of clips) {
      const b = trackBinding(c, root);
      if (b.total && b.bound < b.total) { partial.push(`${c.name} (${b.total - b.bound}/${b.total})`); unboundTotal += b.total - b.bound; }
    }
    if (empty.length) checks.push(warn('Empty clips', `${empty.map((c) => c.name || '(unnamed)').join(', ')} contain no tracks and do nothing. They are left unticked on Export.`, 'failure'));
    if (zero.length) checks.push(warn('Zero-length clips', `${zero.map((c) => c.name).join(', ')} have no duration (single-frame poses).`));
    if (partial.length) checks.push(warn('Tracks that target missing nodes', `${unboundTotal} tracks point at bones or nodes that don't exist in this model and will be ignored on playback and dropped on export: ${partial.slice(0, 6).join(', ')}${partial.length > 6 ? '…' : ''}`, 'failure'));
    if (!empty.length && !partial.length) checks.push(pass('Animation clips usable', `${clips.length} clip${clips.length === 1 ? '' : 's'}, all tracks bind to nodes in the model.`));
  }

  // Materials & textures
  if (stats.meshCount > 0) {
    if (stats.materialCount === 0) checks.push(warn('No materials', 'Meshes have no material; a default will be used.'));
    const missing = [...new Set([...(source.missingResources ?? []), ...(source.failedResources ?? []).map((u) => u.split('/').pop())])];
    if (missing.length) checks.push(warn('Missing textures', `These files are referenced but were not provided, so a grey placeholder is shown: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}. Select them together with the model to include them. Missing textures are left out of the export.`, 'failure'));
    else if (stats.textureCount > 0) checks.push(pass('Textures available', `${stats.textureCount} texture${stats.textureCount === 1 ? '' : 's'} loaded.`));
    else if (stats.materialCount > 0) checks.push(pass('Materials available', `${stats.materialCount} material${stats.materialCount === 1 ? '' : 's'}, no textures (colour-only).`));
    if (stats.textureCount > BUDGETS.texturesWarn) checks.push(warn('Many textures', `${stats.textureCount} textures. Consider an atlas to reduce draw calls and download size.`));
  }

  // Budgets
  if (stats.triangles > BUDGETS.trianglesHigh) checks.push(warn('Very high triangle count', `${stats.triangles.toLocaleString()} triangles. For a browser game character aim for under ${BUDGETS.trianglesWarn.toLocaleString()}; use Reduce Polys or Generate LODs.`));
  else if (stats.triangles > BUDGETS.trianglesWarn) checks.push(warn('High triangle count', `${stats.triangles.toLocaleString()} triangles. Fine for a hero character, heavy for crowds of isometric agents (aim for under ${BUDGETS.trianglesWarn.toLocaleString()}).`));

  // Scale (assumes 1 unit = 1 metre, the glTF convention)
  const h = Math.max(stats.size.x, stats.size.y, stats.size.z);
  if (h > 0 && (h < BUDGETS.heightMin || h > BUDGETS.heightMax)) {
    const hint = h > 50 ? ' It looks like centimetres — try display scale 0.01.' : h < 0.05 ? ' It may be in kilometres or authored very small — try display scale 100.' : '';
    checks.push(warn('Suspicious scale', `The model is ${formatUnits(h)} at its largest. glTF uses metres, so a human character is usually 1.5–2 units tall.${hint}`));
  }

  // Output format
  checks.push(...formatChecks(stats, { exportTarget, clips }));
  return checks;
}

function formatChecks(stats, { exportTarget, clips }) {
  const out = [];
  if (exportTarget === 'glb' || exportTarget === 'gltf') {
    if (stats.unsupportedMaterials) out.push(fail('Shader materials can\'t be exported', `${stats.unsupportedMaterials} custom shader material(s) have no glTF equivalent and will be exported without their shader.`));
    if (stats.nonPbrMaterials) out.push(warn('Materials will be converted', `${stats.nonPbrMaterials} material(s) use Phong/Lambert shading (common in FBX and OBJ). glTF only stores PBR materials, so colour and texture maps are kept but shininess/specular are approximated.`));
    if (stats.hasPoints) out.push(warn('Points or lines present', 'Point clouds and lines export to glTF but most game engines ignore them on characters.'));
    if (!out.length) out.push(pass('Output format supports the content', 'Mesh, materials, skeleton and animation can all be stored in GLB.'));
  } else {
    if (stats.hasSkeleton || clips.length) out.push(fail(`${exportTarget.toUpperCase()} can't store rigs or animation`, `Exporting to ${exportTarget.toUpperCase()} would discard the skeleton and ${clips.length} clip(s). Use GLB instead.`));
    else out.push(pass('Output format supports the content', `Static geometry can be stored in ${exportTarget.toUpperCase()}.`));
  }
  return out;
}

export function formatUnits(n) {
  return `${n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(2)} units`;
}

export function summarise(checks) {
  return {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };
}
