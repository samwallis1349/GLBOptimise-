/**
 * Positions a camera to automatically frame a loaded model's bounding box.
 *
 * NOT YET IMPLEMENTED — see loadModel.js for why. Intended to compute a
 * Box3 from the scene, then set camera position/target from its size and
 * center so any model — regardless of scale or origin — appears centered
 * and fully visible on load.
 *
 * @param {unknown} _camera three.Camera
 * @param {unknown} _scene three.Object3D
 */
export function frameModel(_camera, _scene) {
  throw new Error('frameModel() is not implemented yet — Three.js is not wired up.');
}
