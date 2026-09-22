/**
 * Derives display-ready statistics from an analysed GLB (see
 * analyseGLB.js) — total triangle count, texture memory footprint,
 * animation duration totals, etc. Kept separate from analyseGLB so raw
 * parsing and derived/aggregated numbers have independent, testable
 * boundaries.
 *
 * NOT YET IMPLEMENTED — depends on analyseGLB() producing real data.
 *
 * @param {Awaited<ReturnType<typeof import('./analyseGLB.js').analyseGLB>>} _analysis
 * @returns {Promise<object>}
 */
export async function computeStatistics(_analysis) {
  throw new Error('computeStatistics() is not implemented yet.');
}
