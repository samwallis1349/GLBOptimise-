/**
 * Shared Three.js model viewer — mounts a renderer/scene/camera into a
 * container element with orbit controls, studio lighting, and animation
 * playback.
 *
 * NOT YET IMPLEMENTED. This module documents the interface every tool
 * will use once Three.js is installed:
 *
 *   const viewer = createViewer(containerEl);
 *   await viewer.load(file);       // uses loadModel()
 *   viewer.play(animationName);
 *   viewer.dispose();              // uses disposeModel(), tears down renderer
 *
 * Until then, tool pages should render `.tool-page__viewer-slot` (see
 * src/styles/tools.css) as a static placeholder — never a fake preview.
 *
 * @param {HTMLElement} _container
 */
export function createViewer(_container) {
  throw new Error('createViewer() is not implemented yet — Three.js is not wired up.');
}
