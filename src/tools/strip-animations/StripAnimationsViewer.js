import { Viewer } from './viewer/Viewer.js';
import { loadGlbWithAnimations } from './viewer/loadModel.js';

/**
 * Single-viewport preview for Strip Animations. Unlike the before/after
 * comparison viewers used by Reduce Polys and Compress Textures, this tool
 * only ever needs one live model at a time — the model doesn't change shape
 * when clips are marked for removal, only which clips can be previewed on
 * it, and the actual stripped output is a download, not a second live view.
 */
export class StripAnimationsViewer {
  constructor(host) {
    this.viewer = new Viewer(host);
  }

  /** @returns {Promise<{ clipsByName: Map<string, import('three').AnimationClip> }>} */
  async load(arrayBuffer) {
    const { scene, animations } = await loadGlbWithAnimations(arrayBuffer);
    this.viewer.setModel(scene, animations);
    this.viewer.setWireframeMode('solid');
    return { animations };
  }

  /** Finds the THREE.AnimationClip matching an analysed clip by index+name (glTF clip order matches THREE's). */
  clipAt(index) {
    return this.viewer.clips[index] || null;
  }

  play(index, onTick) {
    const clip = this.clipAt(index);
    if (!clip) return false;
    this.viewer.playClip(clip, onTick);
    return true;
  }

  pause() { this.viewer.pause(); }
  resume() { this.viewer.resume(); }
  stop() { this.viewer.stop(); }
  setTime(seconds) { this.viewer.setTime(seconds); }
  setSpeed(multiplier) { this.viewer.setSpeed(multiplier); }
  setLoop(shouldLoop) { this.viewer.setLoop(shouldLoop); }
  get isPlaying() { return this.viewer.isPlaying; }

  setWireframeMode(mode) { this.viewer.setWireframeMode(mode); }
  setGridVisible(visible) { this.viewer.setGridVisible(visible); }
  resetCamera() { this.viewer.resetCamera(); }

  clear() {
    this.viewer.clear();
  }

  dispose() {
    this.viewer.dispose();
  }
}
