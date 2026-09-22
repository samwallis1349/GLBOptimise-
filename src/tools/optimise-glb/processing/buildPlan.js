import { clonePresetPlan } from '../config/presets.js';
import { applySafetyRules } from './safetyRules.js';

/**
 * Turns a preset id (+ optional advanced overrides) into a concrete
 * OptimisationPlan, then narrows it against a model's classification via
 * safetyRules. Returns { plan, requested, skipped, classification }.
 *
 * The UI never talks to glTF-Transform directly — it always goes through
 * a plan built here, so "what is this model actually going to do" is
 * answerable in one place.
 *
 * @param {string} presetId
 * @param {import('../glb/classify.js').ModelClassification} classification
 * @param {Object} [advancedOverrides]
 */
export function buildOptimisationPlan(presetId, classification, advancedOverrides = null) {
  const basePlan = clonePresetPlan(presetId);

  if (advancedOverrides) {
    mergeOverrides(basePlan, advancedOverrides);
  }

  const requested = describeRequestedOperations(basePlan);
  const { allowed, skipped } = applySafetyRules(basePlan, classification);

  return {
    preset: presetId,
    requested,
    plan: { ...basePlan, ...allowed },
    skipped,
    classification,
  };
}

function mergeOverrides(basePlan, overrides) {
  if (overrides.data) {
    basePlan.cleanup = overrides.data.removeUnused ?? basePlan.cleanup;
    basePlan.deduplicate = overrides.data.deduplicate ?? basePlan.deduplicate;
  }
  if (overrides.textures) {
    const maxRes = overrides.textures.maxResolution;
    basePlan.textures.resize = maxRes !== 'original';
    basePlan.textures.maxSize = maxRes === 'original' ? null : Number(maxRes);
    basePlan.textures.quality = overrides.textures.quality ?? basePlan.textures.quality;
  }
  if (overrides.geometry) {
    basePlan.geometry.optimise = overrides.geometry.optimise ?? basePlan.geometry.optimise;
    basePlan.geometry.simplify = overrides.geometry.simplify ?? basePlan.geometry.simplify;
    basePlan.geometry.targetRatio = overrides.geometry.targetPercent
      ? overrides.geometry.targetPercent / 100
      : basePlan.geometry.targetRatio;
  }
  if (overrides.compression) {
    basePlan.compression.method = overrides.compression.enabled
      ? overrides.compression.method || 'meshopt'
      : basePlan.compression.method;
  }
  if (overrides.preserve) {
    basePlan.preserve = { ...basePlan.preserve, ...overrides.preserve };
  }
}

function describeRequestedOperations(plan) {
  const ops = [];
  if (plan.cleanup) ops.push('remove unused resources');
  if (plan.deduplicate) ops.push('deduplicate resources');
  if (plan.animations?.resample) ops.push('resample animation keyframes');
  if (plan.textures.resize) ops.push(`resize textures (max ${plan.textures.maxSize}px)`);
  if (plan.textures.toWebP) ops.push('convert colour textures to WebP');
  if (plan.geometry.optimise) ops.push('weld vertices');
  if (plan.geometry.simplify) ops.push('simplify geometry');
  if (plan.geometry.reorder) ops.push('reorder for vertex cache');
  if (plan.geometry.quantize) ops.push('quantize vertex attributes');
  if (plan.compression?.method) ops.push(`${plan.compression.method} compression`);
  return ops;
}
