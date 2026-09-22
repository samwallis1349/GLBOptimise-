import { Viewer } from './viewer/Viewer.js';
import { loadGlbWithAnimations } from './viewer/loadModel.js';

/**
 * Playback wrapper around the shared Three.js viewer.
 *
 * The clips it plays are the ones `GLTFLoader` parsed out of the file, not
 * clips rebuilt from the glTF-Transform document. That split is deliberate:
 * the analysis panels describe what the *file* contains, while the viewport
 * shows what a real renderer *does* with it. When the two disagree, that
 * disagreement is itself the finding — so neither side is derived from the
 * other.
 *
 * Unlike Strip Animations, selecting a clip here arms it paused at frame 0
 * rather than playing immediately: an inspector should open on a still you
 * can read, and let you start it.
 */
export class AnimationViewer {
  constructor(host) {
    this.viewer = new Viewer(host);
    this.clips = [];
    this.activeIndex = -1;
  }

  /** @returns {Promise<{animations: import('three').AnimationClip[]}>} */
  async load(arrayBuffer) {
    const { scene, animations } = await loadGlbWithAnimations(arrayBuffer);
    this.viewer.setModel(scene, animations);
    this.viewer.setWireframeMode('solid');
    this.clips = animations;
    this.activeIndex = -1;
    return { animations };
  }

  get clipCount() {
    return this.clips.length;
  }

  get isPlaying() {
    return this.viewer.isPlaying;
  }

  /** Current playhead position in seconds, or 0 when nothing is armed. */
  get time() {
    return this.viewer.activeAction?.time ?? 0;
  }

  get duration() {
    return this.viewer.activeAction?.getClip()?.duration ?? 0;
  }

  /**
   * Arms a clip at time 0, paused.
   * @param {number} index position in `gltf.animations`, which matches the
   *   glTF document's own animation order — so the analysis clip at index N
   *   and the Three.js clip at index N are the same clip.
   * @param {(time:number, duration:number, done:boolean) => void} onTick
   */
  selectClip(index, onTick) {
    const clip = this.clips[index];
    if (!clip) return false;
    this.viewer.playClip(clip, onTick);
    this.viewer.pause();
    this.viewer.setTime(0);
    this.activeIndex = index;
    return true;
  }

  play() {
    this.viewer.resume();
  }

  pause() {
    this.viewer.pause();
  }

  /** @returns {boolean} the play state after toggling. */
  toggle() {
    if (this.viewer.isPlaying) this.viewer.pause();
    else this.viewer.resume();
    return this.viewer.isPlaying;
  }

  setTime(seconds) {
    this.viewer.setTime(Math.max(0, Math.min(seconds, this.duration)));
  }

  /** Nudges the playhead by whole frames at the clip's own sample rate. */
  stepFrames(frames, frameRate) {
    const fps = frameRate > 0 ? frameRate : 30;
    this.setTime(this.time + frames / fps);
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

  clear() {
    this.viewer.stop();
    this.viewer.clear();
    this.clips = [];
    this.activeIndex = -1;
  }

  dispose() {
    this.viewer.dispose();
  }
}
