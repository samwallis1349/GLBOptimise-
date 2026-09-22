import { CLASSIFICATION_FLAGS } from '../glb/classify.js';

/**
 * Decides which requested operations are safe for one model's classification.
 * This is the single choke point every transformation passes through — nothing
 * in processing/*.js applies an operation the caller didn't first clear here,
 * and every refusal is recorded with a reason rather than silently dropped.
 */
export function applySafetyRules(plan, classification) {
  const skipped = [];
  const allowed = {
    cleanup: plan.cleanup,
    deduplicate: plan.deduplicate,
    textures: { ...plan.textures },
    geometry: { ...plan.geometry },
    animations: { ...plan.animations },
    compression: { ...plan.compression },
  };

  const sensitiveGeometry =
    classification.isSkinned || classification.hasMorphTargets;

  // Mesh simplification rewrites topology. meshoptimizer carries joint and
  // weight attributes through, but it cannot guarantee morph-target deltas
  // stay aligned, and on a rigged mesh a collapsed edge across a joint seam
  // deforms badly. Not worth the risk on assets this tool promises to preserve.
  if (plan.geometry.simplify && sensitiveGeometry) {
    allowed.geometry.simplify = false;
    skipped.push({
      operation: 'geometry.simplify',
      reason: classification.hasMorphTargets
        ? 'Model has morph targets, whose per-vertex deltas cannot be guaranteed to survive topology changes. Geometry was left intact.'
        : 'Model is skinned, and simplification across joint seams can deform the rig. Geometry was left intact.',
    });
  }

  // Quantization reduces attribute precision. On a skinned mesh that precision
  // loss shows up as visible drift once the rig animates, and morph deltas
  // suffer the same way.
  if (plan.geometry.quantize && sensitiveGeometry) {
    allowed.geometry.quantize = false;
    skipped.push({
      operation: 'geometry.quantize',
      reason:
        'Model is skinned or has morph targets, where reduced vertex precision shows up as drift during animation. Attributes were left at full precision.',
    });
  }

  return { allowed, skipped, classification };
}

export function flagsInclude(classification, flag) {
  return classification.flags.includes(flag);
}

export { CLASSIFICATION_FLAGS };
