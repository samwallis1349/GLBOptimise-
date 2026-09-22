/**
 * Recursively disposes geometries, materials, and textures of a loaded
 * model to prevent GPU memory leaks when switching previews.
 *
 * NOT YET IMPLEMENTED — see loadModel.js for why. Intended to traverse
 * the Object3D graph and call .dispose() on every geometry, material, and
 * any texture referenced by a material.
 *
 * @param {unknown} _scene three.Object3D
 */
export function disposeModel(_scene) {
  throw new Error('disposeModel() is not implemented yet — Three.js is not wired up.');
}
