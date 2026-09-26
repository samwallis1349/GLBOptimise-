import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

// Three.js ships browser-ready Draco decoder glue + wasm; the `draco3d` npm
// package is Node-only. Imported as bundled assets so nothing hits a CDN.
import dracoWrapperSource from 'three/examples/jsm/libs/draco/draco_wasm_wrapper.js?raw';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/draco_decoder.wasm?url';

/**
 * Shared glTF-Transform reader for the inspection tools (Inspect GLB,
 * Asset Report, Asset Compare). Same approach as the per-tool createIO.js
 * copies: every extension registered, with Draco + Meshopt decoders
 * supplied so compressed files can be read. Read-only — no encoders.
 */

let ioPromise = null;

/** Which codecs actually loaded, for honest error messages. */
export const codecStatus = { draco: false, meshopt: false };

async function loadDracoDecoder() {
  const wasmBinary = await (await fetch(dracoWasmUrl)).arrayBuffer();
  const factory = new Function(`${dracoWrapperSource}\nreturn DracoDecoderModule;`)();
  return new Promise((resolve) => {
    factory({ wasmBinary, onModuleLoaded: resolve }).then?.(resolve);
  });
}

async function createIO() {
  const io = new WebIO({ credentials: 'omit' }).registerExtensions(ALL_EXTENSIONS);
  const dependencies = {};
  try {
    dependencies['draco3d.decoder'] = await loadDracoDecoder();
    codecStatus.draco = true;
  } catch (err) {
    console.warn('[AssetBench] Draco decoder unavailable.', err);
  }
  try {
    const { MeshoptDecoder } = await import('meshoptimizer');
    await MeshoptDecoder.ready;
    dependencies['meshopt.decoder'] = MeshoptDecoder;
    codecStatus.meshopt = true;
  } catch (err) {
    console.warn('[AssetBench] Meshopt decoder unavailable.', err);
  }
  io.registerDependencies(dependencies);
  return io;
}

export function getIO() {
  if (!ioPromise) ioPromise = createIO();
  return ioPromise;
}

/** Reads a GLB ArrayBuffer into a glTF-Transform Document. */
export async function readGlb(arrayBuffer) {
  const io = await getIO();
  return io.readBinary(new Uint8Array(arrayBuffer));
}

/**
 * Reads a .gltf JSON file plus any sibling resources (.bin, images) that
 * were dropped alongside it. Resources are matched by filename, so the
 * relative paths inside the .gltf don't need to line up with folders.
 *
 * @param {File} gltfFile
 * @param {File[]} siblings
 * @returns {Promise<{ document: import('@gltf-transform/core').Document, missing: string[] }>}
 */
export async function readGltf(gltfFile, siblings = []) {
  const io = await getIO();
  const json = JSON.parse(await gltfFile.text());
  const byName = new Map(siblings.map((f) => [f.name.toLowerCase(), f]));
  const resources = {};
  const missing = [];
  const uris = [...(json.buffers || []), ...(json.images || [])].map((r) => r.uri).filter((u) => u && !u.startsWith('data:'));
  for (const uri of uris) {
    let name = uri.split(/[\\/]/).pop();
    try {
      name = decodeURIComponent(name);
    } catch {
      /* keep raw */
    }
    const file = byName.get(name.toLowerCase());
    if (file) resources[uri] = new Uint8Array(await file.arrayBuffer());
    else missing.push(name);
  }
  if (missing.some((n) => /\.bin$/i.test(n))) {
    throw new Error(`This .gltf needs ${missing.filter((n) => /\.bin$/i.test(n)).join(', ')}. Drop it together with the .gltf.`);
  }
  // Missing images: substitute an empty buffer so the rest still reads.
  for (const img of json.images || []) {
    if (img.uri && !img.uri.startsWith('data:') && !resources[img.uri]) resources[img.uri] = new Uint8Array(0);
  }
  const document = await io.readJSON({ json, resources });
  return { document, missing };
}
