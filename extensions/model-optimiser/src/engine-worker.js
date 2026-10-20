/**
 * Runs the tools off the panel's main thread so the UI stays responsive on
 * big models. Messages: { id, tool, bytes, params, name } in,
 * { id, ok, result } or { id, ok: false, error } out.
 */
import { runTool } from './engine.js';

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

self.onmessage = async ({ data }) => {
  const { id, tool, bytes, params, name } = data;
  try {
    if (tool === 'compress') await loadBasis();
    const result = await runTool(tool, new Uint8Array(bytes), params, name);
    const transfer = result.output ? [result.output.buffer] : [];
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || 'Processing failed.' });
  }
};
