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
 * One shared WebIO, decode-only.
 *
 * Animation Inspector never writes a file, so unlike the processing tools
 * this registers only the Draco/Meshopt *decoders* — no encoder is loaded and
 * no `writeGlb` is exported. Compressed assets still have to open, though:
 * most already-optimised game assets are compressed, and without the decoders
 * reading one throws from inside the extension ("Cannot read properties of
 * undefined (reading 'DT_FLOAT32')").
 *
 * Each codec is optional: if one fails to load, plain GLBs still work and the
 * failure is reported rather than swallowed.
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

/** Reads a GLB ArrayBuffer into a glTF-Transform Document. Throws on malformed input. */
export async function readGlb(arrayBuffer) {
  const io = await getIO();
  return io.readBinary(new Uint8Array(arrayBuffer));
}
