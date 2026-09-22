/**
 * Animation analysis for Strip Animations.
 *
 * Every number here is read from the parsed glTF document — channel counts,
 * keyframe counts and interpolation modes are counted directly from each
 * animation's samplers, never estimated. Each clip is also given a stable
 * `index` (its position in `root.listAnimations()`), which is what removal
 * actually keys off — clip *names* are shown to the user and used for
 * search/duplicate detection, but are never trusted to uniquely identify an
 * Animation object, since duplicate names are common in exported rigs.
 */

const PATH_LABELS = {
  translation: 'position',
  rotation: 'rotation',
  scale: 'scale',
  weights: 'morph',
};

/** @param {import('@gltf-transform/core').Document} document */
export function analyseAnimations(document) {
  const root = document.getRoot();
  const animations = root.listAnimations();

  const clips = animations.map((animation, index) => analyseClip(animation, index));

  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
  const totalKeyframes = clips.reduce((sum, c) => sum + c.keyframeCount, 0);

  flagDuplicates(clips);
  flagSuspicious(clips);

  const skins = root.listSkins();
  const totalBones = new Set(skins.flatMap((s) => s.listJoints())).size;

  let morphTargetCount = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) morphTargetCount += prim.listTargets().length;
  }

  return {
    clips,
    clipCount: clips.length,
    totalDuration,
    totalKeyframes,
    hadMorphTargets: morphTargetCount > 0,
    morphTargetCount,
    model: {
      meshCount: root.listMeshes().length,
      materialCount: root.listMaterials().length,
      skinCount: skins.length,
      boneCount: totalBones,
      animationCount: clips.length,
      totalKeyframes,
    },
  };
}

function analyseClip(animation, index) {
  const channels = animation.listChannels();
  const targetNodes = new Set();
  const interpolations = new Set();
  let keyframeCount = 0;
  let duration = 0;
  let positionTracks = 0;
  let rotationTracks = 0;
  let scaleTracks = 0;
  let morphTracks = 0;
  let brokenTracks = 0;

  for (const channel of channels) {
    const path = channel.getTargetPath();
    const targetNode = channel.getTargetNode();
    const sampler = channel.getSampler();

    if (!targetNode || !sampler) {
      brokenTracks += 1;
      continue;
    }

    targetNodes.add(targetNode);
    interpolations.add(sampler.getInterpolation());

    const input = sampler.getInput();
    if (input) {
      keyframeCount += input.getCount();
      const times = input.getArray();
      if (times && times.length) {
        duration = Math.max(duration, times[times.length - 1]);
      }
    }

    if (path === 'translation') positionTracks += 1;
    else if (path === 'rotation') rotationTracks += 1;
    else if (path === 'scale') scaleTracks += 1;
    else if (path === 'weights') morphTracks += 1;
  }

  return {
    index,
    name: animation.getName() || `Animation ${index + 1}`,
    animation,
    duration,
    trackCount: channels.length,
    keyframeCount,
    positionTracks,
    rotationTracks,
    scaleTracks,
    morphTracks,
    brokenTracks,
    animatedNodeCount: targetNodes.size,
    interpolations: [...interpolations],
    isMorphAnimation: morphTracks > 0,
    isEmpty: channels.length === 0 || keyframeCount === 0,
    warnings: [],
  };
}

/** Exact-name collisions, flagged on every clip that shares a name. */
function flagDuplicates(clips) {
  const byName = new Map();
  for (const clip of clips) {
    const key = clip.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(clip);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const clip of group) {
      clip.warnings.push({
        level: 'duplicate',
        text: `Shares its name with ${group.length - 1} other clip${group.length - 1 === 1 ? '' : 's'}.`,
      });
    }
  }

  // Numbered-suffix duplicates (Walk / Walk.001 / Walk_copy), a common
  // export artefact even when the base names aren't byte-identical.
  const bases = new Map();
  for (const clip of clips) {
    const base = clip.name.replace(/[._-]?(?:\d{2,3}|copy)$/i, '').trim().toLowerCase();
    if (!base || base === clip.name.trim().toLowerCase()) continue;
    if (!bases.has(base)) bases.set(base, []);
    bases.get(base).push(clip);
  }
  for (const [base, group] of bases) {
    const original = clips.find((c) => c.name.trim().toLowerCase() === base);
    if (!original) continue;
    for (const clip of group) {
      if (clip.warnings.some((w) => w.level === 'duplicate')) continue;
      clip.warnings.push({ level: 'duplicate', text: `Possible variant of "${original.name}".` });
    }
  }
}

function flagSuspicious(clips) {
  for (const clip of clips) {
    if (clip.isEmpty) {
      clip.warnings.push({ level: 'empty', text: 'No usable tracks or keyframes — this clip does nothing.' });
      continue;
    }
    if (clip.duration > 0 && clip.duration < 0.15) {
      clip.warnings.push({ level: 'short', text: `Very short (${clip.duration.toFixed(2)}s) — may be a leftover test clip.` });
    }
    if (clip.brokenTracks > 0) {
      clip.warnings.push({
        level: 'broken',
        text: `${clip.brokenTracks} track(s) have no target node or sampler and will be ignored.`,
      });
    }
    const avgKeysPerTrack = clip.trackCount ? clip.keyframeCount / clip.trackCount : 0;
    if (avgKeysPerTrack > 500) {
      clip.warnings.push({
        level: 'dense',
        text: `Unusually dense (~${Math.round(avgKeysPerTrack)} keys/track) — may be baked from a high frame-rate capture.`,
      });
    }
  }
}

export { PATH_LABELS };
