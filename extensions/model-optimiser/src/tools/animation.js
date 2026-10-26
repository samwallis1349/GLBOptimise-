/**
 * Animation Tools edition: list clips (free), keep only the clips you want,
 * and cut keyframes. Runs the site's own Strip Animations and Animation
 * Optimiser engines on a glTF-Transform document read with the API's reader.
 */
import { readDocument, writeDocument } from '../../../../worker/api/glb.js';
import { analyseAnimations } from '../../../../src/tools/strip-animations/StripAnimationsAnalysis.js';
import { stripAnimations } from '../../../../src/tools/strip-animations/StripAnimationsEngine.js';
import { optimiseAnimations } from '../../../../src/tools/animation-optimiser/AnimationOptimiserEngine.js';
import { buildOptions, PRESETS } from '../../../../src/tools/animation-optimiser/config/presets.js';
import { stem } from '../inputs.js';

const clipRow = (c) => ({
  index: c.index,
  name: c.name,
  duration: c.duration,
  keyframes: c.keyframeCount,
  tracks: c.trackCount,
  nodes: c.animatedNodeCount,
  morph: c.isMorphAnimation,
  empty: c.isEmpty,
});

/** Every clip with its length, tracks and keyframes. */
export async function clips(bytes) {
  const a = analyseAnimations(await readDocument(bytes));
  return {
    report: {
      clips: a.clips.map(clipRow),
      totalKeyframes: a.totalKeyframes,
      totalDuration: a.totalDuration,
      bones: a.model.boneCount,
      skins: a.model.skinCount,
      fileBytes: bytes.byteLength,
      warnings: a.clipCount ? [] : ['This model has no animation clips.'],
    },
  };
}

/**
 * Keeps the clips whose indices are in `keep` (the indices `clips` reported)
 * and removes the rest, along with data only they used. The rig is untouched.
 */
export async function strip(bytes, { keep = [] }, name) {
  const document = await readDocument(bytes);
  const before = analyseAnimations(document);
  if (!before.clipCount) throw new Error('This model has no animation clips to strip.');
  const kept = new Set((Array.isArray(keep) ? keep : String(keep).split(',')).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < before.clipCount));
  const remove = before.clips.map((c) => c.index).filter((i) => !kept.has(i));
  if (!remove.length) throw new Error('Every clip is ticked, so nothing would change. Untick the clips you want removed.');
  const keptNames = before.clips.filter((c) => kept.has(c.index)).map((c) => c.name);
  const removedNames = before.clips.filter((c) => !kept.has(c.index)).map((c) => c.name);
  await stripAnimations(document, remove);
  const output = await writeDocument(document);
  const after = analyseAnimations(await readDocument(output));
  return {
    output,
    name: `${stem(name)}-${kept.size ? 'clips' : 'no-anim'}.glb`,
    report: {
      kept: keptNames,
      removed: removedNames,
      keyframesBefore: before.totalKeyframes,
      keyframesAfter: after.totalKeyframes,
      bytesBefore: bytes.byteLength,
      bytesAfter: output.byteLength,
      warnings: kept.size ? [] : ['Every clip was removed; the model keeps its rig in its rest pose.'],
    },
  };
}

/** Removes keyframes the motion doesn't need (and optionally resamples), clip by clip. */
export async function animOptimise(bytes, { preset = 'balanced', fps = 0 }, name) {
  if (!PRESETS[preset]) throw new Error(`Unknown preset '${preset}'.`);
  const document = await readDocument(bytes);
  if (!document.getRoot().listAnimations().length) throw new Error('This model has no animation clips to optimise.');
  const options = buildOptions(preset, { targetFps: Number(fps) || null, collapseConstant: true, removeEmptyClips: false, reduceKeyframes: true });
  const r = await optimiseAnimations(document, options);
  const output = await writeDocument(document);
  const warnings = [];
  if (r.keyframesAfter >= r.keyframesBefore) warnings.push('No keyframes could be removed without changing the motion.');
  if (r.cubicBaked) warnings.push(`${r.cubicBaked} cubic-spline track${r.cubicBaked === 1 ? ' was' : 's were'} converted to linear.`);
  return {
    output,
    name: `${stem(name)}-anim-${preset}.glb`,
    report: {
      preset: PRESETS[preset].label,
      fps: Number(fps) || null,
      keyframesBefore: r.keyframesBefore,
      keyframesAfter: r.keyframesAfter,
      constantCollapsed: r.constantChannelsCollapsed,
      clips: r.clips.map((c) => ({ name: c.name, before: c.keyframesBefore, after: c.keyframesAfter })),
      bytesBefore: bytes.byteLength,
      bytesAfter: output.byteLength,
      warnings,
    },
  };
}
