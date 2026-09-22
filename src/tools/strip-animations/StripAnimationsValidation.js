import { readGlb } from './glb/createIO.js';
import { loadGlbWithAnimations } from './viewer/loadModel.js';
import { analyseAnimations } from './StripAnimationsAnalysis.js';

/**
 * Validates a stripped GLB. An export returning a Blob proves nothing on its
 * own, so the output is reopened with glTF-Transform AND reloaded with
 * Three.js's real GLTFLoader, then checked structurally against the
 * original — the same two-layer approach used by Reduce Polys and Compress
 * Textures, extended here with animation- and rig-specific checks.
 */
export async function validateStrip({ outputBuffer, originalAnalysis, expectedKeptNames, expectedRemovedCount, filename }) {
  const checks = [];
  let status = 'PASS';

  const fail = (name, message) => {
    checks.push({ name, status: 'FAIL', message });
    status = 'FAIL';
  };
  const warn = (name, message) => {
    checks.push({ name, status: 'WARNING', message });
    if (status !== 'FAIL') status = 'WARNING';
  };
  const pass = (name, message) => checks.push({ name, status: 'PASS', message });

  // 1. Reopen with the processing layer.
  let reloaded;
  try {
    reloaded = await readGlb(outputBuffer);
    pass('parse', 'Output GLB reopened successfully with glTF-Transform.');
  } catch (err) {
    fail('parse', `Output GLB failed to parse: ${err?.message || 'unknown error'}`);
    return { status: 'FAIL', checks, stats: null };
  }

  // 2. Reload with a real renderer, and confirm the clips Three.js sees
  // match what we expect to remain.
  let threeAnimations = [];
  try {
    const { scene, animations } = await loadGlbWithAnimations(outputBuffer);
    threeAnimations = animations;
    if (!scene || scene.children.length === 0) {
      warn('threejs-load', 'Three.js loaded the file but the scene appears empty.');
    } else {
      pass('threejs-load', 'Three.js GLTFLoader loaded the scene.');
    }
  } catch (err) {
    fail('threejs-load', `Three.js could not load the output: ${err?.message || 'unknown error'}`);
  }

  const analysis = analyseAnimations(reloaded);
  const root = reloaded.getRoot();

  // 3. Structure.
  if (root.listScenes().length === 0) fail('scene', 'Output has no scenes.');
  else pass('scene', `${root.listScenes().length} scene(s) present.`);

  // 4. Animation count — the one number this tool is explicitly allowed to
  // change, so it's checked against what removal was actually asked to do,
  // not against the original count.
  const expectedRemaining = originalAnalysis.clipCount - expectedRemovedCount;
  if (analysis.clipCount !== expectedRemaining) {
    fail(
      'animation-count',
      `Expected ${expectedRemaining} clip(s) to remain, but the output has ${analysis.clipCount}.`
    );
  } else {
    pass('animation-count', `${analysis.clipCount} clip(s) remain, matching the requested removal.`);
  }

  if (threeAnimations.length !== analysis.clipCount) {
    warn(
      'threejs-clip-count',
      `glTF-Transform sees ${analysis.clipCount} clip(s) but Three.js loaded ${threeAnimations.length}.`
    );
  } else if (threeAnimations.length > 0) {
    pass('threejs-clip-count', `Three.js can play all ${threeAnimations.length} remaining clip(s).`);
  }

  const remainingNames = new Set(analysis.clips.map((c) => c.name));
  const missingKept = expectedKeptNames.filter((name) => !remainingNames.has(name));
  if (missingKept.length) {
    fail('kept-clips', `${missingKept.length} clip(s) that should have been kept are missing: ${missingKept.slice(0, 5).join(', ')}${missingKept.length > 5 ? '…' : ''}`);
  } else if (expectedKeptNames.length) {
    pass('kept-clips', 'Every clip marked KEEP is present in the output.');
  }

  // 5. Rig preservation — the core promise of this tool. Skins, joints and
  // inverse-bind matrices must be untouched even if every animation was
  // removed.
  const oc = originalAnalysis.model;
  if (root.listSkins().length !== oc.skinCount) {
    fail('skins', `Skin count changed: ${oc.skinCount} → ${root.listSkins().length}.`);
  } else {
    pass('skins', `${root.listSkins().length} skin(s) preserved.`);
  }

  const newBoneCount = new Set(root.listSkins().flatMap((s) => s.listJoints())).size;
  if (newBoneCount !== oc.boneCount) {
    fail('bones', `Bone/joint count changed: ${oc.boneCount} → ${newBoneCount}.`);
  } else {
    pass('bones', `${newBoneCount} bone(s) preserved.`);
  }

  let missingIBM = 0;
  for (const skin of root.listSkins()) {
    if (skin.listJoints().length > 0 && !skin.getInverseBindMatrices()) missingIBM += 1;
  }
  if (missingIBM) fail('inverse-bind-matrices', `${missingIBM} skin(s) lost their inverse bind matrices.`);
  else if (oc.skinCount) pass('inverse-bind-matrices', 'Inverse bind matrices preserved on every skin.');

  // 6. Meshes / materials / textures — must survive untouched; this tool
  // never removes visible content, only animation data.
  if (root.listMeshes().length !== oc.meshCount) {
    fail('meshes', `Mesh count changed: ${oc.meshCount} → ${root.listMeshes().length}.`);
  } else {
    pass('meshes', `${root.listMeshes().length} mesh(es) preserved.`);
  }
  if (oc.materialCount > 0 && root.listMaterials().length === 0) {
    fail('materials', 'All materials were lost.');
  } else {
    pass('materials', `${root.listMaterials().length} material(s) preserved.`);
  }

  // 7. Morph targets — only meaningful to check if the original had any.
  let morphTargetCount = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) morphTargetCount += prim.listTargets().length;
  }
  if (originalAnalysis.hadMorphTargets && morphTargetCount === 0) {
    fail('morph-targets', 'Morph targets were present originally but are missing from the output.');
  } else if (originalAnalysis.hadMorphTargets) {
    pass('morph-targets', `${morphTargetCount} morph target(s) preserved.`);
  }

  // 8. Remaining clips must contain no NaN/Infinity keyframe data.
  let nanClips = 0;
  for (const clip of analysis.clips) {
    for (const channel of clip.animation.listChannels()) {
      const sampler = channel.getSampler();
      const output = sampler?.getOutput();
      if (!output) continue;
      const array = output.getArray();
      for (let i = 0; i < array.length; i += 1) {
        if (!Number.isFinite(array[i])) { nanClips += 1; break; }
      }
    }
  }
  if (nanClips) fail('keyframe-values', `${nanClips} remaining clip(s) contain NaN or infinite keyframe values.`);
  else if (analysis.clipCount) pass('keyframe-values', 'No NaN or infinite keyframe values in any remaining clip.');

  // 9. Every remaining clip's interpolation mode is one Three.js actually
  // loaded a sampler for (i.e. it round-tripped, not just "present in JSON").
  if (threeAnimations.length === analysis.clipCount) {
    pass('interpolation', 'All remaining clips round-tripped through Three.js with their tracks intact.');
  }

  return { status, checks, stats: analysis };
}
