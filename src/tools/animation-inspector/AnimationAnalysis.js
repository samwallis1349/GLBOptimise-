/**
 * Animation analysis for Animation Inspector.
 *
 * Everything reported here is read out of the parsed glTF document — keyframe
 * times and values come from the sampler accessors themselves, never from
 * Three.js's interpretation of them and never estimated. That matters because
 * this tool's job is to tell you what is actually *in the file*, including the
 * cases a renderer silently papers over.
 *
 * The validation rules below are modelled on the Khronos glTF-Validator's own
 * animation issue codes (ISSUES.md), so a clip that passes here is a clip that
 * passes `gltf-validator` for animation purposes. Each check notes the code it
 * mirrors. On top of those, a second group of production checks covers the
 * things a validator considers legal but an animator considers broken — a
 * walk cycle whose last frame doesn't meet its first, a clip baked at 120fps
 * that nobody needed at 120fps.
 */

import {
  DENSE_SAMPLE_RATE,
  LOOP_POSITION_TOLERANCE,
  LOOP_ROTATION_TOLERANCE,
  MAX_CURVE_POINTS,
} from './config/limits.js';

/** Human labels + curve colours per glTF animation path. Matches the curve legend. */
export const PATH_META = {
  translation: { label: 'Location', short: 'Loc', colour: '#4a9eff', components: ['X', 'Y', 'Z'] },
  rotation: { label: 'Rotation', short: 'Rot', colour: '#3ddc84', components: ['X', 'Y', 'Z', 'W'] },
  scale: { label: 'Scale', short: 'Scl', colour: '#ff5c5c', components: ['X', 'Y', 'Z'] },
  weights: { label: 'Morph', short: 'Mrp', colour: '#c58bff', components: ['W'] },
};

/** Nodes whose name suggests they carry root motion, used only as a tie-breaker. */
const ROOT_NAME_HINT = /^(root|hips?|pelvis|armature|rootmotion|root_motion|cog)$/i;

// ---------------------------------------------------------------- helpers

function buildParentMap(document) {
  const parents = new Map();
  for (const node of document.getRoot().listNodes()) {
    for (const child of node.listChildren()) parents.set(child, node);
  }
  return parents;
}

function depthOf(node, parents) {
  let depth = 0;
  let current = node;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    current = parents.get(current);
    if (current) depth += 1;
  }
  return depth;
}

/** Median of a numeric array. Used for sample rate, which outliers would skew. */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Reads keyframe `i`'s *value* out of a sampler output accessor.
 *
 * CUBICSPLINE stores three elements per keyframe — inTangent, value,
 * outTangent — so the actual pose sits at 3i+1. Reading it as if it were
 * LINEAR (a mistake that renders fine most of the time) would show tangent
 * data as if it were the curve.
 */
function readOutputElement(output, i, interpolation, target) {
  const index = interpolation === 'CUBICSPLINE' ? i * 3 + 1 : i;
  output.getElement(index, target);
  return target;
}

/** How many real keyframes a sampler holds, accounting for CUBICSPLINE's 3x output. */
function keyCountOf(sampler) {
  const input = sampler?.getInput();
  return input ? input.getCount() : 0;
}

// ---------------------------------------------------------------- analysis

/**
 * @param {import('@gltf-transform/core').Document} document
 * @param {number} [fileBytes] size of the source file, echoed into clip info
 */
export function analyseAnimations(document, fileBytes = null) {
  const root = document.getRoot();
  const animations = root.listAnimations();
  const parents = buildParentMap(document);

  // Which nodes are skin joints — needed to tell a root-motion node from any
  // other animated transform, and to spot TRS channels on skinned-mesh nodes.
  const jointSet = new Set();
  for (const skin of root.listSkins()) {
    for (const joint of skin.listJoints()) jointSet.add(joint);
  }
  const skinnedMeshNodes = new Set(
    root.listNodes().filter((n) => n.getSkin() && n.getMesh())
  );

  // Nodes whose mesh carries morph targets — a WEIGHTS channel on anything
  // else is a hard error (ANIMATION_CHANNEL_TARGET_NODE_WEIGHTS_NO_MORPHS).
  const morphNodes = new Set();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (mesh.listPrimitives().some((p) => p.listTargets().length > 0)) morphNodes.add(node);
  }

  const clips = animations.map((animation, index) =>
    analyseClip(animation, index, { parents, jointSet, skinnedMeshNodes, morphNodes })
  );

  flagDuplicateNames(clips);

  const totalKeyframes = clips.reduce((sum, c) => sum + c.keyframeCount, 0);
  const totalTracks = clips.reduce((sum, c) => sum + c.trackCount, 0);
  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
  const longest = clips.reduce((best, c) => (!best || c.duration > best.duration ? c : best), null);

  return {
    clips,
    clipCount: clips.length,
    totalKeyframes,
    totalTracks,
    totalDuration,
    longestClipName: longest?.name ?? null,
    animatedNodeCount: new Set(clips.flatMap((c) => c.tracks.map((t) => t.nodeName))).size,
    skinCount: root.listSkins().length,
    jointCount: jointSet.size,
    hasMorphTargets: morphNodes.size > 0,
    fileBytes,
    format: 'GLB',
  };
}

function analyseClip(animation, index, ctx) {
  const channels = animation.listChannels();
  const tracks = [];
  const interpolations = new Set();
  const targetNodes = new Set();
  const issues = [];
  const seenTargets = new Set();

  let keyframeCount = 0;
  let duration = 0;
  let startTime = Infinity;
  let brokenTracks = 0;
  const counts = { translation: 0, rotation: 0, scale: 0, weights: 0 };
  const allDeltas = [];

  for (const channel of channels) {
    const path = channel.getTargetPath();
    const node = channel.getTargetNode();
    const sampler = channel.getSampler();

    // A channel with no node or no sampler can't be played by anything.
    if (!node || !sampler) {
      brokenTracks += 1;
      continue;
    }

    const input = sampler.getInput();
    const output = sampler.getOutput();
    if (!input || !output) {
      brokenTracks += 1;
      continue;
    }

    const interpolation = sampler.getInterpolation() || 'LINEAR';
    const nodeName = node.getName() || `Node ${index}`;
    const times = input.getArray();
    const keyCount = input.getCount();

    interpolations.add(interpolation);
    targetNodes.add(node);
    keyframeCount += keyCount;
    if (counts[path] !== undefined) counts[path] += 1;

    // --- Khronos: ANIMATION_DUPLICATE_TARGETS -----------------------------
    const targetKey = `${nodeName}::${path}`;
    if (seenTargets.has(targetKey)) {
      issues.push({
        level: 'error',
        code: 'ANIMATION_DUPLICATE_TARGETS',
        text: `Two channels both drive ${path} on "${nodeName}" — the later one wins and the other is dead data.`,
      });
    }
    seenTargets.add(targetKey);

    // --- Khronos: ANIMATION_SAMPLER_INPUT_ACCESSOR_TOO_FEW_ELEMENTS -------
    if (keyCount < 2) {
      issues.push({
        level: keyCount === 0 ? 'error' : 'warn',
        code: 'ANIMATION_SAMPLER_INPUT_ACCESSOR_TOO_FEW_ELEMENTS',
        text:
          keyCount === 0
            ? `${path} on "${nodeName}" has no keyframes at all.`
            : `${path} on "${nodeName}" has a single keyframe — it holds a pose but never animates.`,
      });
    }

    // --- Khronos: ANIMATION_SAMPLER_OUTPUT_ACCESSOR_INVALID_COUNT ---------
    const expectedOutput = interpolation === 'CUBICSPLINE' ? keyCount * 3 : keyCount;
    if (output.getCount() !== expectedOutput) {
      issues.push({
        level: 'error',
        code: 'ANIMATION_SAMPLER_OUTPUT_ACCESSOR_INVALID_COUNT',
        text: `${path} on "${nodeName}" has ${output.getCount()} output values for ${keyCount} ${interpolation} keyframes (expected ${expectedOutput}).`,
      });
    }

    // --- Khronos: ACCESSOR_ANIMATION_INPUT_NEGATIVE / NON_INCREASING ------
    let negativeAt = -1;
    let nonIncreasingAt = -1;
    if (times && times.length) {
      for (let i = 0; i < times.length; i += 1) {
        if (negativeAt < 0 && times[i] < 0) negativeAt = i;
        if (i > 0) {
          const delta = times[i] - times[i - 1];
          if (nonIncreasingAt < 0 && delta <= 0) nonIncreasingAt = i;
          else if (delta > 0) allDeltas.push(delta);
        }
      }
      startTime = Math.min(startTime, times[0]);
      duration = Math.max(duration, times[times.length - 1]);
    }
    if (negativeAt >= 0) {
      issues.push({
        level: 'error',
        code: 'ACCESSOR_ANIMATION_INPUT_NEGATIVE',
        text: `${path} on "${nodeName}" has a negative keyframe time at index ${negativeAt}.`,
      });
    }
    if (nonIncreasingAt >= 0) {
      issues.push({
        level: 'error',
        code: 'ACCESSOR_ANIMATION_INPUT_NON_INCREASING',
        text: `${path} on "${nodeName}" has keyframe times that stop increasing at index ${nonIncreasingAt} — playback will jump.`,
      });
    }

    // --- Khronos: ANIMATION_CHANNEL_TARGET_NODE_WEIGHTS_NO_MORPHS --------
    if (path === 'weights' && !ctx.morphNodes.has(node)) {
      issues.push({
        level: 'error',
        code: 'ANIMATION_CHANNEL_TARGET_NODE_WEIGHTS_NO_MORPHS',
        text: `"${nodeName}" is driven by a morph-weight channel but its mesh has no morph targets.`,
      });
    }

    // --- Khronos: ANIMATION_CHANNEL_TARGET_NODE_SKIN (warning) -----------
    if (ctx.skinnedMeshNodes.has(node) && path !== 'weights') {
      issues.push({
        level: 'warn',
        code: 'ANIMATION_CHANNEL_TARGET_NODE_SKIN',
        text: `${path} is animated on "${nodeName}", which holds a skinned mesh — skinned meshes ignore their own transform, so this channel has no visible effect.`,
      });
    }

    const elementSize = output.getElementSize();
    const track = {
      nodeName,
      node,
      path,
      interpolation,
      keyCount,
      elementSize,
      sampler,
      depth: depthOf(node, ctx.parents),
      isJoint: ctx.jointSet.has(node),
      firstTime: times?.length ? times[0] : 0,
      lastTime: times?.length ? times[times.length - 1] : 0,
    };

    // --- Loop continuity + constant-channel detection --------------------
    const continuity = measureContinuity(track);
    track.loopDelta = continuity.delta;
    track.isConstant = continuity.isConstant;
    track.valueRange = continuity.range;

    // --- Khronos: ACCESSOR_ANIMATION_SAMPLER_OUTPUT_NON_NORMALIZED_QUATERNION
    if (path === 'rotation' && continuity.nonUnitQuaternionAt >= 0) {
      issues.push({
        level: 'error',
        code: 'ACCESSOR_ANIMATION_SAMPLER_OUTPUT_NON_NORMALIZED_QUATERNION',
        text: `Rotation on "${nodeName}" has a non-normalised quaternion at keyframe ${continuity.nonUnitQuaternionAt} — it will skew the mesh.`,
      });
    }

    tracks.push(track);
  }

  if (!Number.isFinite(startTime)) startTime = 0;

  // Sample rate, derived from the gaps between keyframes rather than assumed.
  const medianDelta = median(allDeltas);
  const frameRate = medianDelta > 0 ? 1 / medianDelta : 0;
  const maxDeltaDrift = allDeltas.length
    ? Math.max(...allDeltas.map((d) => Math.abs(d - medianDelta))) / (medianDelta || 1)
    : 0;
  const uniformSampleRate = allDeltas.length === 0 || maxDeltaDrift <= 0.05;

  const rootMotion = detectRootMotion(tracks, ctx);
  const loop = summariseLoop(tracks);

  const clip = {
    index,
    name: animation.getName() || `Animation ${index + 1}`,
    animation,
    duration,
    startTime,
    frameRate,
    uniformSampleRate,
    frameCount: frameRate > 0 ? Math.round(duration * frameRate) + 1 : Math.max(...tracks.map((t) => t.keyCount), 0),
    trackCount: tracks.length,
    brokenTracks,
    keyframeCount,
    animatedNodeCount: targetNodes.size,
    interpolations: [...interpolations],
    counts,
    tracks,
    rootMotion,
    loop,
    issues,
    isEmpty: tracks.length === 0 || keyframeCount === 0,
  };

  addProductionIssues(clip);
  return clip;
}

/**
 * Walks a channel's keyframe values once to answer three questions at the same
 * time: does it end where it started (loop continuity), does it move at all
 * (constant channel), and — for rotations — is every quaternion unit length.
 */
function measureContinuity(track) {
  const { sampler, interpolation, keyCount, elementSize, path } = track;
  const output = sampler.getOutput();
  const result = { delta: 0, isConstant: true, range: 0, nonUnitQuaternionAt: -1 };
  if (!output || keyCount < 1) return result;

  const first = new Array(elementSize).fill(0);
  const last = new Array(elementSize).fill(0);
  const current = new Array(elementSize).fill(0);

  try {
    readOutputElement(output, 0, interpolation, first);
    readOutputElement(output, keyCount - 1, interpolation, last);
  } catch {
    return result;
  }

  if (path === 'rotation' && elementSize === 4) {
    // Quaternions: q and -q are the same rotation, so compare |dot|.
    let dot = 0;
    for (let c = 0; c < 4; c += 1) dot += first[c] * last[c];
    result.delta = 1 - Math.abs(dot);
  } else {
    let sum = 0;
    for (let c = 0; c < elementSize; c += 1) sum += (last[c] - first[c]) ** 2;
    result.delta = Math.sqrt(sum);
  }

  // Scan for movement + quaternion normalisation in one pass. Capped so a
  // 50k-key mocap channel doesn't stall the UI; the cap only affects these
  // two heuristics, never the counts reported elsewhere.
  const step = Math.max(1, Math.floor(keyCount / 512));
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < keyCount; i += step) {
    try {
      readOutputElement(output, i, interpolation, current);
    } catch {
      break;
    }
    for (let c = 0; c < elementSize; c += 1) {
      if (current[c] < min) min = current[c];
      if (current[c] > max) max = current[c];
    }
    if (path === 'rotation' && elementSize === 4 && result.nonUnitQuaternionAt < 0) {
      const lenSq = current[0] ** 2 + current[1] ** 2 + current[2] ** 2 + current[3] ** 2;
      if (Math.abs(lenSq - 1) > 2e-3) result.nonUnitQuaternionAt = i;
    }
  }

  result.range = Number.isFinite(max - min) ? max - min : 0;
  result.isConstant = result.range < 1e-6;
  return result;
}

/**
 * Root motion: a translation channel that actually moves, on the animated node
 * sitting closest to the scene root. This is a heuristic — glTF has no "root
 * motion" concept — so the node it picked is always reported alongside the
 * verdict rather than presented as fact.
 */
function detectRootMotion(tracks, ctx) {
  const translations = tracks.filter((t) => t.path === 'translation' && !t.isConstant);
  if (!translations.length) return { present: false, nodeName: null, distance: 0 };

  const named = translations.filter((t) => ROOT_NAME_HINT.test(t.nodeName));
  const pool = named.length ? named : translations;
  const candidate = pool.reduce((best, t) => (!best || t.depth < best.depth ? t : best), null);
  if (!candidate) return { present: false, nodeName: null, distance: 0 };

  // Only call it root motion if the node is a joint (or has no joint context
  // at all) — a translating prop in the scene isn't root motion.
  const meaningful = candidate.isJoint || ctx.jointSet.size === 0;
  return {
    present: meaningful,
    nodeName: candidate.nodeName,
    distance: candidate.valueRange,
  };
}

/** Worst-offending channel decides whether the clip loops cleanly. */
function summariseLoop(tracks) {
  const moving = tracks.filter((t) => !t.isConstant && t.keyCount > 1);
  if (!moving.length) return { clean: true, worstDelta: 0, worstTrack: null, checked: 0 };

  let worst = moving[0];
  for (const track of moving) {
    const tolerance = track.path === 'rotation' ? LOOP_ROTATION_TOLERANCE : LOOP_POSITION_TOLERANCE;
    const worstTolerance = worst.path === 'rotation' ? LOOP_ROTATION_TOLERANCE : LOOP_POSITION_TOLERANCE;
    if (track.loopDelta / tolerance > worst.loopDelta / worstTolerance) worst = track;
  }
  const tolerance = worst.path === 'rotation' ? LOOP_ROTATION_TOLERANCE : LOOP_POSITION_TOLERANCE;
  return {
    clean: worst.loopDelta <= tolerance,
    worstDelta: worst.loopDelta,
    worstTrack: `${worst.path} on "${worst.nodeName}"`,
    checked: moving.length,
  };
}

/**
 * Checks a validator would pass but an animator wouldn't: loops that don't
 * meet, clips that don't start at zero, over-baked sample rates, dead clips.
 */
function addProductionIssues(clip) {
  if (clip.isEmpty) {
    clip.issues.push({
      level: 'warn',
      code: 'CLIP_EMPTY',
      text: 'No usable tracks or keyframes — this clip does nothing.',
    });
    return;
  }

  if (clip.brokenTracks > 0) {
    clip.issues.push({
      level: 'error',
      code: 'CLIP_BROKEN_TRACKS',
      text: `${clip.brokenTracks} channel${clip.brokenTracks === 1 ? '' : 's'} have no target node or sampler and will be ignored by every renderer.`,
    });
  }

  if (clip.startTime > 1e-4) {
    clip.issues.push({
      level: 'warn',
      code: 'CLIP_LATE_START',
      text: `First keyframe sits at ${clip.startTime.toFixed(3)}s, not 0 — most engines will hold the bind pose until then.`,
    });
  }

  if (!clip.loop.clean && clip.loop.worstTrack) {
    clip.issues.push({
      level: 'warn',
      code: 'CLIP_LOOP_DISCONTINUITY',
      text: `Last frame doesn't return to the first — worst offender is ${clip.loop.worstTrack}. Looping this clip will pop.`,
    });
  }

  if (!clip.uniformSampleRate) {
    clip.issues.push({
      level: 'info',
      code: 'CLIP_NON_UNIFORM_RATE',
      text: 'Keyframe spacing is uneven, so the frame rate shown is a median rather than a fixed rate.',
    });
  }

  if (clip.frameRate > DENSE_SAMPLE_RATE) {
    clip.issues.push({
      level: 'info',
      code: 'CLIP_DENSE_SAMPLING',
      text: `Baked at roughly ${Math.round(clip.frameRate)}fps — resampling to 30fps would cut the keyframe count substantially.`,
    });
  }

  const constant = clip.tracks.filter((t) => t.isConstant).length;
  if (constant > 0 && constant === clip.tracks.length) {
    clip.issues.push({
      level: 'warn',
      code: 'CLIP_ALL_CONSTANT',
      text: 'Every channel holds a single unchanging value — this clip is a static pose, not an animation.',
    });
  } else if (constant > 0) {
    clip.issues.push({
      level: 'info',
      code: 'CLIP_CONSTANT_TRACKS',
      text: `${constant} of ${clip.tracks.length} channels never change value and could be removed.`,
    });
  }
}

/** Exact-name collisions across clips, flagged on every clip that shares a name. */
function flagDuplicateNames(clips) {
  const byName = new Map();
  for (const clip of clips) {
    const key = clip.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(clip);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const clip of group) {
      clip.issues.push({
        level: 'warn',
        code: 'CLIP_DUPLICATE_NAME',
        text: `Shares its name with ${group.length - 1} other clip${group.length - 1 === 1 ? '' : 's'} — engines that look clips up by name will pick only one.`,
      });
    }
  }
}

// ------------------------------------------------------------ curve data

/**
 * Decodes a track's keyframes into plottable component curves.
 *
 * Decoding happens here, on demand, rather than during analysis: a baked
 * mocap file can hold millions of keyframe values across all its channels,
 * and the curve editor only ever draws one node at a time. `maxPoints` strides
 * the *drawing* only — every keyframe is still counted in the analysis.
 *
 * @param {object} track a track from `analyseAnimations`
 * @param {number} [maxPoints]
 * @returns {{times: number[], components: {label: string, values: number[]}[], min: number, max: number}}
 */
export function extractTrackCurve(track, maxPoints = MAX_CURVE_POINTS) {
  const empty = { times: [], components: [], min: 0, max: 0 };
  if (!track) return empty;

  const input = track.sampler.getInput();
  const output = track.sampler.getOutput();
  if (!input || !output) return empty;

  const times = input.getArray();
  const keyCount = track.keyCount;
  if (!times || keyCount === 0) return empty;

  const step = Math.max(1, Math.ceil(keyCount / maxPoints));
  const meta = PATH_META[track.path] || PATH_META.translation;
  const size = track.elementSize;

  const labels = [];
  for (let c = 0; c < size; c += 1) {
    labels.push(meta.components[c] ?? `C${c}`);
  }
  const components = labels.map((label) => ({ label, values: [] }));
  const outTimes = [];
  const current = new Array(size).fill(0);

  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < keyCount; i += step) {
    try {
      readOutputElement(output, i, track.interpolation, current);
    } catch {
      break;
    }
    outTimes.push(times[i]);
    for (let c = 0; c < size; c += 1) {
      const value = current[c];
      components[c].values.push(value);
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  // Always include the final keyframe — it's the one that decides whether a
  // loop closes, so striding past it would hide the most interesting value.
  const lastIndex = keyCount - 1;
  if (outTimes.length && outTimes[outTimes.length - 1] !== times[lastIndex]) {
    try {
      readOutputElement(output, lastIndex, track.interpolation, current);
      outTimes.push(times[lastIndex]);
      for (let c = 0; c < size; c += 1) {
        const value = current[c];
        components[c].values.push(value);
        if (value < min) min = value;
        if (value > max) max = value;
      }
    } catch {
      /* ignore a malformed tail key — the issue list already reports it */
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return empty;
  return { times: outTimes, components, min, max, colour: meta.colour, path: track.path };
}

// ------------------------------------------------------------ check list

/**
 * Rolls every clip's issues into the one list the Model check panel renders,
 * newest concern first. Per-clip issues are de-duplicated by code so a rig
 * with 90 bones doesn't produce 90 identical lines.
 */
export function buildAnimationChecks(analysis) {
  const items = [];
  const hasAnimation = analysis.clipCount > 0;

  if (!hasAnimation) {
    items.push({ level: 'warn', text: 'This file contains no animation clips.' });
    return { items, hasAnimation };
  }

  items.push({
    level: 'ok',
    text: `${analysis.clipCount} clip${analysis.clipCount === 1 ? '' : 's'} across ${analysis.animatedNodeCount} animated node${analysis.animatedNodeCount === 1 ? '' : 's'}.`,
  });
  items.push({
    level: 'ok',
    text: `${analysis.totalTracks.toLocaleString('en-US')} channels, ${analysis.totalKeyframes.toLocaleString('en-US')} keyframes in total.`,
  });

  // Group every clip issue by code so the list stays readable.
  const grouped = new Map();
  for (const clip of analysis.clips) {
    for (const issue of clip.issues) {
      if (!grouped.has(issue.code)) grouped.set(issue.code, { issue, clips: [] });
      const entry = grouped.get(issue.code);
      if (!entry.clips.includes(clip.name)) entry.clips.push(clip.name);
    }
  }

  const order = { error: 0, warn: 1, info: 2, ok: 3 };
  const grouping = [...grouped.values()].sort(
    (a, b) => order[a.issue.level] - order[b.issue.level]
  );

  for (const { issue, clips } of grouping) {
    const scope =
      clips.length === 1
        ? `"${clips[0]}"`
        : clips.length === analysis.clipCount
          ? 'every clip'
          : `${clips.length} clips`;
    items.push({ level: issue.level, text: `${scope}: ${issue.text}`, code: issue.code });
  }

  const cleanLoops = analysis.clips.filter((c) => !c.isEmpty && c.loop.clean).length;
  if (cleanLoops === analysis.clipCount) {
    items.push({ level: 'ok', text: 'Every clip returns to its first frame — all of them loop cleanly.' });
  }

  const rootMotionClips = analysis.clips.filter((c) => c.rootMotion.present);
  if (rootMotionClips.length) {
    items.push({
      level: 'ok',
      text: `Root motion detected on ${rootMotionClips.length} clip${rootMotionClips.length === 1 ? '' : 's'} (via "${rootMotionClips[0].rootMotion.nodeName}") — drive it from the engine, not in place.`,
    });
  }

  return { items, hasAnimation };
}
