import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Loads a GLB / glTF asset (as grouped by collectAssets() in
 * shared/glb/analyseGLB.js) into a Three.js scene graph for previewing.
 * Decoders come from bundled local assets — no CDN.
 *
 * Also returns `meshObjects`: glTF mesh index → the THREE.Mesh objects the
 * loader created for it, via GLTFLoader's parser associations. That lets
 * the inspection UIs highlight "Mesh 3" from the analysis in the viewport.
 */

let loaderPromise = null;

async function createLoader() {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${import.meta.env.BASE_URL || '/'}draco/`);
  loader.setDRACOLoader(draco);
  try {
    const { MeshoptDecoder } = await import('meshoptimizer');
    await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
  } catch (err) {
    console.warn('[AssetBench] Meshopt decoder unavailable for preview.', err);
  }
  return loader;
}

function getLoader() {
  if (!loaderPromise) loaderPromise = createLoader();
  return loaderPromise;
}

/**
 * @param {{ kind: 'glb'|'gltf', main: File, siblings: File[] }} asset
 * @returns {Promise<{ scene: THREE.Group, animations: THREE.AnimationClip[], meshObjects: Map<number, THREE.Mesh[]> }>}
 */
export async function loadModel(asset) {
  const base = await getLoader();
  const urls = [];
  let loader = base;

  if (asset.kind === 'gltf') {
    // Resolve sibling .bin / textures by filename through a scoped manager.
    const byName = new Map();
    for (const f of asset.siblings) {
      const url = URL.createObjectURL(f);
      urls.push(url);
      byName.set(f.name.toLowerCase(), url);
    }
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
      let name = url.split(/[\\/]/).pop().split('?')[0];
      try {
        name = decodeURIComponent(name);
      } catch {
        /* keep raw */
      }
      return byName.get(name.toLowerCase()) || url;
    });
    loader = new GLTFLoader(manager);
    loader.setDRACOLoader(base.dracoLoader);
    if (base.meshoptDecoder) loader.setMeshoptDecoder(base.meshoptDecoder);
  }

  const data = asset.kind === 'glb' ? await asset.main.arrayBuffer() : await asset.main.text();
  try {
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(data, '', resolve, (err) => reject(err instanceof Error ? err : new Error('Failed to parse model for preview.')));
    });
    const meshObjects = new Map();
    for (const [object, assoc] of gltf.parser.associations) {
      if (object?.isMesh && assoc?.meshes != null) {
        if (!meshObjects.has(assoc.meshes)) meshObjects.set(assoc.meshes, []);
        meshObjects.get(assoc.meshes).push(object);
      }
    }
    return { scene: gltf.scene, animations: gltf.animations || [], meshObjects };
  } finally {
    // Textures are uploaded by now; sibling URLs aren't needed after parse.
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 5000);
  }
}
