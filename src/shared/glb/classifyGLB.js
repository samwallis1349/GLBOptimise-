/**
 * Classifies an analysed GLB (see analyseGLB.js) into descriptive tags
 * that tools use to make decisions or surface suggestions — e.g.
 * "has-4k-textures", "has-animations", "high-poly", "has-morph-targets".
 *
 * This is what powers cross-tool handoff suggestions (see
 * src/shared/storage/ModelSessionStore.js): if Optimise GLB classifies a
 * model as "has-4k-textures", it can offer a link into Compress Textures.
 *
 * NOT YET IMPLEMENTED — depends on analyseGLB() producing real data.
 *
 * @param {Awaited<ReturnType<typeof import('./analyseGLB.js').analyseGLB>>} _analysis
 * @returns {Promise<string[]>} classification tags
 */
export async function classifyGLB(_analysis) {
  throw new Error('classifyGLB() is not implemented yet.');
}
