/**
 * Game-agent preparation: in-place (root-motion-free) clips and category
 * names for export. Both work on clones, so the imported clips and the
 * model's bones are never modified.
 */
import * as THREE from 'three';
import { CATEGORIES } from './animation.js';

/** Finds the node that carries root motion: the shallowest node with a position track. */
export function findRootMotionNode(clip, root) {
  let best = null;
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    const node = root.getObjectByName(name);
    if (!node) continue;
    let depth = 0;
    for (let p = node.parent; p && p !== root; p = p.parent) depth++;
    if (!best || depth < best.depth) best = { node, track, depth };
  }
  return best;
}

/** Which component of the node's local position points up in the world. */
function verticalAxis(node) {
  node.updateWorldMatrix(true, false);
  const parentRotation = new THREE.Quaternion();
  if (node.parent) node.parent.matrixWorld.decompose(new THREE.Vector3(), parentRotation, new THREE.Vector3());
  const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(parentRotation.invert());
  const a = [Math.abs(upLocal.x), Math.abs(upLocal.y), Math.abs(upLocal.z)];
  return a.indexOf(Math.max(...a));
}

/**
 * Returns { clip, node, distance } where clip is a copy whose root node keeps
 * its first-frame horizontal position for the whole clip (vertical bob is
 * kept). `distance` is how far the root travelled horizontally in the
 * original, in the node's local units; null clip means nothing to remove.
 */
export function makeInPlace(clip, root) {
  const found = findRootMotionNode(clip, root);
  if (!found) return { clip: null, node: null, distance: 0 };
  const { node, track } = found;
  const up = verticalAxis(node);
  const v = track.values;
  const keys = v.length / 3;
  let distance = 0;
  for (let i = 1; i < keys; i++) {
    let d = 0;
    for (let a = 0; a < 3; a++) if (a !== up) d += (v[i * 3 + a] - v[a]) ** 2;
    distance = Math.max(distance, Math.sqrt(d));
  }
  const scale = Math.max(node.position.length(), 1e-6);
  // Ignore sway smaller than 5% of the node's rest offset: that's not travel.
  if (distance < scale * 0.05) return { clip: null, node, distance };
  const copy = clip.clone();
  copy.name = clip.name;
  const t = copy.tracks.find((x) => x.name === track.name);
  const values = t.values.slice();
  for (let i = 1; i < keys; i++) for (let a = 0; a < 3; a++) if (a !== up) values[i * 3 + a] = values[a];
  t.values = values;
  copy.userData = { ...(clip.userData || {}), inPlaceOf: clip };
  return { clip: copy, node, distance };
}

/**
 * Builds the list of clips to export. `mapping` is { categoryId: clip }.
 * With `rename`, a clip mapped to a category is exported under that
 * category's name ("Idle", "Walk"…); a clip mapped to two categories is
 * exported once per name. Names never collide.
 */
export function exportClipList(clips, { mapping = {}, rename = false, inPlace = false, root = null } = {}) {
  const out = [];
  const report = [];
  const used = new Set();
  const unique = (name) => { let n = name, i = 2; while (used.has(n)) n = `${name} (${i++})`; used.add(n); return n; };
  const namesFor = (clip) => (rename ? CATEGORIES.filter((c) => mapping[c.id] === clip).map((c) => c.label) : []);
  for (const clip of clips) {
    let base = clip;
    if (inPlace && root) {
      const r = makeInPlace(clip, root);
      if (r.clip) { base = r.clip; report.push(`${clip.name}: root motion removed from ${r.node.name || 'root'}.`); }
    }
    const names = namesFor(clip);
    if (!names.length) {
      const name = unique(clip.name);
      out.push(base === clip && name === clip.name ? clip : renamed(base, name));
      continue;
    }
    for (const label of names) {
      const name = unique(label);
      out.push(renamed(base, name));
      if (name !== clip.name) report.push(`"${clip.name}" exported as "${name}".`);
    }
  }
  return { clips: out, report };
}

function renamed(clip, name) {
  const c = clip.clone();
  c.name = name;
  return c;
}
