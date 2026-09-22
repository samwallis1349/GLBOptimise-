/**
 * Parses a GLB/glTF file and extracts its structural contents: meshes,
 * materials, textures, animations, nodes, and their raw byte sizes.
 *
 * This is the foundation that classifyGLB.js and statistics.js build on,
 * and that Optimise GLB, Reduce Polys, Compress Textures, and Inspect GLB
 * will all share.
 *
 * NOT YET IMPLEMENTED. Left as a documented interface — no invented
 * analysis values. Intended to use glTF Transform
 * (`@gltf-transform/core` + `@gltf-transform/extensions`) once it is
 * installed, per "only install dependencies genuinely required at this
 * stage".
 *
 * Intended return shape (all fields real, computed values):
 *   {
 *     meshes: [{ name, triangleCount, vertexCount }],
 *     materials: [{ name, textureRefs }],
 *     textures: [{ name, width, height, mimeType, byteLength }],
 *     animations: [{ name, duration }],
 *     nodeCount: number,
 *     totalByteLength: number,
 *   }
 *
 * @param {File} _file
 * @returns {Promise<object>}
 */
export async function analyseGLB(_file) {
  throw new Error('analyseGLB() is not implemented yet.');
}
