import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

// Three.js ships browser-ready Draco decoder glue + wasm. The `draco3d` npm
// package is Node-only (its emscripten glue reads the .wasm through `fs`), so
// it silently fails in a bundler. These are imported as bundled assets, which
// keeps everything offline — no CDN request, nothing leaves the machine.
import dracoWrapperSource from 'three/examples/jsm/libs/draco/draco_wasm_wrapper.js?raw';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/draco_decoder.wasm?url';

let ioPromise = null;

/** Tracks which codecs are actually available, for honest error messages. */
export const codecStatus = { draco: false, meshopt: false };

async function loadDracoDecoder() {
  const wasmBinary = await (await fetch(dracoWasmUrl)).arrayBuffer();
  // The wrapper is a classic script that defines DracoDecoderModule.
  const factory = new Function(`${dracoWrapperSource}\nreturn DracoDecoderModule;`)();
  return new Promise((resolve) => {
    factory({ wasmBinary, onModuleLoaded: resolve }).then?.(resolve);
  });
}

/**
 * One shared WebIO.
 *
 * Registering the extensions is not enough on its own: Draco and Meshopt
 * compressed GLBs also need their codec supplied as a dependency, or reading
 * one throws from deep inside the extension ("Cannot read properties of
 * undefined (reading 'DT_FLOAT32')"). Most already-optimised game assets are
 * compressed, so without this the app rejects exactly the files it exists to
 * work on.
 *
 * Each codec is optional: if one fails to load the app still handles plain
 * GLBs, and the failure is reported rather than swallowed.
 */
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
    const { MeshoptDecoder, MeshoptEncoder } = await import('meshoptimizer');
    await MeshoptDecoder.ready;
    dependencies['meshopt.decoder'] = MeshoptDecoder;
    await MeshoptEncoder.ready;
    dependencies['meshopt.encoder'] = MeshoptEncoder;
    codecStatus.meshopt = true;
  } catch (err) {
    console.warn('[AssetBench] Meshopt codec unavailable.', err);
  }

  io.registerDependencies(dependencies);
  return io;
}

export function getIO() {
  if (!ioPromise) ioPromise = createIO();
  return ioPromise;
}

/** Reads a GLB ArrayBuffer into a glTF-Transform Document. Throws on malformed input. */
export async function readGlb(arrayBuffer) {
  const io = await getIO();
  return io.readBinary(new Uint8Array(arrayBuffer));
}

/** Writes a Document back to a GLB ArrayBuffer. */
export async function writeGlb(document) {
  const io = await getIO();
  const bytes = await io.writeBinary(document);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
