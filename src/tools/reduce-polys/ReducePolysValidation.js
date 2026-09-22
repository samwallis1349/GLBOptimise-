import { Primitive } from '@gltf-transform/core';
import { getGLPrimitiveCount } from '@gltf-transform/functions';
import { readGlb } from './glb/createIO.js';
import { loadGlbForPreview } from './viewer/loadModel.js';
import { analyseGeometry } from './ReducePolysAnalysis.js';

/**
 * Validation for a reduced GLB.
 *
 * An export returning a Blob proves nothing, so the output is reopened with
 * glTF-Transform, reloaded with Three.js's real GLTFLoader, and then checked
 * structurally against the original.
 *
 * This is deliberately separate from glb/validate.js: that one assumes an
 * optimiser where geometry should be preserved. Here the triangle count is
 * *supposed* to change, and failing to change it is itself a finding.
 */
export async function validateReduction({ outputBuffer, originalDocument, originalStats, filename }) {
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
    pass('parse', 'Output GLB reopened successfully.');
  } catch (err) {
    fail('parse', `Output GLB failed to parse: ${err?.message || 'unknown error'}`);
    return { status: 'FAIL', checks, stats: null };
  }

  // 2. Reload with a real renderer.
  try {
    const scene = await loadGlbForPreview(outputBuffer);
    if (!scene || scene.children.length === 0) {
      warn('threejs-load', 'Three.js loaded the file but the scene appears empty.');
    } else {
      pass('threejs-load', 'Three.js GLTFLoader loaded the scene.');
    }
  } catch (err) {
    fail('threejs-load', `Three.js could not load the output: ${err?.message || 'unknown error'}`);
  }

  const root = reloaded.getRoot();
  const stats = analyseGeometry(reloaded);

  // 3. Structure.
  if (root.listScenes().length === 0) fail('scene', 'Output has no scenes.');
  else pass('scene', `${root.listScenes().length} scene(s) present.`);

  if (stats.meshCount === 0) fail('meshes', 'All meshes were lost.');
  else pass('meshes', `${stats.meshCount} mesh(es) resolved.`);

  const originalRoot = originalDocument.getRoot();
  if (originalRoot.listMaterials().length > 0 && root.listMaterials().length === 0) {
    fail('materials', 'All materials were lost.');
  } else {
    pass('materials', `${root.listMaterials().length} material(s) preserved.`);
  }

  // 4. Attributes that must survive.
  const missingPositions = [];
  const lostNormals = [];
  const lostUVs = [];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (!prim.getAttribute('POSITION')) missingPositions.push(mesh.getName());
      if (!prim.getAttribute('NORMAL')) lostNormals.push(mesh.getName());
      if (!prim.getAttribute('TEXCOORD_0')) lostUVs.push(mesh.getName());
    }
  }
  if (missingPositions.length) fail('attributes', `Missing POSITION on: ${missingPositions.join(', ')}`);
  else pass('attributes', 'POSITION present on every primitive.');

  const origMissingNormals = originalStats.capabilities.missingNormals;
  if (lostNormals.length > origMissingNormals) {
    warn('normals', `${lostNormals.length - origMissingNormals} primitive(s) lost normals.`);
  } else {
    pass('normals', 'Normals preserved.');
  }
  const origMissingUVs = originalStats.capabilities.missingUVs;
  if (lostUVs.length > origMissingUVs) {
    warn('uvs', `${lostUVs.length - origMissingUVs} primitive(s) lost UVs.`);
  } else {
    pass('uvs', 'UVs preserved.');
  }

  // 5. Skins, animations, morph targets.
  const oc = originalStats.capabilities;
  if (oc.isSkinned) {
    if (root.listSkins().length !== oc.skinCount) {
      fail('skins', `Skin count changed: ${oc.skinCount} → ${root.listSkins().length}.`);
    } else {
      const hasJoints = root.listMeshes().every((m) =>
        m.listPrimitives().every((p) => !p.getAttribute('POSITION') || p.getAttribute('JOINTS_0'))
      );
      if (!hasJoints) fail('skins', 'Joint/weight attributes were lost during simplification.');
      else pass('skins', `${root.listSkins().length} skin(s) with joint weights preserved.`);
    }
  }
  if (oc.isAnimated) {
    if (root.listAnimations().length !== oc.animationCount) {
      fail('animations', `Animation count changed: ${oc.animationCount} → ${root.listAnimations().length}.`);
    } else {
      pass('animations', `${root.listAnimations().length} animation(s) preserved.`);
    }
  }
  if (oc.hasMorphTargets) {
    if (stats.capabilities.morphTargetCount === 0) {
      fail('morph-targets', 'Morph targets were present originally but are missing from the output.');
    } else {
      // A target whose accessor no longer matches the base mesh is corrupt.
      let mismatched = 0;
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          const base = prim.getAttribute('POSITION')?.getCount();
          for (const target of prim.listTargets()) {
            const count = target.getAttribute('POSITION')?.getCount();
            if (count !== undefined && base !== undefined && count !== base) mismatched += 1;
          }
        }
      }
      if (mismatched) fail('morph-targets', `${mismatched} morph target(s) no longer match their base mesh vertex count.`);
      else pass('morph-targets', `${stats.capabilities.morphTargetCount} morph target(s) resized in step with the base mesh.`);
    }
  }

  // 6. Geometry integrity: indices in range, no NaN.
  let badIndices = 0;
  let nonFinite = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (!position) continue;
      const count = position.getCount();
      const indices = prim.getIndices();
      if (indices) {
        const array = indices.getArray();
        for (let i = 0; i < array.length; i += 1) {
          if (array[i] >= count) { badIndices += 1; break; }
        }
      }
      const positions = position.getArray();
      for (let i = 0; i < positions.length; i += 1) {
        if (!Number.isFinite(positions[i])) { nonFinite += 1; break; }
      }
    }
  }
  if (badIndices) fail('indices', `${badIndices} primitive(s) contain out-of-range indices.`);
  else pass('indices', 'All indices are within range.');
  if (nonFinite) fail('geometry', `${nonFinite} primitive(s) contain NaN or infinite vertex positions.`);
  else pass('geometry', 'No NaN or infinite vertex positions.');

  // 7. Did the triangle count actually change?
  if (stats.triangleCount === originalStats.triangleCount) {
    warn('reduction', 'Triangle count is unchanged — no geometry was actually removed.');
  } else if (stats.triangleCount > originalStats.triangleCount) {
    warn('reduction', `Triangle count increased (${originalStats.triangleCount} → ${stats.triangleCount}).`);
  } else {
    pass(
      'reduction',
      `Triangle count reduced ${originalStats.triangleCount.toLocaleString()} → ${stats.triangleCount.toLocaleString()}.`
    );
  }

  return { status, checks, stats };
}

export { Primitive, getGLPrimitiveCount };
