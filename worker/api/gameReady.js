import { getBounds, Primitive } from '@gltf-transform/core';
import { center, compactPrimitive, dedup, flatten, getGLPrimitiveCount, join, prune, resample, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ApiError } from './http.js';
import { analyseGlb, evaluate, readDocument, writeDocument } from './glb.js';
import { bool, compressMeshopt, downscaleTextures, reduce } from './mesh.js';

/**
 * One call that runs the AssetBench tools in the order a mobile game needs
 * them and returns an engine-ready pack: LOD chain, collision mesh, report
 * and import notes. Budgets are AssetBench guidelines per device class and
 * asset role; each step names the site tool that does the same job by hand.
 */

const MB = 1048576;

export const ROLES = {
  prop: { name: 'Prop', tris: 10000, tex: 1024, draws: 3, mats: 2, texMB: 8, fileMB: 2, animMB: 1, transp: 1, pivot: 'bottom' },
  vehicle: { name: 'Vehicle', tris: 20000, tex: 1024, draws: 4, mats: 3, texMB: 12, fileMB: 4, animMB: 1, transp: 2, pivot: 'bottom' },
  character: { name: 'Character', tris: 20000, tex: 1024, draws: 3, mats: 3, texMB: 12, fileMB: 5, animMB: 4, transp: 1, pivot: 'bottom' },
  hero: { name: 'Hero character', tris: 40000, tex: 2048, draws: 5, mats: 4, texMB: 24, fileMB: 8, animMB: 8, transp: 1, pivot: 'bottom' },
  environment: { name: 'Environment piece', tris: 50000, tex: 2048, draws: 12, mats: 6, texMB: 32, fileMB: 10, animMB: 2, transp: 3, pivot: 'keep' },
};

export const DEVICES = {
  low: { name: 'Low-end phone', desc: 'Budget Android with about 3 GB RAM, or phones 5+ years old', trisMul: 0.5, texMul: 0.5, texCap: 1024, bones: 50, memMul: 0.5 },
  mid: { name: 'Mid-range phone', desc: 'A typical phone from the last 3-4 years', trisMul: 1, texMul: 1, texCap: 2048, bones: 75, memMul: 1 },
  high: { name: 'High-end phone', desc: 'Recent flagship iPhone, Galaxy S or Pixel', trisMul: 2, texMul: 2, texCap: 2048, bones: 120, memMul: 2 },
  quest: { name: 'Standalone VR', desc: 'Quest-class headset, every frame drawn twice at 72-90 fps', trisMul: 0.75, texMul: 1, texCap: 2048, bones: 75, memMul: 1 },
};

export const ENGINES = {
  unity: { name: 'Unity', compress: false, convexCollider: true },
  unreal: { name: 'Unreal Engine', compress: false },
  godot: { name: 'Godot 4', compress: false },
  roblox: { name: 'Roblox', compress: false, triCap: 20000, texCap: 1024 },
  web: { name: 'Web (three.js / Babylon)', compress: true },
};

const pot = (n) => 2 ** Math.round(Math.log2(Math.max(1, n)));

function pick(table, value, fallback, label) {
  const id = String(value || fallback).toLowerCase();
  if (!table[id]) throw new ApiError(400, `invalid_${label}`, `${label} must be one of: ${Object.keys(table).join(', ')}.`);
  return id;
}

/** The budget a model is fitted to, as an evaluate()-compatible target. */
export function budgetFor(roleId, deviceId, engineId) {
  const R = ROLES[roleId];
  const D = DEVICES[deviceId];
  const E = ENGINES[engineId];
  let tris = Math.round(R.tris * D.trisMul);
  if (E.triCap) tris = Math.min(tris, E.triCap);
  const texMax = Math.max(256, Math.min(D.texCap, E.texCap ?? Infinity, pot(R.tex * D.texMul)));
  return {
    id: `${roleId}/${deviceId}`,
    name: `${R.name} on a ${D.name.toLowerCase()} (${E.name})`,
    tris,
    texMax,
    draws: R.draws,
    mats: R.mats,
    texMB: R.texMB * D.memMul,
    fileMB: R.fileMB,
    bones: D.bones,
    transp: R.transp,
    animMB: R.animMB,
  };
}

/** Scores the model against every device class for one role: "which phones can run this?" */
export function deviceMatrix(stats, roleId = 'prop', engineId = 'unity') {
  return Object.keys(DEVICES).map((deviceId) => {
    const budget = budgetFor(roleId, deviceId, engineId);
    const e = evaluate(stats, budget);
    return { device: deviceId, name: DEVICES[deviceId].name, triangleBudget: budget.tris, maxTexture: budget.texMax, score: e.score, verdict: e.verdict };
  });
}

const LOD_KEEPS = [1, 0.5, 0.2];
const LOD_ERRORS = [0, 0.02, 0.08]; // far levels are seen small, so they may deviate more
const SCREEN_SIZES = [0.5, 0.2, 0.05]; // transition points as a fraction of screen height
const CULL_BELOW = 0.02;

function dimensions(document) {
  const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];
  if (!scene) return null;
  const { min, max } = getBounds(scene);
  if (!min.every(Number.isFinite)) return null;
  return max.map((v, i) => Number((v - min[i]).toFixed(4)));
}

async function step(steps, warnings, tool, label, fn) {
  try {
    const detail = await fn();
    if (detail !== false) steps.push({ step: label, tool, detail: detail || null });
  } catch (err) {
    warnings.push(`${label} was skipped: ${err?.message || 'failed'}.`);
  }
}

function triangleCount(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) if (prim.getMode() === Primitive.Mode.TRIANGLES) total += getGLPrimitiveCount(prim);
  }
  return total;
}

/**
 * Topology-ignoring simplification (meshoptimizer simplifySloppy). The
 * regular simplifier stops at UV seams and part outlines; far LODs and
 * collision shapes don't need either, so this always reaches the target.
 */
async function sloppyTo(document, targetTris) {
  await MeshoptSimplifier.ready;
  const total = triangleCount(document);
  if (!total) return;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      if (prim.getMode() !== Primitive.Mode.TRIANGLES || !indices || !position || position.getNormalized()) continue;
      const tris = indices.getCount() / 3;
      const target = Math.max(12, Math.floor((tris / total) * targetTris));
      if (target >= tris) continue;
      const positions = position.getArray() instanceof Float32Array ? position.getArray() : Float32Array.from(position.getArray());
      const [out] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(indices.getArray()), positions, 3, null, target * 3, 1);
      if (!out.length) continue;
      prim.setIndices(document.createAccessor().setType('SCALAR').setArray(Uint32Array.from(out)).setBuffer(indices.getBuffer()));
      compactPrimitive(prim);
    }
  }
  await document.transform(prune());
}

/** Regular simplification first; looser passes only if it stalls well short of the target. */
async function fitTo(document, targetTris, { error = 0.01, allowSloppy = false } = {}) {
  const passes = [];
  let current = triangleCount(document);
  if (current <= targetTris) return { triangles: current, passes, warnings: [] };
  const warnings = [];
  const first = await reduce(document, targetTris / current, true, error);
  warnings.push(...first.warnings);
  current = triangleCount(document);
  passes.push('quality');
  if (current > targetTris * 1.25) {
    await reduce(document, targetTris / current, false, Math.max(error, 0.05));
    current = triangleCount(document);
    passes.push('unlocked borders');
  }
  if (allowSloppy && current > targetTris * 1.25) {
    await sloppyTo(document, targetTris);
    current = triangleCount(document);
    passes.push('coarse');
  }
  return { triangles: current, passes, warnings: current > targetTris * 1.25 ? warnings : [] };
}

async function buildCollision(baseBytes, targetTris) {
  const document = await readDocument(baseBytes);
  const root = document.getRoot();
  for (const anim of root.listAnimations()) anim.dispose();
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) if (semantic !== 'POSITION') prim.setAttribute(semantic, null);
      for (const target of prim.listTargets()) target.dispose();
      prim.setMaterial(null);
    }
  }
  for (const material of root.listMaterials()) material.dispose();
  await document.transform(prune(), dedup(), flatten(), join({ keepNamed: false }), weld());
  await fitTo(document, targetTris, { error: 0.25, allowSloppy: true });
  const output = await writeDocument(document);
  return { output, triangles: analyseGlb(output).triangles };
}

export async function gameReady(bytes, params, filename) {
  const roleId = pick(ROLES, params.role, 'prop', 'role');
  const deviceId = pick(DEVICES, params.device, 'mid', 'device');
  const engineId = pick(ENGINES, params.engine, 'unity', 'engine');
  const R = ROLES[roleId];
  const E = ENGINES[engineId];
  const budget = budgetFor(roleId, deviceId, engineId);
  const pivot = String(params.pivot || R.pivot).toLowerCase();
  if (!['bottom', 'center', 'keep'].includes(pivot)) throw new ApiError(400, 'invalid_pivot', 'pivot must be bottom, center or keep.');
  const keepAnimations = bool(params.keepAnimations, true);
  const wantLods = bool(params.lods, true);
  const wantCollision = bool(params.collision, true);
  const compress = bool(params.compress, E.compress);
  const name = String(filename || 'model').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 60) || 'model';

  const before = analyseGlb(bytes);
  if (before.triangles === 0) throw new ApiError(422, 'no_geometry', 'This model contains no triangle geometry.');
  const document = await readDocument(bytes);
  const steps = [];
  const warnings = [];
  const skinned = before.skins > 0;

  await step(steps, warnings, 'optimise-glb', 'Clean up', async () => {
    await document.transform(dedup(), prune({ keepExtras: true }));
    return 'removed duplicate and unused data';
  });

  if (before.animations) {
    if (!keepAnimations) {
      await step(steps, warnings, 'strip-animations', 'Strip animations', async () => {
        for (const a of document.getRoot().listAnimations()) a.dispose();
        await document.transform(prune());
        return `removed ${before.animations} clip(s)`;
      });
    } else {
      await step(steps, warnings, 'animation-optimiser', 'Optimise animation keyframes', async () => {
        await document.transform(resample());
        return 'removed redundant keyframes';
      });
    }
  }

  await step(steps, warnings, 'glb-builder', 'Merge parts to cut draw calls', async () => {
    // Skeletons and animated nodes stay where they are: flatten() leaves them in place.
    await document.transform(flatten(), join({ keepNamed: false }), prune());
    const draws = analyseGlb(await writeDocument(document)).drawCalls;
    return draws < before.drawCalls ? `${before.drawCalls} → ${draws} draw calls` : 'no compatible parts to merge';
  });

  const dims = dimensions(document);
  if (dims) {
    const largest = Math.max(...dims);
    if (largest > 500) warnings.push(`The model is ${largest.toFixed(0)} m across. It was probably exported in centimetres; scale it by 0.01 in your engine.`);
    else if (largest > 0 && largest < 0.01) warnings.push(`The model is only ${(largest * 1000).toFixed(1)} mm across. It may have been exported at the wrong scale.`);
  }

  let current = analyseGlb(await writeDocument(document)).triangles;
  if (current > budget.tris) {
    await step(steps, warnings, 'reduce-polys', 'Reduce triangles', async () => {
      const result = await fitTo(document, budget.tris);
      warnings.push(...result.warnings);
      const after = result.triangles;
      if (after > budget.tris * 1.25) warnings.push(`LOD0 stopped at ${after.toLocaleString('en-GB')} triangles without visible damage; the ${budget.tris.toLocaleString('en-GB')} budget needs manual retopology or a higher device class.`);
      const out = `${current.toLocaleString('en-GB')} → ${after.toLocaleString('en-GB')} triangles (budget ${budget.tris.toLocaleString('en-GB')})`;
      current = after;
      return out;
    });
  } else {
    steps.push({ step: 'Reduce triangles', tool: 'reduce-polys', detail: `already inside the ${budget.tris.toLocaleString('en-GB')} triangle budget` });
  }

  await step(steps, warnings, 'texture-resizer', 'Fit textures', async () => {
    const changed = await downscaleTextures(document, budget.texMax, warnings);
    return changed.length ? `${changed.length} texture(s) resized to ≤${budget.texMax}px, power of two` : `all textures already ≤${budget.texMax}px and power of two`;
  });

  const wantKtx2 = bool(params.ktx2, false);
  if (wantKtx2 && (engineId === 'unreal' || engineId === 'roblox')) {
    warnings.push(`KTX2 textures were not applied: ${E.name}'s importer does not read KHR_texture_basisu. It compresses textures itself on import.`);
  } else if (wantKtx2) {
    await step(steps, warnings, 'ktx2-texture-encoder', 'Compress textures to KTX2', async () => {
      const { texturesToKtx2 } = await import('./ktx2.js');
      const done = await texturesToKtx2(document, { mode: 'auto', warnings });
      return done.length ? `${done.length} texture(s) → KTX2 (${[...new Set(done.map((t) => t.mode.toUpperCase()))].join(' + ')}), stay compressed in GPU memory` : 'no PNG/JPEG textures to convert';
    });
  }

  // Last geometry change, so simplification can't shift the model off its pivot.
  if (pivot !== 'keep') {
    await step(steps, warnings, null, 'Set pivot', async () => {
      await document.transform(center({ pivot: pivot === 'bottom' ? 'below' : 'center' }));
      return pivot === 'bottom' ? 'origin moved to the base centre, so the model sits on the ground at (0,0,0)' : 'origin moved to the centre';
    });
  }

  // LOD0 before any transport compression: every LOD and the collider are cut from this.
  const baseBytes = await writeDocument(document);
  await readDocument(baseBytes);

  const files = [];
  const levels = wantLods ? LOD_KEEPS : [1];
  for (let i = 0; i < levels.length; i += 1) {
    const keep = levels[i];
    let output = baseBytes;
    if (keep < 1 || compress) {
      const doc = await readDocument(baseBytes);
      if (keep < 1) {
        const fit = await fitTo(doc, Math.round(triangleCount(doc) * keep), { error: LOD_ERRORS[i], allowSloppy: true });
        if (fit.passes.includes('coarse')) warnings.push(`LOD${i} needed coarse simplification to reach ${Math.round(keep * 100)}%; check it at its switch distance.`);
      }
      if (compress) await compressMeshopt(doc);
      output = await writeDocument(doc);
    }
    const stats = analyseGlb(output);
    files.push({ file: `${name}_LOD${i}.glb`, kind: 'lod', level: i, keep, screenSize: SCREEN_SIZES[i], triangles: stats.triangles, bytes: output.byteLength, output });
  }
  if (wantLods) steps.push({ step: 'Build LOD chain', tool: 'generate-lods', detail: files.map((f) => `LOD${f.level} ${f.triangles.toLocaleString('en-GB')} tris`).join(', ') });
  if (compress) steps.push({ step: 'Compress for download', tool: 'optimise-glb', detail: 'Meshopt (EXT_meshopt_compression)' });

  if (wantCollision && !skinned) {
    await step(steps, warnings, 'reduce-polys', 'Build collision mesh', async () => {
      const lod0Tris = files[0].triangles;
      // Unity convex MeshColliders are limited to 255 triangles.
      const target = E.convexCollider ? 250 : Math.min(1000, Math.max(150, Math.round(lod0Tris * 0.05)));
      const { output, triangles } = await buildCollision(baseBytes, target);
      files.push({ file: `${name}_collision.glb`, kind: 'collision', triangles, bytes: output.byteLength, output });
      if (E.convexCollider && triangles > 255) warnings.push(`The collision mesh has ${triangles} triangles; Unity convex colliders allow 255, so use it as a non-convex (static) collider or add primitive colliders.`);
      return `${triangles.toLocaleString('en-GB')} triangles, positions only`;
    });
  } else if (wantCollision) {
    steps.push({ step: 'Build collision mesh', tool: 'rig-inspector', detail: 'skipped: skinned characters normally use capsule colliders' });
  }

  const after = analyseGlb(files[0].output);
  const evaluationBefore = evaluate(before, budget);
  const evaluationAfter = evaluate(after, budget);
  const report = {
    asset: name,
    role: roleId,
    device: deviceId,
    engine: engineId,
    budget,
    dimensionsMetres: dims,
    steps,
    before: { stats: before, evaluation: evaluationBefore },
    after: { stats: after, evaluation: evaluationAfter },
    devices: deviceMatrix(after, roleId, engineId),
    files: files.map(({ output, ...f }) => f),
    lodTransitions: wantLods ? { screenSizes: SCREEN_SIZES, cullBelow: CULL_BELOW } : null,
    warnings,
  };
  return { files, report, text: reportText(report), importNotes: importNotes(report) };
}

const kb = (b) => (b >= MB ? `${(b / MB).toFixed(2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const n = (v) => Number(v).toLocaleString('en-GB');

export function reportText(r) {
  const { before, after } = r;
  const lines = [
    `AssetBench game-ready report: ${r.asset}`,
    `Fitted for: ${r.budget.name}`,
    '',
    `                 before          after       budget`,
    `Triangles   ${n(before.stats.triangles).padStart(12)}   ${n(after.stats.triangles).padStart(12)}   ${n(r.budget.tris).padStart(10)}`,
    `Draw calls  ${n(before.stats.drawCalls).padStart(12)}   ${n(after.stats.drawCalls).padStart(12)}   ${n(r.budget.draws).padStart(10)}`,
    `Largest tex ${`${before.stats.largestTexture}px`.padStart(12)}   ${`${after.stats.largestTexture}px`.padStart(12)}   ${`${r.budget.texMax}px`.padStart(10)}`,
    `Texture mem ${kb(before.stats.textureMemoryBytes).padStart(12)}   ${kb(after.stats.textureMemoryBytes).padStart(12)}   ${kb(r.budget.texMB * MB).padStart(10)}`,
    `File size   ${kb(before.stats.fileBytes).padStart(12)}   ${kb(after.stats.fileBytes).padStart(12)}`,
    '',
    `Mobile score: ${before.evaluation.score}/100 → ${after.evaluation.score}/100 (${after.evaluation.verdict})`,
    '',
    'Pipeline:',
    ...r.steps.map((s, i) => `  ${String(i + 1).padStart(2)}. ${s.step}: ${s.detail ?? 'done'}`),
    '',
    'Runs on:',
    ...r.devices.map((d) => `  ${d.name.padEnd(18)} ${String(d.score).padStart(3)}/100  ${d.verdict}`),
  ];
  if (r.dimensionsMetres) lines.push('', `Size: ${r.dimensionsMetres.map((v) => `${v} m`).join(' x ')} (W x H x D)`);
  const open = after.evaluation.checks.filter((c) => c.status !== 'pass');
  if (open.length) lines.push('', 'Still over budget:', ...open.map((c) => `  - ${c.name}: ${n(c.value)} (budget ${n(c.budget)})`));
  if (r.warnings.length) lines.push('', 'Warnings:', ...r.warnings.map((w) => `  - ${w}`));
  return lines.join('\n');
}

function importNotes(r) {
  const lods = r.files.filter((f) => f.kind === 'lod');
  const collision = r.files.find((f) => f.kind === 'collision');
  const pct = (v) => `${Math.round(v * 100)}%`;
  const lodList = lods.map((f) => `- ${f.file}: ${n(f.triangles)} triangles${f.level ? `, switch at ${pct(f.screenSize)} of screen height` : ''}`).join('\n');
  const common = `# Importing ${r.asset} into ${ENGINES[r.engine].name}\n\nFitted for: ${r.budget.name}.\n\n## Files\n${lodList}\n${collision ? `- ${collision.file}: ${n(collision.triangles)}-triangle collision mesh (positions only)\n` : ''}- REPORT.txt / report.json: what was changed and why\n\nThe pivot is ${r.steps.some((s) => s.step === 'Set pivot') ? 'at the base centre, so the model sits on the ground at the origin' : 'unchanged from the source'}. Units are metres (glTF standard).\n\n`;
  const lodLine = lods.length > 1 ? lods.slice(1).map((f) => `LOD${f.level} at ${pct(f.screenSize)}`).join(', ') + `, cull below ${pct(r.lodTransitions.cullBelow)}` : '';
  const perEngine = {
    unity: `## Unity
1. Unity reads .glb through the glTFast package: Window > Package Manager > + > Add package by name > \`com.unity.cloud.gltfast\`.${r.steps.some((s) => s.step.includes('KTX2')) ? ' The textures are KTX2, so also add \`com.unity.cloud.ktx\`.' : ''}
2. Drag the folder into Assets. Each .glb becomes a prefab.
${lods.length > 1 ? `3. Create an empty GameObject, add a **LOD Group**, and drop the LOD0/LOD1/LOD2 prefabs into the matching slots as children.\n4. Set the transitions: ${lodLine}.\n` : ''}${collision ? `${lods.length > 1 ? '5' : '3'}. Add a **Mesh Collider** to the root and assign the mesh from ${collision.file}. Under 255 triangles it can be marked Convex (needed for Rigidbodies).\n` : ''}`,
    unreal: `## Unreal Engine 5
1. Content Browser > Import, choose ${lods[0].file}. UE5 imports glTF directly as a Static Mesh${r.after.stats.skins ? ' (Skeletal Mesh when skinned)' : ''}.
${lods.length > 1 ? `2. Open the mesh, then in LOD Settings set Number of LODs to ${lods.length} and use **LOD Import > Import LOD Level 1/2** with the LOD1/LOD2 files.\n3. Screen sizes: LOD0 1.0, ${lods.slice(1).map((f) => `LOD${f.level} ${f.screenSize}`).join(', ')}.\n` : ''}${collision ? `${lods.length > 1 ? '4' : '2'}. For collision, import ${collision.file} as its own Static Mesh and set it as the **Complex Collision Mesh** in the Static Mesh editor, or add simple shapes from the Collision menu.\n` : ''}`,
    godot: `## Godot 4
1. Copy the folder into your project. Godot imports .glb natively.
2. Godot 4 already generates its own mesh LODs on import, so ${lods[0].file} alone is often enough. To use these LODs instead, place each as a child and set **Visibility Range** on each (LOD0 near, LOD2 far).
${collision ? `3. Open ${collision.file}'s Advanced Import Settings, select the mesh and enable **Physics** (Static Body, Trimesh shape), or use it as a ConcavePolygonShape3D.\n` : ''}`,
    roblox: `## Roblox Studio
1. Use **File > Import 3D** and choose ${lods[0].file}. If your Studio version does not accept .glb, open it in Blender and export FBX.
2. Roblox handles distance LOD itself (MeshPart RenderFidelity = Automatic), so import LOD0 only.
3. Each MeshPart is limited to ${n(20000)} triangles and textures to 1024px; this pack is already inside both.
${collision ? `4. Set the MeshPart's CollisionFidelity to Hull or Box for best performance; ${collision.file} shows the shape budget to aim for.\n` : ''}`,
    web: `## Web (three.js)
1. The files use Meshopt compression: \`loader.setMeshoptDecoder(MeshoptDecoder)\` from \`three/examples/jsm/libs/meshopt_decoder.module.js\`.
${lods.length > 1 ? '2. Load each LOD and add them to a `THREE.LOD`, e.g. `lod.addLevel(lod0, 0); lod.addLevel(lod1, 10); lod.addLevel(lod2, 30);` (distances in metres, tune for your camera).\n' : ''}`,
  };
  return common + perEngine[r.engine];
}
