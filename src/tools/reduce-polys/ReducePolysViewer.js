import { Viewer } from './viewer/Viewer.js';
import { loadGlbForPreview } from './viewer/loadModel.js';

/**
 * The comparison viewport.
 *
 * Wraps two of the app's existing Viewers — one for the original, one for
 * the reduced model — and keeps them locked together. Both are created with
 * identical cameras, lighting and framing, and their OrbitControls are
 * bound so rotating one rotates the other. Without that, comparing
 * silhouettes is guesswork.
 *
 * Layouts:
 *   single — one viewport (original before reduction, or either afterwards)
 *   split  — both stacked, the top one clipped by a draggable divider
 *   side   — two viewports side by side
 */
export class ReducePolysViewer {
  constructor({ originalHost, reducedHost, splitHost }) {
    this.originalHost = originalHost;
    this.reducedHost = reducedHost;
    this.splitHost = splitHost;

    this.original = new Viewer(originalHost);
    this.reduced = new Viewer(reducedHost);

    this.wireframeMode = 'solid';
    this.gridVisible = false;
    this._syncing = false;

    // Two-way camera lock, guarded so the echo doesn't loop.
    this._unbindA = this.original.onControlsChange(() => this._sync(this.original, this.reduced));
    this._unbindB = this.reduced.onControlsChange(() => this._sync(this.reduced, this.original));
  }

  _sync(from, to) {
    if (this._syncing) return;
    this._syncing = true;
    from.copyCameraTo(to);
    this._syncing = false;
  }

  async loadOriginal(arrayBuffer) {
    const scene = await loadGlbForPreview(arrayBuffer);
    this.original.setModel(scene);
    this.original.setWireframeMode(this.wireframeMode);
    this.original.setGridVisible(this.gridVisible);
    // Give the reduced viewer the same starting pose immediately.
    this.original.copyCameraTo(this.reduced);
    return scene;
  }

  async loadReduced(arrayBuffer) {
    const scene = await loadGlbForPreview(arrayBuffer);
    this.reduced.setModel(scene);
    this.reduced.setWireframeMode(this.wireframeMode);
    this.reduced.setGridVisible(this.gridVisible);
    // Match the original's framing exactly rather than auto-framing again,
    // so the two models are judged at the same scale and angle.
    this.original.copyCameraTo(this.reduced);
    return scene;
  }

  setWireframeMode(mode) {
    this.wireframeMode = mode;
    this.original.setWireframeMode(mode);
    this.reduced.setWireframeMode(mode);
  }

  setGridVisible(visible) {
    this.gridVisible = visible;
    this.original.setGridVisible(visible);
    this.reduced.setGridVisible(visible);
  }

  resetCamera() {
    this.original.resetCamera();
    this.original.copyCameraTo(this.reduced);
  }

  /** @param {number} percent 0–100, how much of the reduced view shows */
  setSplitPosition(percent) {
    if (!this.splitHost) return;
    this.splitHost.style.setProperty('--split', `${percent}%`);
  }

  dispose() {
    this._unbindA?.();
    this._unbindB?.();
    this.original.dispose();
    this.reduced.dispose();
  }
}
