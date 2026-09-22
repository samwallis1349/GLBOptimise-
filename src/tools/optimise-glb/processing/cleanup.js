import { dedup, prune, resample } from '@gltf-transform/functions';

/**
 * Removes unused resources, deduplicates identical ones, and thins redundant
 * animation keyframes. Safe for every model classification: nothing here
 * removes anything the scene graph actually references, and resample only
 * drops keyframes that are exactly interpolable from their neighbours.
 */
export async function runCleanup(document, plan, executed, warnings) {
  if (plan.cleanup) {
    await document.transform(prune({ keepExtras: true }));
    executed.push('remove unused resources');
  }
  if (plan.deduplicate) {
    await document.transform(dedup());
    executed.push('deduplicate resources');
  }
  if (plan.animations?.resample && document.getRoot().listAnimations().length > 0) {
    try {
      await document.transform(resample());
      executed.push('resample animation keyframes');
    } catch (err) {
      warnings.push(`Animation resampling failed (${err?.message || 'unknown error'}).`);
    }
  }
}
