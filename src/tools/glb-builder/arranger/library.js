import * as THREE from 'three';
import { loadModelFiles, revokeUrls, ext } from '../../convert-files/processing/loadModel.js';
import { disposeModel } from '../../../shared/viewer/disposeModel.js';
import { ARRANGER_CONFIG } from '../config.js';
import { worldBox } from './bounds.js';

/**
 * Source assets: each file is parsed once into a `template` that never enters
 * the scene. Scene instances are SkeletonUtils clones of it, so geometry,
 * materials and textures are shared by every copy — the template owns them,
 * and they are only disposed when the asset leaves the library.
 */

let nextAssetId = 1;

/**
 * Splits a drop into one load job per model file. Loose .bin / texture files
 * ride along with every .gltf / .fbx so their relative paths resolve.
 * @returns {{ jobs: File[][], skipped: string[] }}
 */
export function groupFiles(files) {
  const models = files.filter((file) => ARRANGER_CONFIG.modelExtensions.includes(ext(file.name)));
  const extras = files.filter((file) => !ARRANGER_CONFIG.modelExtensions.includes(ext(file.name)));
  const jobs = models.map((main) => (ext(main.name) === 'glb' ? [main] : [main, ...extras]));
  const skipped = models.length ? [] : extras.map((file) => file.name);
  return { jobs, skipped };
}

function prettyName(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Model';
}

/** Loads one source asset. Thumbnails are rendered separately (renderThumbnails). */
export async function loadAsset(files) {
  const main = files[0];
  const result = await loadModelFiles(files);
  const template = result.model;
  template.updateMatrixWorld(true);
  let skinned = false;
  let meshCount = 0;
  template.traverse((node) => {
    if (node.isSkinnedMesh) skinned = true;
    if (node.isMesh) meshCount += 1;
  });
  if (!meshCount) {
    revokeUrls(result.urls);
    disposeModel(template);
    const error = new Error(result.clips.length ? 'NO_MESH_WITH_CLIPS' : 'This file has no meshes.');
    error.clips = result.clips;
    throw error;
  }
  return {
    id: nextAssetId++,
    filename: main.name,
    name: prettyName(main.name),
    size: main.size,
    template,
    clips: result.clips.filter((clip) => clip.tracks.length),
    skinned,
    urls: result.urls,
    notes: result.notes,
    thumbnail: '',
  };
}

export function disposeAsset(asset) {
  disposeModel(asset.template);
  revokeUrls(asset.urls);
}

/**
 * Renders library thumbnails with one short-lived offscreen renderer, then
 * drops its WebGL context so the textures it uploaded don't linger twice in
 * GPU memory alongside the main viewport.
 */
export async function renderThumbnails(assets, onEach) {
  if (!assets.length) return;
  const size = ARRANGER_CONFIG.thumbnailSize;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x302a24, 1.6));
  const key = new THREE.DirectionalLight(0xffe7c4, 3);
  key.position.set(4, 6, 5);
  const rim = new THREE.DirectionalLight(0xc8d6ff, 1.2);
  rim.position.set(-5, 3, -4);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000);
  try {
    for (const asset of assets) {
      const holder = new THREE.Group();
      holder.add(asset.template);
      scene.add(holder);
      const box = worldBox(holder, false);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 0.001);
      const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05;
      camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.72, 1.15).normalize().multiplyScalar(distance));
      camera.near = distance / 100;
      camera.far = distance * 10;
      camera.updateProjectionMatrix();
      camera.lookAt(sphere.center);
      renderer.render(scene, camera);
      asset.thumbnail = renderer.domElement.toDataURL('image/webp', 0.85);
      holder.remove(asset.template);
      scene.remove(holder);
      onEach?.(asset);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
}

// ---------- animation compatibility ----------

/**
 * Checks an external clip against a model's node names. Only tracks whose
 * target node exists survive; the clip is accepted when nearly all of its
 * tracks bind (no general retargeting is attempted).
 * @returns {THREE.AnimationClip|null}
 */
export function adaptClip(clip, model) {
  const names = new Set();
  model.traverse((node) => names.add(node.name));
  const kept = [];
  for (const track of clip.tracks) {
    const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
    if (names.has(nodeName)) kept.push(track.clone());
  }
  if (!kept.length || kept.length / clip.tracks.length < 0.9) return null;
  // Skeletal clips must actually drive bones of this model.
  let drivesBones = false;
  model.traverse((node) => {
    if (node.isBone && kept.some((track) => track.name.startsWith(`${node.name}.`))) drivesBones = true;
  });
  let modelHasBones = false;
  model.traverse((node) => { if (node.isBone) modelHasBones = true; });
  if (modelHasBones && !drivesBones) return null;
  return new THREE.AnimationClip(clip.name || 'Animation', clip.duration, kept);
}

/** Loads animation clips from an arbitrary GLB/glTF/FBX file. */
export async function loadClipsFromFiles(files) {
  const result = await loadModelFiles(files);
  const clips = result.clips.filter((clip) => clip.tracks.length);
  const model = result.model;
  const urls = result.urls;
  return { clips, model, dispose: () => { disposeModel(model); revokeUrls(urls); } };
}
