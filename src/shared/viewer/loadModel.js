/**
 * Loads a glTF/GLB File into a Three.js scene graph.
 *
 * NOT YET IMPLEMENTED — this is a documented interface boundary.
 * Three.js and GLTFLoader are not installed yet; they will be added
 * when the first tool that needs 3D preview (Optimise GLB or
 * Inspect GLB) is actually built, per the "only install dependencies
 * genuinely required at this stage" rule.
 *
 * Intended implementation:
 *   import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
 *   - parse `file` via FileReader/ArrayBuffer
 *   - GLTFLoader.parse() the buffer
 *   - return { scene, animations, cameras } from the loaded gltf
 *
 * @param {File} _file
 * @returns {Promise<{ scene: unknown, animations: unknown[] }>}
 */
export async function loadModel(_file) {
  throw new Error('loadModel() is not implemented yet — Three.js is not wired up.');
}
