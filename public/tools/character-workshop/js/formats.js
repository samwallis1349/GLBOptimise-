/**
 * Format adapters. Each adapter says what its format can carry and turns a
 * source file into the common internal form the rest of the workshop uses:
 *
 *   { root: THREE.Object3D, clips: THREE.AnimationClip[], notes: string[] }
 *
 * The UI never asks which loader ran; it reads the adapter's capability
 * flags and the loaded scene. To add a format later, add an entry to
 * ADAPTERS — nothing else needs to change.
 *
 * status: 'tested'       — verified end-to-end with real files (see tests).
 *         'static'       — loads geometry only; no rig or animation by design.
 *         'experimental' — loads some files; expect gaps.
 *         'unsupported'  — recognised, explained, not loaded in the browser.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { USDZLoader } from 'three/addons/loaders/USDZLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Draco decoder (three.js r170, gltf build) ships next to this page, so
// compressed GLBs decode offline and in sandboxes that block CDN fetches.
const DRACO_PATH = new URL('../draco/', import.meta.url).href;

/** Grey 1×1 PNG used in place of a texture file that was not supplied. */
export const MISSING_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoaGgAAAMEAYFL09IQAAAAAElFTkSuQmCC';

const STATIC_LIMITS = ['No skeleton or skin weights — the format cannot store them.', 'No animation clips.'];

function staticMaterial(geometry) {
  const hasColor = !!geometry.getAttribute('color');
  return new THREE.MeshStandardMaterial({ color: hasColor ? 0xffffff : 0xb8bcc4, vertexColors: hasColor, roughness: 0.7, metalness: 0.05 });
}

function geometryToRoot(geometry, name) {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, staticMaterial(geometry));
  mesh.name = name;
  const root = new THREE.Group();
  root.name = name;
  root.add(mesh);
  return root;
}

export const ADAPTERS = [
  {
    id: 'glb', label: 'GLB', extensions: ['glb'], status: 'tested',
    rig: true, animation: true, materials: true, textures: true,
    exportTargets: ['glb', 'gltf'],
    limitations: ['KTX2/Basis textures are not decoded in this preview.'],
    async load({ buffer, manager, missing }) {
      const gltf = await gltfLoader(manager).parseAsync(buffer, '');
      markMissingGltfTextures(gltf, missing);
      return { root: gltf.scene, clips: gltf.animations, notes: [] };
    },
  },
  {
    id: 'gltf', label: 'glTF', extensions: ['gltf'], status: 'tested',
    rig: true, animation: true, materials: true, textures: true,
    exportTargets: ['glb', 'gltf'],
    limitations: ['External .bin and texture files must be selected together with the .gltf.'],
    async load({ text, manager, missing }) {
      const gltf = await gltfLoader(manager).parseAsync(text, '');
      markMissingGltfTextures(gltf, missing);
      return { root: gltf.scene, clips: gltf.animations, notes: [] };
    },
  },
  {
    id: 'fbx', label: 'FBX', extensions: ['fbx'], status: 'tested',
    rig: true, animation: true, materials: true, textures: true,
    exportTargets: ['glb', 'gltf'],
    limitations: [
      'FBX Phong/Lambert materials are approximated as PBR materials when exported to GLB.',
      'Textures referenced by the FBX must be selected with it, unless they are embedded.',
      'FBX 6.x (pre-2011) ASCII files and NURBS-only scenes are not supported by the loader.',
      'Constraints, IK and custom properties are not converted.',
    ],
    async load({ buffer, manager }) {
      const root = new FBXLoader(manager).parse(buffer, '');
      return { root, clips: root.animations ?? [], notes: [] };
    },
  },
  {
    id: 'obj', label: 'OBJ', extensions: ['obj'], status: 'static', staticOnly: true,
    rig: false, animation: false, materials: true, textures: true,
    exportTargets: ['glb', 'gltf', 'obj', 'stl'],
    limitations: [...STATIC_LIMITS, 'Materials need the matching .mtl (and textures) selected with the .obj.'],
    async load({ text, files, manager }) {
      const loader = new OBJLoader(manager);
      const notes = [];
      const mtl = files.find((f) => extensionOf(f.name) === 'mtl');
      if (mtl) {
        const materials = new MTLLoader(manager).parse(await mtl.text(), '');
        materials.preload();
        loader.setMaterials(materials);
      } else if (/^\s*mtllib\s+/m.test(text)) {
        notes.push('The OBJ references a .mtl file that was not selected, so default grey materials are used.');
      }
      const root = loader.parse(text);
      return { root, clips: [], notes };
    },
  },
  {
    id: 'stl', label: 'STL', extensions: ['stl'], status: 'static', staticOnly: true,
    rig: false, animation: false, materials: false, textures: false,
    exportTargets: ['glb', 'gltf', 'obj', 'stl'],
    limitations: [...STATIC_LIMITS, 'STL has no materials, UVs or textures; a default material is applied.'],
    async load({ buffer, name }) {
      return { root: geometryToRoot(new STLLoader().parse(buffer), name), clips: [], notes: [] };
    },
  },
  {
    id: 'ply', label: 'PLY', extensions: ['ply'], status: 'static', staticOnly: true,
    rig: false, animation: false, materials: false, textures: false,
    exportTargets: ['glb', 'gltf', 'obj', 'stl'],
    limitations: [...STATIC_LIMITS, 'Vertex colours are kept; materials and textures are not part of PLY.'],
    async load({ buffer, name }) {
      return { root: geometryToRoot(new PLYLoader().parse(buffer), name), clips: [], notes: [] };
    },
  },
  {
    id: 'dae', label: 'DAE', extensions: ['dae'], status: 'experimental',
    rig: true, animation: true, materials: true, textures: true,
    exportTargets: ['glb', 'gltf'],
    limitations: ['Collada support is experimental: some skinned files load in a bind pose with no clips, and kinematics are ignored.'],
    async load({ text, manager }) {
      const collada = new ColladaLoader(manager).parse(text, '');
      if (!collada) throw new Error('The Collada file could not be parsed.');
      const clips = collada.scene.animations ?? collada.animations ?? [];
      return { root: collada.scene, clips, notes: [] };
    },
  },
  {
    id: '3mf', label: '3MF', extensions: ['3mf'], status: 'static', staticOnly: true,
    rig: false, animation: false, materials: true, textures: true,
    exportTargets: ['glb', 'gltf', 'obj', 'stl'],
    limitations: [...STATIC_LIMITS, '3MF is a printing format; build-plate transforms are applied as-is.'],
    async load({ buffer, manager }) {
      return { root: new ThreeMFLoader(manager).parse(buffer), clips: [], notes: [] };
    },
  },
  {
    id: 'usdz', label: 'USDZ', extensions: ['usdz'], status: 'experimental', staticOnly: true,
    rig: false, animation: false, materials: true, textures: true,
    exportTargets: ['glb', 'gltf'],
    limitations: ['Only simple USDZ meshes and materials load. Skeletons, animation and binary .usdc payloads are not supported by the browser loader.'],
    async load({ buffer }) {
      return { root: await new USDZLoader().parse(buffer), clips: [], notes: [] };
    },
  },
  {
    id: 'usd', label: 'USD', extensions: ['usd', 'usda', 'usdc'], status: 'unsupported',
    rig: false, animation: false, materials: false, textures: false, exportTargets: [],
    limitations: ['Loose USD files are not supported in the browser. Export to GLB from Blender, Omniverse or another DCC tool, or zip as .usdz.'],
  },
  {
    id: 'blend', label: 'BLEND', extensions: ['blend'], status: 'unsupported',
    rig: false, animation: false, materials: false, textures: false, exportTargets: [],
    limitations: [
      'Browsers cannot read native Blender projects. In Blender use File → Export → glTF 2.0 (.glb), tick "Animation", then import the GLB here.',
      'A local Blender conversion service is a possible future addition; it is not part of this release.',
    ],
  },
];

/** Resource-only extensions accepted alongside a model. */
export const RESOURCE_EXTENSIONS = ['bin', 'mtl', 'png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'gif', 'ktx2', 'dds'];

export function extensionOf(name) {
  const m = /\.([^.\\/]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function adapterFor(name) {
  const ext = extensionOf(name);
  return ADAPTERS.find((a) => a.extensions.includes(ext)) ?? null;
}

export const ACCEPT = [...new Set(ADAPTERS.flatMap((a) => a.extensions).concat(RESOURCE_EXTENSIONS))].map((e) => `.${e}`).join(',');

/** Short badge such as "FBX", "OBJ — Static" or "DAE — Experimental". */
export function badgeFor(adapter) {
  if (!adapter) return 'Unknown';
  if (adapter.status === 'static') return `${adapter.label} — Static`;
  if (adapter.status === 'experimental') return `${adapter.label} — Experimental`;
  if (adapter.status === 'unsupported') return `${adapter.label} — Not supported`;
  return adapter.label;
}

/** Picks the model file out of a multi-file selection (model + .bin + textures). */
export function pickPrimary(files) {
  const ranked = files
    .map((file) => ({ file, adapter: adapterFor(file.name) }))
    .filter((x) => x.adapter);
  const order = ['gltf', 'glb', 'fbx', 'dae', 'obj', 'usdz', '3mf', 'ply', 'stl', 'usd', 'blend'];
  ranked.sort((a, b) => order.indexOf(a.adapter.id) - order.indexOf(b.adapter.id));
  return ranked[0] ?? null;
}

/**
 * GLTFLoader decodes images to ImageBitmaps, which forget their URL, so tag
 * textures whose image file was missing; export.js leaves them out.
 */
function markMissingGltfTextures(gltf, missing) {
  if (!missing?.size) return;
  const lower = new Set([...missing].map((m) => m.toLowerCase()));
  const json = gltf.parser.json;
  for (const [object, assoc] of gltf.parser.associations) {
    if (!object?.isTexture || assoc?.textures == null) continue;
    const source = json.textures?.[assoc.textures]?.source;
    const uri = source != null ? json.images?.[source]?.uri : null;
    if (uri && lower.has(baseName(uri).toLowerCase())) object.userData.cwMissing = true;
  }
}

/** True for textures that stand in for a file that was not supplied. */
export function isMissingTexture(texture) {
  const src = texture?.image?.src || texture?.image?.currentSrc || '';
  return texture?.userData?.cwMissing === true || src === MISSING_TEXTURE_URL;
}

let draco = null;
function gltfLoader(manager) {
  const loader = new GLTFLoader(manager);
  draco ??= new DRACOLoader().setDecoderPath(DRACO_PATH);
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

function baseName(url) {
  let clean = url.split(/[?#]/)[0];
  try { clean = decodeURIComponent(clean); } catch { /* keep raw */ }
  return clean.split(/[\\/]/).pop();
}

/**
 * Builds a LoadingManager that resolves every file the loader asks for
 * (".bin", textures, ".mtl") against the files the user selected, by name.
 * Anything not supplied is recorded as missing and replaced by a grey pixel
 * so a broken reference never turns into a stray network request.
 */
export function createResourceManager(files) {
  const urls = new Map();
  const missing = new Set();
  const failed = new Set();
  for (const file of files) urls.set(file.name.toLowerCase(), URL.createObjectURL(file));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url;
    const hit = urls.get(baseName(url).toLowerCase());
    if (hit) return hit;
    missing.add(baseName(url) || url);
    return MISSING_TEXTURE_URL;
  });
  const progress = { loaded: 0, total: 0 };
  manager.onStart = manager.onProgress = (url, loaded, total) => { progress.loaded = loaded; progress.total = total; };
  manager.onError = (url) => failed.add(url);
  return {
    manager,
    progress,
    missing,
    failed,
    dispose() { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); },
  };
}

/**
 * Loads a selection of files. Resolves to the internal model form plus the
 * source metadata kept for reporting (format, file size, conversions).
 */
export async function loadFiles(fileList) {
  const files = [...fileList];
  const primary = pickPrimary(files);
  if (!primary) {
    const names = files.map((f) => f.name).join(', ');
    throw new UserError(`No supported model file found in: ${names || 'your selection'}.`, 'Supported: ' + ADAPTERS.filter((a) => a.load).flatMap((a) => a.extensions).map((e) => '.' + e).join(' '));
  }
  const { file, adapter } = primary;
  if (!adapter.load) throw new UserError(`${adapter.label} files can't be opened in the browser.`, adapter.limitations.join(' '));

  const resources = createResourceManager(files.filter((f) => f !== file));
  try {
    const isText = ['gltf', 'obj', 'dae'].includes(adapter.id);
    const payload = {
      name: file.name.replace(/\.[^.]+$/, ''),
      files,
      manager: resources.manager,
      missing: resources.missing,
      buffer: isText ? null : await file.arrayBuffer(),
      text: isText ? await file.text() : null,
    };
    if (adapter.id === 'glb') assertMagic(payload.buffer, 'glTF', 'This .glb file is not a binary glTF (its header is wrong). It may be corrupt or renamed.');
    let result;
    try {
      result = await adapter.load(payload);
    } catch (error) {
      const missingData = [...resources.missing].filter((n) => !/\.(png|jpe?g|webp|gif|bmp|tga|ktx2|dds)$/i.test(n));
      if (missingData.length) throw new UserError(`${file.name} needs files that were not selected.`, `Missing: ${missingData.join(', ')}. Select them together with the model (multi-select or drop them at the same time).`);
      throw new UserError(`Could not read ${file.name}.`, explainLoaderError(adapter, error));
    }
    if (!result?.root) throw new UserError(`Could not read ${file.name}.`, 'The loader returned no scene.');
    // Let texture requests issued during parsing settle before we inspect.
    await settle(resources);
    return {
      ...result,
      source: {
        fileName: file.name,
        fileSize: file.size,
        adapter,
        extraFiles: files.filter((f) => f !== file).map((f) => f.name),
        missingResources: [...resources.missing],
        failedResources: [...resources.failed],
      },
      dispose: () => resources.dispose(),
    };
  } catch (error) {
    resources.dispose();
    throw error;
  }
}

/** Loads only the animation clips from a file (an "animation pack"). */
export async function loadAnimationFile(file) {
  const loaded = await loadFiles([file]);
  const clips = loaded.clips;
  return { clips, root: loaded.root, source: loaded.source, dispose: loaded.dispose };
}

/** Waits (up to `timeout`) for texture requests the loader started but did not await. */
function settle({ manager, progress }, timeout = 8000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    manager.onLoad = finish;
    const poll = () => { if (progress.loaded >= progress.total) finish(); else if (!done) setTimeout(poll, 30); };
    setTimeout(poll, 0);
    setTimeout(finish, timeout);
  });
}

function assertMagic(buffer, magic, message) {
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)));
  if (head !== magic) throw new UserError('Invalid file.', message);
}

function explainLoaderError(adapter, error) {
  const msg = String(error?.message || error);
  if (adapter.id === 'fbx' && /version not supported/i.test(msg)) return 'This FBX version is too old for the browser loader. Re-export it as FBX 2014 or newer (binary), or as GLB.';
  if (adapter.id === 'fbx' && /Unknown format/i.test(msg)) return 'This does not look like a binary or ASCII FBX file. ' + msg;
  if (/draco/i.test(msg)) return 'The file uses Draco mesh compression and the decoder failed to start. Check that the draco/ folder sits next to this tool. ' + msg;
  return msg;
}

/** An error whose title and detail are written for the person using the tool. */
export class UserError extends Error {
  constructor(title, detail = '') {
    super(detail ? `${title} ${detail}` : title);
    this.title = title;
    this.detail = detail;
  }
}
