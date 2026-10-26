/** Tools that take an image (PNG, JPEG, WebP); every other tool takes a 3D model. Shared by the engine and the panel. */
export const IMAGE_TOOLS = new Set(['icon-check', 'icons', 'xcassets', 'screenshots', 'sheet-check', 'cutout', 'lines']);

/** Model formats each edition's picker accepts: the first three editions are GLB-only listings. */
export const MODEL_ACCEPT = { glb: '.glb,model/gltf-binary', any: '.glb,.gltf,.fbx,.obj,.zip' };
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';

/** Tools that run in the panel itself (they need WebGL), not in the engine worker. */
export const PANEL_TOOLS = new Set(['iso']);
