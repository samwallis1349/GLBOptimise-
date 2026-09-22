/**
 * Before/after measurement for Animation Optimiser.
 *
 * Deliberately narrower than Animation Inspector's analysis: this tool does
 * not need to diagnose a file, it needs to say truthfully what changed. So
 * everything here is a count taken straight off the sampler accessors, and
 * the same function runs against the original document and the optimised one
 * — the "after" figures are measured from the real exported result rather
 * than predicted from what the engine believes it did.
 */

/** @param {import('@gltf-transform/core').Document} document */
export function measureAnimations(document) {
  const root = document.getRoot();
  const animations = root.listAnimations();

  const clips = animations.map((animation, index) => {
    const channels = animation.listChannels();
    let keyframeCount = 0;
    let duration = 0;
    const deltas = [];
    const interpolations = new Set();
    const nodes = new Set();

    for (const channel of channels) {
      const sampler = channel.getSampler();
      const node = channel.getTargetNode();
      const input = sampler?.getInput();
      if (!sampler || !input) continue;

      if (node) nodes.add(node);
      interpolations.add(sampler.getInterpolation() || 'LINEAR');
      keyframeCount += input.getCount();

      const times = input.getArray();
      if (times && times.length) {
        duration = Math.max(duration, times[times.length - 1]);
        for (let i = 1; i < times.length; i += 1) {
          const delta = times[i] - times[i - 1];
          if (delta > 0) deltas.push(delta);
        }
      }
    }

    return {
      index,
      name: animation.getName() || `Animation ${index + 1}`,
      duration,
      keyframeCount,
      channelCount: channels.length,
      animatedNodeCount: nodes.size,
      frameRate: rateFrom(deltas),
      interpolations: [...interpolations],
    };
  });

  return {
    clips,
    clipCount: clips.length,
    totalKeyframes: clips.reduce((sum, c) => sum + c.keyframeCount, 0),
    totalChannels: clips.reduce((sum, c) => sum + c.channelCount, 0),
    totalDuration: clips.reduce((sum, c) => sum + c.duration, 0),
  };
}

function rateFrom(deltas) {
  if (!deltas.length) return 0;
  const sorted = [...deltas].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median > 0 ? 1 / median : 0;
}

/**
 * Pairs each original clip with its optimised counterpart by name, falling
 * back to index. Clips the engine removed are reported as removed rather
 * than silently dropped from the table — a clip vanishing from a model is
 * exactly the kind of thing a user needs told, not hidden.
 */
export function diffMeasurements(before, after) {
  const afterByName = new Map();
  for (const clip of after.clips) {
    if (!afterByName.has(clip.name)) afterByName.set(clip.name, []);
    afterByName.get(clip.name).push(clip);
  }

  const rows = before.clips.map((originalClip) => {
    const pool = afterByName.get(originalClip.name);
    const optimisedClip = pool?.shift() ?? after.clips[originalClip.index] ?? null;

    const keyframesAfter = optimisedClip?.keyframeCount ?? 0;
    const saved = originalClip.keyframeCount - keyframesAfter;

    return {
      name: originalClip.name,
      removed: !optimisedClip,
      duration: originalClip.duration,
      durationAfter: optimisedClip?.duration ?? 0,
      keyframesBefore: originalClip.keyframeCount,
      keyframesAfter,
      channelsBefore: originalClip.channelCount,
      channelsAfter: optimisedClip?.channelCount ?? 0,
      frameRateBefore: originalClip.frameRate,
      frameRateAfter: optimisedClip?.frameRate ?? 0,
      saved,
      savedPercent: originalClip.keyframeCount > 0 ? (saved / originalClip.keyframeCount) * 100 : 0,
    };
  });

  const keyframesSaved = before.totalKeyframes - after.totalKeyframes;

  return {
    rows,
    keyframesBefore: before.totalKeyframes,
    keyframesAfter: after.totalKeyframes,
    keyframesSaved,
    keyframePercent: before.totalKeyframes > 0 ? (keyframesSaved / before.totalKeyframes) * 100 : 0,
    channelsBefore: before.totalChannels,
    channelsAfter: after.totalChannels,
    clipsBefore: before.clipCount,
    clipsAfter: after.clipCount,
  };
}

/**
 * Sanity checks run against the re-read export, not against the in-memory
 * document. Anything that would make the optimised file behave differently
 * from the original — a clip that changed length, a clip that disappeared
 * without being asked for — is surfaced as a warning rather than trusted.
 */
export function validateOptimisation({ before, after, removeEmptyClips }) {
  const items = [];

  const lostClips = before.clipCount - after.clipCount;
  if (lostClips > 0 && !removeEmptyClips) {
    items.push({
      level: 'error',
      text: `${lostClips} clip${lostClips === 1 ? '' : 's'} went missing, and empty-clip removal was switched off.`,
    });
  } else if (lostClips > 0) {
    items.push({
      level: 'ok',
      text: `${lostClips} empty clip${lostClips === 1 ? '' : 's'} removed, as requested.`,
    });
  } else {
    items.push({ level: 'ok', text: `All ${after.clipCount} clips preserved.` });
  }

  const beforeNames = new Set(before.clips.map((c) => c.name));
  const missing = [...beforeNames].filter(
    (name) => !after.clips.some((c) => c.name === name)
  );
  if (missing.length && !removeEmptyClips) {
    items.push({ level: 'error', text: `Missing clip names: ${missing.slice(0, 3).join(', ')}.` });
  }

  let driftedClips = 0;
  for (const clip of before.clips) {
    const match = after.clips.find((c) => c.name === clip.name);
    if (!match) continue;
    if (Math.abs(match.duration - clip.duration) > 1e-3) driftedClips += 1;
  }
  if (driftedClips > 0) {
    items.push({
      level: 'warn',
      text: `${driftedClips} clip${driftedClips === 1 ? '' : 's'} changed length by more than a millisecond.`,
    });
  } else {
    items.push({ level: 'ok', text: 'Every clip kept its original length.' });
  }

  const emptied = after.clips.filter((c) => c.keyframeCount === 0);
  if (emptied.length) {
    items.push({
      level: 'warn',
      text: `${emptied.length} clip${emptied.length === 1 ? '' : 's'} came out with no keyframes.`,
    });
  }

  return {
    items,
    ok: !items.some((i) => i.level === 'error'),
  };
}
