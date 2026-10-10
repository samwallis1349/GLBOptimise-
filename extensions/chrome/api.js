/**
 * The extension's only contact with AssetBench: the free Reduce Polys API
 * (POST /api/v1/3d/reduce, see public/docs). DOM-free so tests can drive it
 * against the Worker directly.
 */

export const API_BASE = 'https://www.assetbench.co.uk';
export const MAX_UPLOAD_BYTES = 25 * 1048576;

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function failure(res) {
  const body = await res.json().catch(() => null);
  return new ApiError(body?.error?.message || `Request failed (${res.status}).`, body?.error?.code || `http_${res.status}`);
}

/**
 * The free key for this network. Asking again replaces the network's
 * previous key (it stops working). Resolves to { key, replaced }.
 */
export async function requestFreeKey({ base = API_BASE, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${base}/api/v1/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'chrome-extension' }),
  });
  if (!res.ok) throw await failure(res);
  const json = await res.json();
  return { key: json.key, replaced: Boolean(json.replacedPreviousKey) };
}

const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/**
 * Reduces one GLB. `keep` is the fraction of triangles to keep (0–1).
 * Resolves to { bytes, name, report } where report has before/after
 * triangle counts, file sizes and any warnings.
 */
export async function reduceGlb({ file, name, key, keep, acrossSeams = false, base = API_BASE, fetchImpl = fetch }) {
  if (!key) throw new ApiError('Add your API key first.', 'no_key');
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError('Files up to 25 MB only.', 'file_too_large');
  const form = new FormData();
  form.append('file', file, name);
  form.append('ratio', String(keep));
  if (acrossSeams) form.append('acrossSeams', 'true');
  const res = await fetchImpl(`${base}/api/v1/3d/reduce?output=json`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw await failure(res);
  const json = await res.json();
  return { bytes: fromBase64(json.file.base64), name: json.file.name, report: json.report };
}
