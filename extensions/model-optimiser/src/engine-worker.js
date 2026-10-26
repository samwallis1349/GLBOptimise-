/**
 * Runs the tools off the panel's main thread so the UI stays responsive on
 * big models. Messages: { id, tool, bytes, params, name } in,
 * { id, ok, result } or { id, ok: false, error } out.
 */
import { runTool } from './engine.js';
import { registerWebpCodec } from '../../../worker/api/images.js';

// jpeg-js returns its encoded bytes through Node's Buffer once bundled;
// worker/api/images.js only needs them as a Uint8Array.
globalThis.Buffer ??= { from: (bytes) => Uint8Array.from(bytes), alloc: (size) => new Uint8Array(size) };

// The KTX2 encoder reads its compiled WebAssembly from this global (see
// worker/api/ktx2.js); the extension ships the .wasm next to this script.
async function loadBasis() {
  if (globalThis.__ASSETBENCH_BASIS_WASM__) return;
  const res = await fetch(new URL('basis_encoder.wasm', self.location.href));
  globalThis.__ASSETBENCH_BASIS_WASM__ = await WebAssembly.compile(await res.arrayBuffer());
}

// The Draco decoder reads its compiled WebAssembly from this global (worker/api/draco.js).
let draco = null;
function loadDraco() {
  draco ??= fetch(new URL('draco_decoder.wasm', self.location.href)).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b))
    .then((m) => { globalThis.__ASSETBENCH_DRACO_WASM__ = m; });
  return draco;
}

// WebP: decoded and encoded by the browser (worker/api/images.js asks for a codec).
registerWebpCodec({
  async decode(bytes) {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data };
  },
  async encode(image, { quality = 88, lossless = false } = {}) {
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: lossless ? 1 : quality / 100 });
    return new Uint8Array(await blob.arrayBuffer());
  },
});

self.onmessage = async ({ data }) => {
  const { id, tool, bytes, params, name } = data;
  try {
    await loadDraco();
    if (tool === 'compress') await loadBasis();
    const result = await runTool(tool, new Uint8Array(bytes), params, name);
    const transfer = result.output ? [result.output.buffer] : [];
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || 'Processing failed.' });
  }
};
