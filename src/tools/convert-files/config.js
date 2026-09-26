/**
 * Loader settings for processing/loadModel.js and processing/exportModel.js,
 * which the GLB Builder & Merger (Asset Arranger) reuses. The Convert Files
 * page itself is the standalone Model Convertor (model-convertor.html).
 */
export const CONVERT_FILES_CONFIG = {
  // First match wins when several model files are dropped together.
  mainOrder: ['glb', 'gltf', 'fbx', 'dae', 'obj', '3mf', '3ds', 'ply', 'stl'],
  maxTextureSize: 4096,
};
