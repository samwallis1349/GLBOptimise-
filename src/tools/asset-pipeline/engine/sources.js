import JSZip from 'jszip';

/**
 * Turns whatever the user added — loose files, dropped folders (with
 * relative paths), ZIP archives — into a list of assets. Each asset reads
 * its bytes lazily (`load()`), so a 300-file batch holds File handles, not
 * 300 decoded models.
 *
 * Entry shape in: { path: 'props/crate.glb', size: number, read: () => Promise<Uint8Array> }
 *
 * .gltf assets resolve their buffers and images relative to their own
 * folder first, then by bare filename anywhere in the batch; anything still
 * missing is reported (and the asset fails inspection if a .bin is missing).
 */

export const LIMITS = {
  maxAssets: 500,
  maxFileBytes: 512 * 1024 * 1024,
  maxZipBytes: 1024 * 1024 * 1024,
};

const MODEL_RE = /\.(glb|gltf)$/i;
const RESOURCE_RE = /\.(bin|png|jpe?g|webp|ktx2|avif)$/i;

export function fileEntry(file) {
  const path = (file.webkitRelativePath || file.relativePath || file.name).replace(/\\/g, '/');
  return { path, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) };
}

export async function expandZips(entries) {
  const out = [];
  const ignored = [];
  for (const entry of entries) {
    if (!/\.zip$/i.test(entry.path)) {
      out.push(entry);
      continue;
    }
    if (entry.size > LIMITS.maxZipBytes) {
      ignored.push({ path: entry.path, reason: `ZIP larger than ${LIMITS.maxZipBytes / 1048576} MB` });
      continue;
    }
    try {
      const zip = await JSZip.loadAsync(await entry.read());
      const prefix = entry.path.replace(/[^/]+$/, '') + entry.path.split('/').pop().replace(/\.zip$/i, '') + '/';
      zip.forEach((relPath, file) => {
        if (file.dir || relPath.startsWith('__MACOSX') || /(^|\/)\./.test(relPath)) return;
        out.push({ path: prefix + relPath, size: file._data?.uncompressedSize ?? 0, read: () => file.async('uint8array'), fromZip: entry.path });
      });
    } catch (err) {
      ignored.push({ path: entry.path, reason: `Not a readable ZIP (${err?.message || 'corrupt'})` });
    }
  }
  return { entries: out, ignored };
}

const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
const fileOf = (p) => p.slice(p.lastIndexOf('/') + 1);

function resolvePath(base, uri) {
  let rel = uri;
  try {
    rel = decodeURIComponent(uri);
  } catch {
    /* keep raw */
  }
  const parts = (base + rel).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

/**
 * @param {{path:string,size:number,read:()=>Promise<Uint8Array>}[]} rawEntries
 * @returns {Promise<{ assets: object[], ignored: {path:string, reason:string}[] }>}
 */
export async function gatherAssets(rawEntries) {
  const { entries, ignored } = await expandZips(rawEntries);
  const byPath = new Map(entries.map((e) => [e.path.toLowerCase(), e]));
  const byName = new Map();
  for (const e of entries) {
    const k = fileOf(e.path).toLowerCase();
    if (!byName.has(k)) byName.set(k, e);
  }

  const assets = [];
  for (const e of entries) {
    if (!MODEL_RE.test(e.path)) {
      if (!RESOURCE_RE.test(e.path)) ignored.push({ path: e.path, reason: 'Not a GLB, glTF, ZIP or glTF resource' });
      continue;
    }
    if (e.size > LIMITS.maxFileBytes) {
      ignored.push({ path: e.path, reason: `Larger than ${LIMITS.maxFileBytes / 1048576} MB` });
      continue;
    }
    if (assets.length >= LIMITS.maxAssets) {
      ignored.push({ path: e.path, reason: `Batch limit of ${LIMITS.maxAssets} assets reached` });
      continue;
    }
    const isGlb = /\.glb$/i.test(e.path);
    assets.push({
      name: fileOf(e.path),
      dir: dirOf(e.path),
      path: e.path,
      sourceFormat: isGlb ? 'glb' : 'gltf',
      sourceBytes: e.size,
      // Returns { bytes: GLB Uint8Array, missing: string[] }.
      load: isGlb
        ? async () => ({ bytes: await e.read(), missing: [] })
        : async (io) => packGltf(e, io, { byPath, byName }),
    });
  }
  return { assets, ignored };
}

/** Reads a .gltf with its resources and packs it to GLB bytes, so every later stage sees one format. */
async function packGltf(entry, io, { byPath, byName }) {
  const raw = await entry.read();
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch (err) {
    throw new Error(`Not valid glTF JSON (${err?.message || 'parse error'}).`);
  }
  const base = dirOf(entry.path);
  const resources = {};
  const missing = [];
  const uris = [...(json.buffers || []), ...(json.images || [])].map((r) => r.uri).filter((u) => u && !u.startsWith('data:'));
  for (const uri of new Set(uris)) {
    const hit = byPath.get(resolvePath(base, uri).toLowerCase()) || byName.get(fileOf(resolvePath('', uri)).toLowerCase());
    if (hit) resources[uri] = await hit.read();
    else missing.push(uri);
  }
  const missingBin = missing.filter((u) => /\.bin$/i.test(u) || (json.buffers || []).some((b) => b.uri === u));
  if (missingBin.length) throw new Error(`Missing geometry buffer(s): ${missingBin.join(', ')}. Add them with the .gltf.`);
  // Missing images become empty so the document still reads; inspection reports them.
  for (const uri of missing) resources[uri] = new Uint8Array(0);
  const document = await io.readJSON({ json, resources });
  return { bytes: await io.writeBinary(document), missing };
}
