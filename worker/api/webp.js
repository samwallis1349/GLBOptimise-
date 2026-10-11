import decFactory from '../../node_modules/@jsquash/webp/codec/dec/webp_dec.js';
import encFactory from '../../node_modules/@jsquash/webp/codec/enc/webp_enc_simd.js';
import { defaultOptions } from '../../node_modules/@jsquash/webp/meta.js';
import { initEmscriptenModule } from '../../node_modules/@jsquash/webp/utils.js';

/**
 * WebP decode/encode on the Worker with libwebp (via @jsquash/webp). The
 * .wasm files are bundled as modules by wrangler (vendor/webpWasm.js); Node
 * tests inject compiled modules via globalThis.__ASSETBENCH_WEBP_WASM__ =
 * { dec, enc }. The SIMD encoder is used directly: workerd supports Wasm SIMD,
 * and it skips the feature-detection import the stock entry point does.
 */

let decoder = null;
let encoder = null;

async function wasm(name) {
  return globalThis.__ASSETBENCH_WEBP_WASM__?.[name] ?? (await import('./vendor/webpWasm.js'))[name];
}

function load(factory, name) {
  const promise = (async () => initEmscriptenModule(factory, await wasm(name)))();
  promise.catch(() => {
    if (name === 'dec') decoder = null; else encoder = null;
  });
  return promise;
}

/** @returns {Promise<{width:number,height:number,data:Uint8ClampedArray}>} RGBA8 */
export async function decodeWebp(bytes) {
  decoder ??= load(decFactory, 'dec');
  const module = await decoder;
  const result = module.decode(bytes);
  if (!result) throw new Error('WebP decoding failed');
  return { width: result.width, height: result.height, data: new Uint8ClampedArray(result.data.buffer, result.data.byteOffset, result.data.byteLength) };
}

/**
 * Lossy by default (colour textures); `lossless` for normal and packed data
 * maps, where lossy artefacts bend normals and bleed channels into each other.
 */
export async function encodeWebp(image, { quality = 88, lossless = false } = {}) {
  encoder ??= load(encFactory, 'enc');
  const module = await encoder;
  const options = { ...defaultOptions, quality: lossless ? 100 : quality, lossless: lossless ? 1 : 0, method: 4, exact: lossless ? 1 : 0 };
  const result = module.encode(image.data, image.width, image.height, options);
  if (!result) throw new Error('WebP encoding failed');
  return new Uint8Array(result.buffer ?? result);
}
