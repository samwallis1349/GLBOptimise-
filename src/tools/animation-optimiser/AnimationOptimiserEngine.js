/**
 * Keyframe reduction and animation cleanup, operating directly on a
 * glTF-Transform Document.
 *
 * The guiding rule is that the *motion* is the thing being preserved, not the
 * data. Every reduction here is measured against the curve it replaces, in
 * the units that curve is actually expressed in, and a keyframe is only
 * dropped when re-deriving it from its surviving neighbours lands inside the
 * caller's tolerance. That is why rotation is compared as an angle rather
 * than as four component deltas: a quaternion's components can differ
 * substantially while describing almost the same orientation, so a
 * per-component epsilon would happily throw away visible rotation in one
 * place and preserve invisible noise in another.
 *
 * Three behaviours worth knowing about before reading the code:
 *
 *  - LINEAR rotation is interpolated with slerp, because that is what the
 *    glTF spec says a renderer will do with it. Simplifying against lerp
 *    would measure error against a curve no engine plays.
 *
 *  - CUBICSPLINE channels are baked to LINEAR when reduction runs. Their
 *    output stores in/out tangents around each value, so "removing a
 *    keyframe" is not the same operation at all; sampling the spline and
 *    re-simplifying is both correct and what the caller actually wants.
 *    Channels are left untouched when reduction is off.
 *
 *  - A channel whose value never changes collapses to two keyframes rather
 *    than being deleted. Deleting it would hand the node back to its rest
 *    transform, which other clips may rely on — two keys is pose-identical
 *    and still throws away everything in between.
 */

import { prune } from '@gltf-transform/functions';

const PATH_COMPONENTS = { translation: 3, rotation: 4, scale: 3 };

/**
 * How many points each original rotation segment is probed at while
 * simplifying. Four (so quarter, half, three-quarter) is where the measured
 * curve error stops improving materially on real mocap — the remaining gap
 * is far below any tolerance a user can select, and every extra probe costs
 * a slerp per interior key per recursion step.
 */
const ROTATION_PROBES = 4;

// ---------------------------------------------------------------- maths

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpVec(a, b, t, out) {
  for (let i = 0; i < a.length; i += 1) out[i] = lerp(a[i], b[i], t);
  return out;
}

function dot4(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/**
 * Spherical linear interpolation, matching the glTF spec's definition for
 * LINEAR rotation channels. Falls back to normalised lerp when the two
 * quaternions are nearly identical, where slerp's sin() division loses
 * precision.
 */
function slerp(a, b, t, out) {
  let cos = dot4(a, b);
  const sign = cos < 0 ? -1 : 1; // take the short way round
  cos *= sign;

  if (cos > 0.9995) {
    for (let i = 0; i < 4; i += 1) out[i] = lerp(a[i], sign * b[i], t);
    return normaliseQuat(out);
  }

  const theta = Math.acos(cos);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  for (let i = 0; i < 4; i += 1) out[i] = wa * a[i] + wb * sign * b[i];
  return normaliseQuat(out);
}

function normaliseQuat(q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  for (let i = 0; i < 4; i += 1) q[i] /= len;
  return q;
}

/** Angle in radians between two orientations; sign-insensitive (q ≡ -q). */
function quatAngle(a, b) {
  const cos = Math.min(1, Math.abs(dot4(a, b)));
  return 2 * Math.acos(cos);
}

function vecDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** Cubic Hermite, the interpolation glTF defines for CUBICSPLINE output. */
function hermite(p0, m0, p1, m1, t, dt, out) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  for (let i = 0; i < out.length; i += 1) {
    out[i] = h00 * p0[i] + h10 * dt * m0[i] + h01 * p1[i] + h11 * dt * m1[i];
  }
  return out;
}

// ------------------------------------------------------------ decoding

/**
 * Pulls a sampler into plain arrays: one time per keyframe, one value array
 * per keyframe. CUBICSPLINE tangents are read alongside so the curve can be
 * evaluated faithfully when resampling.
 */
function decodeSampler(sampler, componentCount) {
  const input = sampler.getInput();
  const output = sampler.getOutput();
  const interpolation = sampler.getInterpolation() || 'LINEAR';
  if (!input || !output) return null;

  const keyCount = input.getCount();
  const times = Array.from(input.getArray() ?? []).slice(0, keyCount);
  const cubic = interpolation === 'CUBICSPLINE';

  const values = [];
  const inTangents = [];
  const outTangents = [];
  const scratch = new Array(componentCount).fill(0);

  for (let i = 0; i < keyCount; i += 1) {
    if (cubic) {
      inTangents.push([...output.getElement(i * 3, scratch)]);
      values.push([...output.getElement(i * 3 + 1, scratch)]);
      outTangents.push([...output.getElement(i * 3 + 2, scratch)]);
    } else {
      values.push([...output.getElement(i, scratch)]);
    }
  }

  return { times, values, inTangents, outTangents, interpolation, cubic, componentCount };
}

/** Evaluates a decoded channel at an arbitrary time, honouring its interpolation. */
function evaluate(curve, time, path, out) {
  const { times, values, cubic, interpolation } = curve;
  const n = times.length;
  if (n === 0) return out;
  if (time <= times[0]) return copyInto(values[0], out);
  if (time >= times[n - 1]) return copyInto(values[n - 1], out);

  // Binary search for the segment containing `time`.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) lo = mid;
    else hi = mid;
  }

  const span = times[hi] - times[lo];
  const t = span > 0 ? (time - times[lo]) / span : 0;

  if (interpolation === 'STEP') return copyInto(values[lo], out);
  if (cubic) {
    hermite(values[lo], curve.outTangents[lo], values[hi], curve.inTangents[hi], t, span, out);
    return path === 'rotation' ? normaliseQuat(out) : out;
  }
  if (path === 'rotation') return slerp(values[lo], values[hi], t, out);
  return lerpVec(values[lo], values[hi], t, out);
}

function copyInto(src, out) {
  for (let i = 0; i < src.length; i += 1) out[i] = src[i];
  return out;
}

// ------------------------------------------------------- simplification

/**
 * Douglas–Peucker over a keyframe channel.
 *
 * Endpoints are always kept — dropping either would shorten the clip or move
 * its start pose. Every interior key is measured against the curve its
 * surviving neighbours would produce, and the worst offender in a span is
 * reinstated before the span is split and rechecked. That ordering matters:
 * reinstating the largest error first means the keys that survive are the
 * ones carrying the motion's shape, not simply the ones that happened to be
 * visited first.
 */
function simplifyLinear(curve, path, tolerance) {
  const { times, values } = curve;
  const n = times.length;
  if (n <= 2) return times.map((_, i) => i);

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const predicted = new Array(curve.componentCount).fill(0);
  const originalMid = new Array(curve.componentCount).fill(0);
  const stack = [[0, n - 1]];

  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;

    const span = times[hi] - times[lo];
    let worstError = -1;
    let worstIndex = -1;

    for (let i = lo + 1; i < hi; i += 1) {
      const t = span > 0 ? (times[i] - times[lo]) / span : 0;
      let error;
      if (path === 'rotation') {
        slerp(values[lo], values[hi], t, predicted);
        error = quatAngle(values[i], predicted);
      } else {
        lerpVec(values[lo], values[hi], t, predicted);
        error = vecDistance(values[i], predicted);
      }
      if (error > worstError) {
        worstError = error;
        worstIndex = i;
      }

      // Rotation needs probing *between* the keys as well.
      //
      // For a linear channel the largest gap between the original polyline
      // and a chord across it always falls on one of the original
      // keyframes, so testing the keyframes alone bounds the whole segment
      // exactly. Slerp is not linear — it traces an arc on the quaternion
      // sphere — so the widest gap routinely sits between two keys, and a
      // keyframe-only test reports an error well under what the clip
      // actually plays. Without these probes the tolerance is not a bound
      // at all, just a number the keyframes happen to satisfy.
      if (path === 'rotation' && i + 1 <= hi) {
        const segmentStart = times[i];
        const segmentSpan = times[i + 1] - segmentStart;
        for (let s = 1; s < ROTATION_PROBES; s += 1) {
          const u = s / ROTATION_PROBES;
          const probeTime = segmentStart + segmentSpan * u;
          const probeT = span > 0 ? (probeTime - times[lo]) / span : 0;
          slerp(values[lo], values[hi], probeT, predicted);
          slerp(values[i], values[i + 1], u, originalMid);
          const probeError = quatAngle(originalMid, predicted);
          if (probeError > worstError) {
            worstError = probeError;
            // Reinstating the key that opens this segment is what splits it;
            // the recursion re-probes both halves straight afterwards.
            worstIndex = i;
          }
        }
      }
    }

    if (worstError > tolerance && worstIndex > 0) {
      keep[worstIndex] = 1;
      stack.push([lo, worstIndex], [worstIndex, hi]);
    }
  }

  const kept = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) kept.push(i);
  return kept;
}

/**
 * STEP channels hold their value until the next key, so they cannot be
 * reconstructed by interpolation — the only redundant key is one that repeats
 * the value before it.
 */
function simplifyStep(curve, path, tolerance) {
  const { values, times } = curve;
  const n = times.length;
  if (n <= 2) return times.map((_, i) => i);

  const kept = [0];
  for (let i = 1; i < n - 1; i += 1) {
    const previous = values[kept[kept.length - 1]];
    const distance =
      path === 'rotation' ? quatAngle(values[i], previous) : vecDistance(values[i], previous);
    if (distance > tolerance) kept.push(i);
  }
  kept.push(n - 1);
  return kept;
}

/** Resamples a channel onto a fixed frame rate, evaluating its real curve. */
function resample(curve, path, fps) {
  const { times } = curve;
  if (times.length < 2 || fps <= 0) return curve;

  const start = times[0];
  const end = times[times.length - 1];
  const step = 1 / fps;
  const frames = Math.max(1, Math.round((end - start) / step));

  const newTimes = [];
  const newValues = [];
  const scratch = new Array(curve.componentCount).fill(0);

  for (let i = 0; i <= frames; i += 1) {
    const time = Math.min(end, start + i * step);
    newTimes.push(time);
    newValues.push([...evaluate(curve, time, path, scratch)]);
  }
  // Always land exactly on the original end time, so the clip keeps its length.
  if (newTimes[newTimes.length - 1] !== end) {
    newTimes.push(end);
    newValues.push([...evaluate(curve, end, path, scratch)]);
  }

  return {
    ...curve,
    times: newTimes,
    values: newValues,
    inTangents: [],
    outTangents: [],
    interpolation: curve.interpolation === 'STEP' ? 'STEP' : 'LINEAR',
    cubic: false,
  };
}

function isConstant(curve, path, tolerance) {
  const { values } = curve;
  if (values.length < 3) return false;
  const first = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const distance =
      path === 'rotation' ? quatAngle(values[i], first) : vecDistance(values[i], first);
    if (distance > tolerance) return false;
  }
  return true;
}

// ------------------------------------------------------------ main pass

/**
 * @typedef {object} OptimiseOptions
 * @property {boolean} reduceKeyframes
 * @property {number}  positionTolerance model units
 * @property {number}  rotationTolerance radians
 * @property {number}  scaleTolerance    ratio
 * @property {number|null} targetFps     null keeps each clip's own rate
 * @property {boolean} collapseConstant
 * @property {boolean} removeEmptyClips
 */

/**
 * Optimises every animation in `document` in place.
 *
 * @param {import('@gltf-transform/core').Document} document
 * @param {OptimiseOptions} options
 * @param {(fraction: number, label: string) => void} [onProgress]
 * @returns {Promise<object>} per-clip and total before/after counts
 */
export async function optimiseAnimations(document, options, onProgress) {
  const root = document.getRoot();
  const animations = root.listAnimations();

  const report = {
    clips: [],
    keyframesBefore: 0,
    keyframesAfter: 0,
    channelsBefore: 0,
    channelsAfter: 0,
    constantChannelsCollapsed: 0,
    clipsRemoved: 0,
    resampledChannels: 0,
    cubicBaked: 0,
  };

  for (let index = 0; index < animations.length; index += 1) {
    const animation = animations[index];
    onProgress?.(index / Math.max(animations.length, 1), animation.getName() || `Clip ${index + 1}`);

    const clipReport = {
      index,
      name: animation.getName() || `Animation ${index + 1}`,
      keyframesBefore: 0,
      keyframesAfter: 0,
      channelsBefore: 0,
      channelsAfter: 0,
      constantCollapsed: 0,
      duration: 0,
    };

    for (const channel of animation.listChannels()) {
      const path = channel.getTargetPath();
      const sampler = channel.getSampler();
      const componentCount = PATH_COMPONENTS[path];

      // `weights` channels carry one value per morph target, so their width
      // is per-mesh rather than fixed; read it off the accessor instead.
      const width = componentCount ?? sampler?.getOutput()?.getElementSize() ?? 1;
      if (!sampler) continue;

      let curve = decodeSampler(sampler, width);
      if (!curve || curve.times.length === 0) continue;

      clipReport.channelsBefore += 1;
      clipReport.keyframesBefore += curve.times.length;
      clipReport.duration = Math.max(clipReport.duration, curve.times[curve.times.length - 1]);

      const originalCount = curve.times.length;
      const tolerance = toleranceFor(path, options);

      // 1. Resample to a fixed rate, if the caller asked for one and the
      //    channel is currently denser than that.
      if (options.targetFps) {
        const currentRate = estimateRate(curve.times);
        if (currentRate > options.targetFps * 1.02) {
          curve = resample(curve, path, options.targetFps);
          report.resampledChannels += 1;
        }
      }

      // 2. CUBICSPLINE has to become LINEAR before it can be simplified.
      if (curve.cubic && options.reduceKeyframes) {
        curve = resample(curve, path, estimateRate(curve.times) || 30);
        report.cubicBaked += 1;
      }

      // 3. Collapse a channel that never actually moves.
      let collapsed = false;
      if (options.collapseConstant && isConstant(curve, path, tolerance)) {
        const last = curve.times.length - 1;
        curve = {
          ...curve,
          times: [curve.times[0], curve.times[last]],
          values: [curve.values[0], curve.values[0]],
          inTangents: [],
          outTangents: [],
          interpolation: curve.cubic ? 'LINEAR' : curve.interpolation,
          cubic: false,
        };
        collapsed = true;
        clipReport.constantCollapsed += 1;
        report.constantChannelsCollapsed += 1;
      }

      // 4. Drop keyframes the remaining ones can reproduce.
      if (options.reduceKeyframes && !collapsed && !curve.cubic) {
        const kept =
          curve.interpolation === 'STEP'
            ? simplifyStep(curve, path, tolerance)
            : simplifyLinear(curve, path, tolerance);
        if (kept.length < curve.times.length) {
          curve = {
            ...curve,
            times: kept.map((i) => curve.times[i]),
            values: kept.map((i) => curve.values[i]),
          };
        }
      }

      if (curve.times.length !== originalCount || collapsed || curve.interpolation !== sampler.getInterpolation()) {
        writeCurveBack(document, sampler, curve, width);
      }

      clipReport.channelsAfter += 1;
      clipReport.keyframesAfter += curve.times.length;
    }

    clipReport.removed = false;
    if (options.removeEmptyClips && clipReport.keyframesAfter === 0) {
      for (const channel of animation.listChannels()) channel.dispose();
      for (const sampler of animation.listSamplers()) sampler.dispose();
      animation.dispose();
      clipReport.removed = true;
      report.clipsRemoved += 1;
    }

    report.clips.push(clipReport);
    report.keyframesBefore += clipReport.keyframesBefore;
    report.keyframesAfter += clipReport.removed ? 0 : clipReport.keyframesAfter;
    report.channelsBefore += clipReport.channelsBefore;
    report.channelsAfter += clipReport.removed ? 0 : clipReport.channelsAfter;
  }

  onProgress?.(1, 'Pruning');

  // Same safe-prune configuration the other tools use: keepLeaves protects
  // bone/joint nodes from being swept away once a clip stops driving them.
  await document.transform(
    prune({
      keepExtras: true,
      keepAttributes: true,
      keepSolidTextures: true,
      keepLeaves: true,
    })
  );

  return report;
}

function toleranceFor(path, options) {
  if (path === 'rotation') return options.rotationTolerance;
  if (path === 'scale') return options.scaleTolerance;
  if (path === 'weights') return options.scaleTolerance;
  return options.positionTolerance;
}

/** Median-based, so one long pause between keys doesn't skew the estimate. */
function estimateRate(times) {
  if (times.length < 2) return 0;
  const deltas = [];
  for (let i = 1; i < times.length; i += 1) {
    const delta = times[i] - times[i - 1];
    if (delta > 0) deltas.push(delta);
  }
  if (!deltas.length) return 0;
  deltas.sort((a, b) => a - b);
  const mid = deltas.length >> 1;
  const median = deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
  return median > 0 ? 1 / median : 0;
}

/**
 * Replaces a sampler's accessors with the simplified curve.
 *
 * New accessors are created rather than the old arrays being mutated because
 * a sampler's input accessor is frequently shared between channels — several
 * bones keyed on the same timeline is the normal case, not the exception —
 * and writing a shorter array into a shared accessor would corrupt every
 * other channel pointing at it.
 */
function writeCurveBack(document, sampler, curve, width) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const count = curve.times.length;

  const timeArray = new Float32Array(count);
  for (let i = 0; i < count; i += 1) timeArray[i] = curve.times[i];

  const valueArray = new Float32Array(count * width);
  for (let i = 0; i < count; i += 1) {
    for (let c = 0; c < width; c += 1) valueArray[i * width + c] = curve.values[i][c] ?? 0;
  }

  const input = document
    .createAccessor()
    .setType('SCALAR')
    .setArray(timeArray)
    .setBuffer(buffer);

  const output = document
    .createAccessor()
    .setType(width === 4 ? 'VEC4' : width === 3 ? 'VEC3' : 'SCALAR')
    .setArray(valueArray)
    .setBuffer(buffer);

  const previousInput = sampler.getInput();
  const previousOutput = sampler.getOutput();

  sampler.setInput(input);
  sampler.setOutput(output);
  sampler.setInterpolation(curve.interpolation === 'STEP' ? 'STEP' : 'LINEAR');

  // Only dispose the old accessors once nothing else points at them; prune()
  // would collect them anyway, but releasing here keeps peak memory lower on
  // big mocap files.
  disposeIfUnused(previousInput);
  disposeIfUnused(previousOutput);
}

function disposeIfUnused(accessor) {
  if (!accessor) return;
  const stillUsed = accessor.listParents().some((parent) => parent.propertyType !== 'Root');
  if (!stillUsed) accessor.dispose();
}
