/**
 * Export and round-trip verification.
 *
 * The export works on a skeleton-aware clone of the model reset to its rest
 * pose, so the source model, its bones and the live preview are untouched,
 * and the current animation frame is never baked in as the rest pose.
 * Exporter warnings are captured and shown instead of disappearing into the
 * console. After export the file is parsed again and compared with what was
 * expected.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { applyRestPose, inspectModel, materialsOf, texturesOf, trackBinding } from './inspect.js';
import { isMissingTexture } from './formats.js';
import { disposeObject } from './dispose.js';

export const TARGETS = {
  glb: { label: 'GLB (binary glTF)', ext: 'glb', mime: 'model/gltf-binary', rig: true, animation: true },
  gltf: { label: 'glTF (embedded JSON)', ext: 'gltf', mime: 'model/gltf+json', rig: true, animation: true },
  obj: { label: 'OBJ (static mesh)', ext: 'obj', mime: 'text/plain', rig: false, animation: false },
  stl: { label: 'STL (static geometry)', ext: 'stl', mime: 'model/stl', rig: false, animation: false },
};

/** Which targets make sense for this asset, and why the others are disabled. */
export function availableTargets(adapter, stats) {
  return Object.entries(TARGETS).map(([id, t]) => {
    let reason = '';
    if (adapter && !adapter.exportTargets.includes(id)) reason = `Not offered for ${adapter.label} sources.`;
    else if (!t.rig && (stats.hasSkeleton || stats.clipCount > 0)) reason = `${t.ext.toUpperCase()} would discard the skeleton and animation.`;
    else if (stats.meshCount === 0) reason = 'Nothing to export.';
    return { id, ...t, enabled: !reason, reason };
  });
}

export function sanitiseFileName(name, ext) {
  const base = String(name || 'character').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w\- .]+/g, '_').trim() || 'character';
  return `${base}.${ext}`;
}


/** Builds the object that is actually exported. Never touches `model`. */
export function prepareExportScene({ model, restPose, displayTransform = null }) {
  const clone = SkeletonUtils.clone(model);
  if (restPose) applyRestPose(clone, restPose);
  let removedTextures = 0;
  clone.traverse((o) => {
    if (!o.isMesh) return;
    const mats = materialsOf(o).map((m) => {
      const bad = texturesOf(m).filter(([, t]) => isMissingTexture(t));
      if (!bad.length) return m;
      const copy = m.clone();
      for (const [slot] of bad) copy[slot] = null;
      removedTextures += bad.length;
      return copy;
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  let input = clone;
  if (displayTransform) {
    const wrapper = new THREE.Group();
    wrapper.name = (model.name || 'Character') + '_Root';
    wrapper.scale.setScalar(displayTransform.scale || 1);
    wrapper.rotation.set(THREE.MathUtils.degToRad(displayTransform.rotationX || 0), THREE.MathUtils.degToRad(displayTransform.rotationY || 0), 0);
    wrapper.add(clone);
    input = wrapper;
  }
  input.updateMatrixWorld(true);
  return { input, clone, removedTextures };
}

async function captureWarnings(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => {
    const text = args.map((a) => (typeof a === 'string' ? a : a?.name ?? '')).join(' ').replace(/%s/g, '').trim();
    warnings.push(text);
    original.apply(console, args);
  };
  try {
    return { result: await fn(), warnings };
  } finally {
    console.warn = original;
  }
}

/**
 * Exports the model. Returns { blob, fileName, size, warnings, expected }.
 * Throws with a readable message if the exporter fails or produces nothing.
 */
export async function exportAsset({ model, restPose, clips = [], target = 'glb', fileName, displayTransform = null }) {
  const spec = TARGETS[target];
  if (!spec) throw new Error(`Unknown export format "${target}".`);
  const { input, clone, removedTextures } = prepareExportScene({ model, restPose, displayTransform });
  const exportClips = spec.animation ? clips : [];
  const expected = expectedContent(clone, exportClips);
  expected.removedTextures = removedTextures;

  const { result, warnings } = await captureWarnings(async () => {
    if (target === 'glb' || target === 'gltf') {
      return new GLTFExporter().parseAsync(input, {
        binary: target === 'glb',
        animations: exportClips,
        onlyVisible: false,
        embedImages: true,
        maxTextureSize: 8192,
      });
    }
    if (target === 'obj') return new OBJExporter().parse(input);
    return new STLExporter().parse(input, { binary: true });
  });

  let blob;
  if (result instanceof ArrayBuffer) blob = new Blob([result], { type: spec.mime });
  else if (result instanceof DataView) blob = new Blob([result.buffer], { type: spec.mime });
  else if (typeof result === 'string') blob = new Blob([result], { type: spec.mime });
  else blob = new Blob([JSON.stringify(result)], { type: spec.mime });

  if (!blob.size) throw new Error('The exporter produced an empty file.');
  if (removedTextures) warnings.unshift(`${removedTextures} missing texture reference(s) were left out instead of exporting grey placeholders.`);
  const uniqueWarnings = [...new Set(warnings.filter(Boolean))];
  return { blob, fileName: sanitiseFileName(fileName, spec.ext), size: blob.size, warnings: uniqueWarnings, expected, target };
}

function expectedContent(clone, clips) {
  const stats = inspectModel(clone, clips);
  return {
    triangles: stats.triangles,
    meshCount: stats.meshCount,
    skinnedMeshCount: stats.skinnedMeshCount,
    skinBoneCount: stats.skinBoneCount,
    materialCount: stats.materialCount,
    textureCount: stats.textureCount,
    clips: clips.map((c) => ({ name: c.name, tracks: trackBinding(c, clone).bound, duration: c.duration })),
  };
}

/**
 * Reloads an exported file and compares it with what was expected.
 * Returns { checks: [{ label, expected, actual, status }], stats }.
 */
export async function verifyExport({ blob, target, expected }) {
  let root, clips = [];
  if (target === 'glb' || target === 'gltf') {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const data = target === 'glb' ? await blob.arrayBuffer() : await blob.text();
    if (target === 'glb') {
      const magic = new TextDecoder().decode(new Uint8Array(data, 0, 4));
      if (magic !== 'glTF') throw new Error('The exported file does not start with the GLB header.');
    }
    const gltf = await loader.parseAsync(data, '');
    root = gltf.scene; clips = gltf.animations;
  } else if (target === 'obj') {
    root = new OBJLoader().parse(await blob.text());
  } else {
    root = new THREE.Mesh(new STLLoader().parse(await blob.arrayBuffer()));
  }
  const stats = inspectModel(root, clips);
  const checks = [];
  const row = (label, exp, act, status) => checks.push({ label, expected: exp, actual: act, status });

  row('File parsed', 'yes', 'yes', 'pass');
  row('Triangles', expected.triangles, stats.triangles, stats.triangles === expected.triangles ? 'pass' : 'fail');
  if (target === 'glb' || target === 'gltf') {
    // glTF splits multi-material meshes into one mesh per material, so counts may rise.
    row('Meshes', expected.meshCount, stats.meshCount, stats.meshCount >= expected.meshCount ? 'pass' : 'fail');
    row('Skinned meshes', expected.skinnedMeshCount, stats.skinnedMeshCount, stats.skinnedMeshCount >= expected.skinnedMeshCount ? 'pass' : 'fail');
    row('Skeleton bones', expected.skinBoneCount, stats.skinBoneCount, stats.skinBoneCount === expected.skinBoneCount ? 'pass' : 'fail');
    row('Materials', expected.materialCount, stats.materialCount, stats.materialCount >= Math.min(1, expected.materialCount) ? (stats.materialCount === expected.materialCount ? 'pass' : 'warn') : 'fail');
    const expTex = expected.textureCount; // counted after missing-texture placeholders were removed
    row('Textures', expTex, stats.textureCount, stats.textureCount === expTex ? 'pass' : stats.textureCount > 0 || expTex === 0 ? 'warn' : 'fail');
    row('Animation clips', expected.clips.length, clips.length, clips.length === expected.clips.length ? 'pass' : 'fail');
    for (const c of expected.clips) {
      const got = clips.find((x) => x.name === c.name);
      row(`Clip "${c.name}" tracks`, c.tracks, got ? got.tracks.length : 'missing', got && got.tracks.length === c.tracks ? 'pass' : 'fail');
    }
  }
  disposeObject(root);
  return { checks, stats };
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
