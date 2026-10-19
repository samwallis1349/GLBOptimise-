import DracoDecoderModule from './vendor/draco_decoder.js';

/**
 * Draco mesh decoder on the Worker. The Emscripten glue is a patched copy
 * (see scripts/vendor-draco.mjs) and the .wasm is bundled as a module by
 * wrangler (vendor/dracoWasm.js); Node tests inject a compiled module via
 * globalThis.__ASSETBENCH_DRACO_WASM__.
 *
 * Plugged into worker/api/glb.js by worker/api/index.js so the browser
 * Asset Pipeline (which shares glb.js) does not pull the Worker wasm into
 * the Vite client bundle.
 */

let dracoPromise = null;
export async function getDracoDecoder() {
  if (!dracoPromise) {
    dracoPromise = (async () => {
      const wasmModule = globalThis.__ASSETBENCH_DRACO_WASM__ ?? (await import('./vendor/dracoWasm.js')).default;
      return DracoDecoderModule({
        print: () => {},
        printErr: () => {},
        instantiateWasm(imports, done) {
          WebAssembly.instantiate(wasmModule, imports).then((inst) => done(inst.instance ?? inst));
          return {};
        },
      });
    })();
    dracoPromise.catch(() => { dracoPromise = null; });
  }
  return dracoPromise;
}
