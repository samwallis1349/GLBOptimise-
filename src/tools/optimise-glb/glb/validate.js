import { analyseGlb } from './analyse.js';
import { loadGlbForPreview } from '../viewer/loadModel.js';

const DURATION_TOLERANCE = 0.05; // seconds

/**
 * Mandatory post-export validation. Never trust that a successful export
 * means a successful optimisation: reopen the output with glTF-Transform,
 * reload it with Three.js's real GLTFLoader, then compare protected
 * structures against the original. Returns { status, checks, analysis }.
 *
 * status is one of 'PASS' | 'WARNING' | 'FAIL'. Any lost protected content
 * (animations, skins, morph targets that the original had and the
 * classification marked as present) forces FAIL — the caller must not
 * present that output as successful.
 */
export async function validateOptimisedGlb(optimisedBuffer, originalAnalysis, classification, filename) {
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

  // Step 1: reopen with the glTF-Transform processing layer.
  let optimisedAnalysis = null;
  try {
    optimisedAnalysis = await analyseGlb(optimisedBuffer, {
      filename,
      bytes: optimisedBuffer.byteLength,
    });
    pass('parse', 'Output GLB parsed successfully.');
  } catch (err) {
    fail('parse', `Output GLB failed to parse: ${err?.message || 'unknown error'}`);
    return { status: 'FAIL', checks, analysis: null };
  }

  // Step 2: reload with Three.js's real GLTFLoader.
  try {
    const scene = await loadGlbForPreview(optimisedBuffer);
    if (!scene || scene.children.length === 0) {
      warn('threejs-load', 'Three.js loaded the file but the scene appears empty.');
    } else {
      pass('threejs-load', 'Three.js GLTFLoader loaded the scene successfully.');
    }
  } catch (err) {
    fail('threejs-load', `Three.js could not load the output GLB: ${err?.message || 'unknown error'}`);
  }

  // Step 3: scene / mesh sanity.
  if (optimisedAnalysis.scene.sceneCount === 0) {
    fail('scene', 'Output GLB has no scenes.');
  } else if (originalAnalysis.geometry.meshCount > 0 && optimisedAnalysis.geometry.meshCount === 0) {
    fail('meshes', 'All meshes were lost during optimisation.');
  } else {
    pass('meshes', `${optimisedAnalysis.geometry.meshCount} mesh(es) resolved.`);
  }

  // Step 4: animations must survive if the model was classified as animated.
  if (classification.isAnimated) {
    const before = originalAnalysis.animations.items;
    const after = optimisedAnalysis.animations.items;
    if (after.length !== before.length) {
      fail(
        'animations',
        `Animation count changed: ${before.length} → ${after.length}. Protected animations must not be lost.`
      );
    } else {
      const durationMismatch = before.some((b, i) => {
        const a = after[i];
        return !a || Math.abs(a.duration - b.duration) > DURATION_TOLERANCE;
      });
      if (durationMismatch) {
        warn('animations', 'Animation durations shifted slightly after optimisation.');
      } else {
        pass('animations', `${after.length} animation(s) preserved with matching durations.`);
      }
    }
  }

  // Step 5: skins/rig must survive if the model was classified as skinned.
  if (classification.isSkinned) {
    const beforeSkins = originalAnalysis.rigging.skinCount;
    const afterSkins = optimisedAnalysis.rigging.skinCount;
    const beforeJoints = originalAnalysis.rigging.jointCount;
    const afterJoints = optimisedAnalysis.rigging.jointCount;
    if (afterSkins !== beforeSkins || afterJoints !== beforeJoints) {
      fail(
        'rigging',
        `Skin/joint structure changed (skins ${beforeSkins}→${afterSkins}, joints ${beforeJoints}→${afterJoints}). Rigging must be preserved.`
      );
    } else {
      pass('rigging', `${afterSkins} skin(s), ${afterJoints} joint(s) preserved.`);
    }
  }

  // Step 6: morph targets must survive if present originally.
  if (classification.hasMorphTargets) {
    if (!optimisedAnalysis.morphTargets.present) {
      fail('morph-targets', 'Morph targets were present in the original but are missing from the output.');
    } else {
      pass('morph-targets', `${optimisedAnalysis.morphTargets.count} morph target(s) preserved.`);
    }
  }

  // Step 7: transparency must survive if present originally.
  if (classification.hasTransparency && !optimisedAnalysis.materials.hasTransparency) {
    fail('transparency', 'Transparent materials in the original are no longer transparent in the output.');
  } else if (classification.hasTransparency) {
    pass('transparency', 'Transparency preserved.');
  }

  // Step 8: material/texture reference sanity.
  if (originalAnalysis.materials.count > 0 && optimisedAnalysis.materials.count === 0) {
    fail('materials', 'All materials were lost during optimisation.');
  }
  const brokenTextures = optimisedAnalysis.textures.items.filter((t) => !t.width || !t.height);
  if (brokenTextures.length > 0) {
    warn('textures', `${brokenTextures.length} texture(s) in the output have no readable dimensions.`);
  } else if (optimisedAnalysis.textures.count > 0) {
    pass('textures', `${optimisedAnalysis.textures.count} texture(s) resolved with valid dimensions.`);
  }

  return { status, checks, analysis: optimisedAnalysis };
}
