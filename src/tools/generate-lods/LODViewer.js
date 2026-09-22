import { Viewer } from './viewer/Viewer.js';
import { loadGlbForPreview } from './viewer/loadModel.js';

/**
 * The comparison viewport.
 *
 * Deliberately only two Three.js viewers exist regardless of how many LOD
 * levels are generated: "original" always shows the source model, and "lod"
 * shows whichever level is currently selected from the tab strip. This is
 * the same two-viewer pattern Reduce Polys uses for its before/after
 * comparison — generalised here so the second slot's content can be swapped
 * between N results instead of just one. Both viewers are created with
 * identical cameras, lighting and framing, and their OrbitControls are bound
 * so rotating one rotates the other.
 *
 * Layouts:
 *   single   — one viewport (original before generation, or the selected LOD)
 *   split    — both stacked, the top one clipped by a draggable divider
 *   side     — two viewports side by side
 */
export class LODViewer {
  constructor({ originalHost, lodHost, splitHost }) {
    this.originalHost = originalHost;
    this.lodHost = lodHost;
    this.splitHost = splitHost;

    this.original = new Viewer(originalHost);
    this.lod = new Viewer(lodHost);

    this.wireframeMode = 'solid';
    this.gridVisible = false;
    this._syncing = false;

    // Two-way camera lock, guarded so the echo doesn't loop.
    this._unbindA = this.original.onControlsChange(() => this._sync(this.original, this.lod));
    this._unbindB = this.lod.onControlsChange(() => this._sync(this.lod, this.original));
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
    // Give the LOD viewer the same starting pose immediately.
    this.original.copyCameraTo(this.lod);
    return scene;
  }

  /** Loads a generated LOD's buffer into the second viewport, without re-framing. */
  async loadLod(arrayBuffer) {
    const scene = await loadGlbForPreview(arrayBuffer);
    this.lod.setModel(scene);
    this.lod.setWireframeMode(this.wireframeMode);
    this.lod.setGridVisible(this.gridVisible);
    // Match the original's framing exactly rather than auto-framing again,
    // so every LOD is judged from the same scale and angle.
    this.original.copyCameraTo(this.lod);
    return scene;
  }

  setWireframeMode(mode) {
    this.wireframeMode = mode;
    this.original.setWireframeMode(mode);
    this.lod.setWireframeMode(mode);
  }

  setGridVisible(visible) {
    this.gridVisible = visible;
    this.original.setGridVisible(visible);
    this.lod.setGridVisible(visible);
  }

  resetCamera() {
    this.original.resetCamera();
    this.original.copyCameraTo(this.lod);
  }

  /** @param {number} percent 0–100, how much of the LOD view shows */
  setSplitPosition(percent) {
    if (!this.splitHost) return;
    this.splitHost.style.setProperty('--split', `${percent}%`);
  }

  dispose() {
    this._unbindA?.();
    this._unbindB?.();
    this.original.dispose();
    this.lod.dispose();
  }
}
