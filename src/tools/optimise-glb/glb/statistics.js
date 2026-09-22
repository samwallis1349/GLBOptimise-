/**
 * Builds the "before / after" comparison shown in the File Size Reduction
 * card. Every number here comes from two real GlbAnalysis results — never
 * estimated.
 *
 * @param {import('./analyse.js').GlbAnalysis} original
 * @param {import('./analyse.js').GlbAnalysis} optimised
 */
export function compareAnalyses(original, optimised) {
  const originalBytes = original.file.bytes;
  const optimisedBytes = optimised.file.bytes;
  const savedBytes = originalBytes - optimisedBytes;
  const percentSmaller = originalBytes > 0 ? (savedBytes / originalBytes) * 100 : 0;

  return {
    originalBytes,
    optimisedBytes,
    savedBytes,
    percentSmaller,
    triangles: { before: original.geometry.triangleCount, after: optimised.geometry.triangleCount },
    textures: { before: original.textures.count, after: optimised.textures.count },
    materials: { before: original.materials.count, after: optimised.materials.count },
    animations: { before: original.animations.count, after: optimised.animations.count },
    skins: { before: original.rigging.skinCount, after: optimised.rigging.skinCount },
  };
}

/** Aggregate stats across a batch of completed comparisons, for the batch summary card. */
export function aggregateBatchStatistics(comparisons) {
  const totals = comparisons.reduce(
    (acc, c) => {
      acc.originalBytes += c.originalBytes;
      acc.optimisedBytes += c.optimisedBytes;
      return acc;
    },
    { originalBytes: 0, optimisedBytes: 0 }
  );
  const savedBytes = totals.originalBytes - totals.optimisedBytes;
  const percentSmaller = totals.originalBytes > 0 ? (savedBytes / totals.originalBytes) * 100 : 0;
  return { ...totals, savedBytes, percentSmaller, count: comparisons.length };
}
