import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { CONVERT_FILES_CONFIG } from '../config.js';

export const ext = (name) => (name.split('.').pop() || '').toLowerCase();
export const baseName = (name) => name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'model';

let dracoLoader = null;
function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL || '/'}draco/`);
  }
  return dracoLoader;
}

/** Flattens any .zip files in the drop into their individual entries. */
async function expand(files) {
  const out = [];
  for (const file of files) {
    if (ext(file.name) !== 'zip') {
      out.push(file);
      continue;
    }
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    for (const [path, data] of Object.entries(entries)) {
      if (path.endsWith('/') || path.startsWith('__MACOSX') || !data.length) continue;
      out.push(new File([data], path.split('/').pop()));
    }
  }
  return out;
}

/**
 * Loads a dropped set of files (model + textures/.mtl/.bin, or a .zip of
 * them). Sibling files are resolved by name through a LoadingManager URL
 * modifier, so relative texture paths inside the model still work.
 *
 * The returned `urls` are the object URLs backing the model's textures —
 * revoke them (revokeUrls) once this model is replaced or the tool unmounts.
 *
 * @returns {Promise<{ model: THREE.Object3D, clips: THREE.AnimationClip[], name: string, base: string, notes: {text: string}[], urls: string[] }>}
 */
export async function loadModelFiles(fileList) {
  const notes = [];
  const urls = [];
  try {
    const files = await expand([...fileList]);
    const byName = new Map();
    for (const file of files) {
      const url = URL.createObjectURL(file);
      urls.push(url);
      byName.set(file.name.toLowerCase(), url);
    }

    const main = CONVERT_FILES_CONFIG.mainOrder.map((e) => files.find((f) => ext(f.name) === e)).find(Boolean);
    if (!main) throw new Error(`No model file found. Include one of: ${CONVERT_FILES_CONFIG.mainOrder.map((e) => `.${e}`).join(' ')}`);

    const missing = new Set();
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (url.startsWith('data:') || urls.includes(url)) return url;
      // Blob URLs the loaders create for embedded images pass through untouched.
      if (url.startsWith('blob:') && !/\.[a-z0-9]{2,5}$/i.test(url.split('?')[0])) return url;
      let name = url.split(/[\\/]/).pop().split('?')[0];
      try {
        name = decodeURIComponent(name);
      } catch {
        /* keep the raw name */
      }
      const hit = byName.get(name.toLowerCase());
      if (!hit) missing.add(name);
      return hit || url;
    });
    manager.addHandler(/\.tga$/i, new TGALoader(manager));

    const mainUrl = byName.get(main.name.toLowerCase());
    const kind = ext(main.name);
    let model;
    let clips = [];

    if (kind === 'glb' || kind === 'gltf') {
      const loader = new GLTFLoader(manager);
      loader.setDRACOLoader(getDracoLoader());
      loader.setMeshoptDecoder(MeshoptDecoder);
      try {
        const gltf = await loader.loadAsync(mainUrl);
        model = gltf.scene;
        clips = gltf.animations || [];
      } catch (err) {
        if (/ktx|basis/i.test(String(err?.message))) throw new Error('This file uses KTX2/Basis textures, which the converter can’t decode yet.');
        throw err;
      }
    } else if (kind === 'fbx') {
      model = await new FBXLoader(manager).loadAsync(mainUrl);
      clips = model.animations || [];
    } else if (kind === 'dae') {
      const collada = await new ColladaLoader(manager).loadAsync(mainUrl);
      model = collada.scene;
      clips = collada.scene.animations || [];
    } else if (kind === 'obj') {
      const text = await main.text();
      const loader = new OBJLoader(manager);
      const lib = (text.match(/^\s*mtllib\s+(.+?)\s*$/m) || [])[1];
      if (lib) {
        const mtlUrl = byName.get(lib.split(/[\\/]/).pop().toLowerCase());
        if (mtlUrl) {
          const materials = await new MTLLoader(manager).loadAsync(mtlUrl);
          materials.preload();
          loader.setMaterials(materials);
        } else {
          notes.push({ text: `The OBJ refers to ${lib}, which wasn’t included. Using a plain grey material.` });
        }
      }
      model = loader.parse(text);
    } else if (kind === '3mf') {
      model = await new ThreeMFLoader(manager).loadAsync(mainUrl);
    } else if (kind === '3ds') {
      model = await new TDSLoader(manager).loadAsync(mainUrl);
    } else {
      const geometry = await (kind === 'stl' ? new STLLoader(manager) : new PLYLoader(manager)).loadAsync(mainUrl);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const hasColor = Boolean(geometry.attributes.color);
      const material = new THREE.MeshStandardMaterial({ name: 'Default', color: hasColor ? 0xffffff : 0xb9c0c8, vertexColors: hasColor, roughness: 0.7 });
      model = new THREE.Mesh(geometry, material);
      model.name = baseName(main.name);
    }

    await waitForTextures(manager);

    if (missing.size) {
      const list = [...missing].slice(0, 6).join(', ');
      notes.push({ text: `Missing ${missing.size === 1 ? 'file' : 'files'}: ${list}${missing.size > 6 ? '…' : ''}. Drop them together with the model to keep textures.` });
    }
    const extras = files.length - 1;
    return {
      model,
      clips,
      notes,
      urls,
      base: baseName(main.name),
      name: main.name + (extras > 0 ? `  +${extras} file${extras > 1 ? 's' : ''}` : ''),
    };
  } catch (err) {
    revokeUrls(urls);
    throw err;
  }
}

export function revokeUrls(urls = []) {
  urls.forEach((url) => URL.revokeObjectURL(url));
}

function waitForTextures(manager) {
  return new Promise((resolve) => {
    if (!manager.itemsTotal || manager.itemsLoaded >= manager.itemsTotal) {
      setTimeout(resolve, 50);
      return;
    }
    const previous = manager.onLoad;
    manager.onLoad = () => {
      previous?.();
      resolve();
    };
    setTimeout(resolve, 8000);
  });
}
