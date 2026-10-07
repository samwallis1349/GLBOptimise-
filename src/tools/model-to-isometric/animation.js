import * as THREE from 'three';
export const FRAME_COUNTS = [4, 6, 8, 12, 16];
// Evenly spaced and excluding the end time, so the last frame loops back into the first.
export function frameTimes(duration, count) { return Array.from({length:count}, (_, i) => duration * i / count); }
// Remove the steady horizontal travel of the top-most animated position track (usually the hips),
// so walks and runs stay on the spot. Side-to-side sway and vertical bob are kept.
export function inPlaceClip(clip, model) {
  model.updateMatrixWorld(true);
  let best = null;
  clip.tracks.forEach((track, index) => {
    const {nodeName, propertyName} = THREE.PropertyBinding.parseTrackName(track.name);
    if (propertyName !== 'position' || track.times.length < 2) return;
    const node = THREE.PropertyBinding.findNode(model, nodeName);
    if (!node) return;
    let depth = 0; for (let n = node; n && n !== model; n = n.parent) depth++;
    if (!best || depth < best.depth) best = {index, node, depth};
  });
  if (!best) return clip;
  const result = clip.clone(), track = result.tracks[best.index], {times, values} = track;
  const toWorld = new THREE.Matrix3().setFromMatrix4(best.node.parent?.matrixWorld ?? new THREE.Matrix4());
  const toLocal = toWorld.clone().invert();
  // glTF cubic-spline tracks store [in-tangent, value, out-tangent] per key.
  const stride = values.length / times.length / 3, valueAt = stride === 3 ? 3 : 0, v = new THREE.Vector3();
  const world = k => v.fromArray(values, k * stride * 3 + valueAt).applyMatrix3(toWorld).clone();
  const first = world(0), last = world(times.length - 1), t0 = times[0], length = times[times.length - 1] - t0;
  for (let k = 0; k < times.length; k++) {
    const amount = (times[k] - t0) / length;
    for (let part = 0; part < stride; part++) {
      const offset = (k * stride + part) * 3, tangent = stride === 3 && part !== 1;
      v.fromArray(values, offset).applyMatrix3(toWorld);
      // Drift per second for tangents, drift so far for values.
      v.x -= tangent ? (last.x - first.x) / length : (last.x - first.x) * amount;
      v.z -= tangent ? (last.z - first.z) / length : (last.z - first.z) * amount;
      v.applyMatrix3(toLocal).toArray(values, offset);
    }
  }
  return result;
}
// One box that holds the model at every sampled time, so the camera never moves between frames.
export function animatedBounds(model, mixer, times) {
  const box = new THREE.Box3();
  for (const time of times) { mixer.setTime(time); model.updateMatrixWorld(true); box.union(new THREE.Box3().setFromObject(model, true)); }
  return box;
}
