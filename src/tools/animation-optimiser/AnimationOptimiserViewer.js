import { AnimationMixer } from 'three';
import { Viewer } from './viewer/Viewer.js';
import { loadGlbWithAnimations } from './viewer/loadModel.js';
import { disposeModel } from './viewer/disposeModel.js';

/**
 * One viewport, two models: the original and the optimised result, swapped
 * in place.
 *
 * Animation is judged by watching it, and two clips playing side by side in
 * separate viewports are almost impossible to compare — the eye cannot hold
 * both at once, and the moment they drift out of sync the comparison is
 * worthless. Swapping one model for the other in a single viewport, keeping
 * the camera, the clip and the playhead exactly where they were, turns the
 * question "did this change the motion?" into a flicker test, which is the
 * one form of comparison the eye is genuinely good at.
 *
 * Both models stay parsed in memory so the swap is instant. That costs
 * roughly double the scene memory, which is the right trade here: the files
 * this tool targets are animation-heavy rather than geometry-heavy, and a
 * toggle that takes a second to respond would defeat the point.
 */
export class AnimationOptimiserViewer {
  constructor(host) {
    this.viewer = new Viewer(host);
    this.variants = { original: null, optimised: null };
    this.active = 'original';
    this.clipIndex = 0;
    this._onTick = null;
  }

  get hasOptimised() {
    return Boolean(this.variants.optimised);
  }

  get isPlaying() {
    return this.viewer.isPlaying;
  }

  get time() {
    return this.viewer.activeAction?.time ?? 0;
  }

  get duration() {
    return this.viewer.activeAction?.getClip()?.duration ?? 0;
  }

  get clips() {
    return this.variants[this.active]?.animations ?? [];
  }

  /** Loads the source model and shows it. */
  async loadOriginal(arrayBuffer) {
    const { scene, animations } = await loadGlbWithAnimations(arrayBuffer);
    this._disposeVariant('original');
    this.variants.original = { scene, animations };
    this.active = 'original';
    this.viewer.setModel(scene, animations);
    this.viewer.setWireframeMode('solid');
    return animations;
  }

  /**
   * Loads the optimised export alongside the original, without disturbing
   * what is currently on screen.
   */
  async loadOptimised(arrayBuffer) {
    const { scene, animations } = await loadGlbWithAnimations(arrayBuffer);
    this._disposeVariant('optimised');
    this.variants.optimised = { scene, animations };
    return animations;
  }

  /**
   * Swaps the visible model, carrying the camera, the selected clip and the
   * playhead across so the two can be compared frame for frame.
   */
  showVariant(key) {
    const variant = this.variants[key];
    if (!variant || key === this.active) return false;

    const wasPlaying = this.viewer.isPlaying;
    const time = this.time;
    const previous = this.variants[this.active];

    this.viewer.stop();
    if (this.viewer.mixer) {
      this.viewer.mixer.stopAllAction();
      this.viewer.mixer.uncacheRoot(this.viewer.mixer.getRoot());
    }
    if (previous?.scene) this.viewer.scene.remove(previous.scene);

    this.viewer.scene.add(variant.scene);
    this.viewer.currentModel = variant.scene;
    this.viewer.clips = variant.animations;
    this.viewer.mixer = new AnimationMixer(variant.scene);
    this.viewer.activeAction = null;
    this.active = key;

    // Re-apply the display mode to the model that just appeared; the camera
    // is deliberately left alone so the frame doesn't jump.
    this.viewer.setWireframeMode(this.viewer._wireframeMode || 'solid');

    this.selectClip(this.clipIndex, this._onTick);
    this.setTime(time);
    if (wasPlaying) this.viewer.resume();
    return true;
  }

  selectClip(index, onTick) {
    const clip = this.clips[index];
    this.clipIndex = index;
    this._onTick = onTick ?? this._onTick;
    if (!clip) return false;
    this.viewer.playClip(clip, this._onTick);
    this.viewer.pause();
    this.viewer.setTime(0);
    return true;
  }

  play() {
    this.viewer.resume();
  }

  pause() {
    this.viewer.pause();
  }

  toggle() {
    if (this.viewer.isPlaying) this.viewer.pause();
    else this.viewer.resume();
    return this.viewer.isPlaying;
  }

  setTime(seconds) {
    this.viewer.setTime(Math.max(0, Math.min(seconds, this.duration)));
  }

  setSpeed(multiplier) {
    this.viewer.setSpeed(multiplier);
  }

  setLoop(shouldLoop) {
    this.viewer.setLoop(shouldLoop);
  }

  setWireframeMode(mode) {
    this.viewer.setWireframeMode(mode);
  }

  setGridVisible(visible) {
    this.viewer.setGridVisible(visible);
  }

  resetCamera() {
    this.viewer.resetCamera();
  }

  /** Drops the optimised variant only — used when settings change and the
   *  previous result is no longer what the controls describe. */
  clearOptimised() {
    if (this.active === 'optimised') this.showVariant('original');
    this._disposeVariant('optimised');
  }

  _disposeVariant(key) {
    const variant = this.variants[key];
    if (!variant) return;
    if (variant.scene.parent) this.viewer.scene.remove(variant.scene);
    disposeModel(variant.scene);
    this.variants[key] = null;
  }

  clear() {
    this.viewer.stop();
    this.viewer.clear();
    this._disposeVariant('original');
    this._disposeVariant('optimised');
    this.active = 'original';
    this.clipIndex = 0;
  }

  dispose() {
    this._disposeVariant('optimised');
    this.viewer.dispose();
  }
}
