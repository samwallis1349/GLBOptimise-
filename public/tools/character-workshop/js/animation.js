/**
 * Animation playback for one model: a single AnimationMixer, at most one
 * "current" action plus the one fading out, so clips never fight over bones.
 * The viewport's render loop calls update(delta); there is no second loop.
 */
import * as THREE from 'three';
import { applyRestPose } from './inspect.js';

/** Desired categories for game agents. Matching is by clip name only. */
export const CATEGORIES = [
  { id: 'idle', label: 'Idle', pattern: /\b(idle|breath(ing)?|stand(ing)?)\b|idle/i },
  { id: 'walk', label: 'Walk', pattern: /walk/i },
  { id: 'run', label: 'Run', pattern: /\b(run|running|jog|jogging|sprint)\b|run/i },
  { id: 'sit', label: 'Sit', pattern: /\bsit|sitting|seated/i },
  { id: 'type', label: 'Type', pattern: /\btyp(e|ing)\b|keyboard/i },
  { id: 'wave', label: 'Wave', pattern: /wave|waving|hello|greet/i },
  { id: 'think', label: 'Think', pattern: /think|ponder/i },
];

/**
 * Suggests a clip for each category from the clip names. A clip is only
 * suggested if its name says so — a walk cycle is never offered as "Type".
 * Walk/run exclusions stop e.g. "WalkJump" counting as Run.
 */
export function suggestCategories(clips) {
  const result = {};
  for (const cat of CATEGORIES) {
    const match = clips.find((c) => {
      const n = c.name || '';
      if (!cat.pattern.test(n)) return false;
      if (cat.id === 'run' && /walk/i.test(n)) return false;
      if (cat.id === 'sit' && /situp|sit-up/i.test(n)) return false;
      return true;
    });
    result[cat.id] = match ? { clip: match, source: 'name' } : null;
  }
  return result;
}

export class AnimationController {
  constructor() {
    this.mixer = null;
    this.root = null;
    this.restPose = null;
    this.clips = [];
    this.current = null;     // { clip, action }
    this.fading = [];
    this.loop = true;
    this.speed = 1;
    this.crossFade = 0.25;
    this.playing = false;
    this.listeners = new Set();
  }

  attach(root, clips, restPose) {
    this.detach();
    this.root = root;
    this.restPose = restPose;
    this.clips = [...clips];
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.timeScale = this.speed;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.current?.action) { this.playing = false; this.emit(); }
    });
    this.emit();
  }

  addClips(clips) {
    this.clips.push(...clips);
    this.emit();
  }

  detach() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      for (const clip of this.clips) this.mixer.uncacheClip(clip);
      if (this.root) this.mixer.uncacheRoot(this.root);
    }
    this.mixer = null;
    this.root = null;
    this.restPose = null;
    this.clips = [];
    this.current = null;
    this.fading = [];
    this.playing = false;
    this.emit();
  }

  /** Starts (or resumes) a clip. Switching cross-fades from the previous clip. */
  play(clip) {
    if (!this.mixer || !clip) return;
    if (this.current?.clip === clip) {
      const a = this.current.action;
      if (!a.isRunning() && a.time >= clip.duration - 1e-4 && !this.loop) a.reset();
      a.paused = false;
      a.play();
      this.playing = true;
      this.emit();
      return;
    }
    const action = this.mixer.clipAction(clip);
    action.reset();
    this.applyLoop(action);
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    const prev = this.current?.action;
    if (prev && prev.isRunning() && this.crossFade > 0 && this.playing) {
      action.crossFadeFrom(prev, this.crossFade, false);
      this.fading.push(prev);
    } else if (prev) {
      prev.stop();
    }
    // Anything else still fading is stopped now so at most two actions run.
    this.fading = this.fading.filter((a) => {
      if (a === prev) return true;
      a.stop();
      return false;
    });
    this.current = { clip, action };
    this.playing = true;
    this.emit();
  }

  pause() {
    if (!this.current) return;
    this.current.action.paused = true;
    this.playing = false;
    this.emit();
  }

  toggle(clip) {
    if (this.playing && (!clip || this.current?.clip === clip)) this.pause();
    else this.play(clip ?? this.current?.clip ?? this.clips[0]);
  }

  /** Stops everything and puts every node back to its original rest transform. */
  stop() {
    if (!this.mixer) return;
    this.mixer.stopAllAction();
    this.fading = [];
    if (this.current) this.current.action.reset().stop();
    this.playing = false;
    if (this.root && this.restPose) applyRestPose(this.root, this.restPose);
    this.emit();
  }

  /** Scrubs the current clip to `time` seconds and shows that pose immediately. */
  seek(time) {
    if (!this.current) return;
    const { action, clip } = this.current;
    for (const a of this.fading) a.stop();
    this.fading = [];
    action.enabled = true;
    action.setEffectiveWeight(1);
    if (!action.isScheduled()) { action.play(); action.paused = true; this.playing = false; }
    action.time = THREE.MathUtils.clamp(time, 0, clip.duration);
    this.mixer.update(0);
    this.emit();
  }

  setLoop(loop) {
    this.loop = loop;
    if (this.current) this.applyLoop(this.current.action);
    this.emit();
  }

  setSpeed(speed) {
    this.speed = speed;
    if (this.mixer) this.mixer.timeScale = speed;
    this.emit();
  }

  applyLoop(action) {
    action.setLoop(this.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !this.loop;
  }

  update(delta) {
    if (!this.mixer) return;
    this.mixer.update(delta);
    if (this.fading.length) {
      this.fading = this.fading.filter((a) => {
        if (a.getEffectiveWeight() <= 0.001 || !a.isRunning()) { a.stop(); return false; }
        return true;
      });
    }
  }

  /** Number of actions currently influencing bones (used by tests). */
  activeActionCount() {
    if (!this.mixer) return 0;
    return this.clips.filter((c) => this.mixer.existingAction(c)?.isRunning()).length;
  }

  get time() { return this.current?.action.time ?? 0; }
  get duration() { return this.current?.clip.duration ?? 0; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
}
