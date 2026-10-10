import { EXTTextureWebP, KHRTextureBasisu } from '@gltf-transform/extensions';
import { fitSize, hasAlpha, resize } from '../../../../worker/api/images.js';
import { roleForTexture, safeSize } from './inspect.js';
import { contentKey, EXT, MIME } from './codecs.js';
import { textureGpuBytes } from './inspect.js';

/**
 * Texture stages.
 *
 * Resize decodes and downsamples, but does NOT encode: the resized pixels
 * wait in `state.pending` so that a following Compress stage encodes once,
 * from full-quality pixels. If anything else runs in between (or Compress is
 * off), `flushPending` writes them back in their source format.
 *
 * Roles decide the defaults (see settings TEXTURE_ROLES): colour maps may go
 * lossy; normal and packed data maps (metallic-roughness, occlusion, other)
 * hold numbers, not colours, so lossy formats are refused for them unless
 * `lossyDataMaps` is set. KTX2 on a data map is written as UASTC, which is
 * the Basis mode meant for that.
 *
 * Every number reported is measured on the bytes actually written.
 */

const DATA_ROLES = new Set(['normal', 'metallicRoughness', 'occlusion', 'other']);
const LINEAR_ROLES = DATA_ROLES;

/** One state per output document; `cache` is shared across LOD variants and the whole batch. */
/**
 * One state per output document. `pixels` (decoded RGBA, large) is shared by
 * one asset's LOD variants and dropped with the asset; `cache` (encoded
 * bytes, small) is shared across the whole batch and capped.
 */
export function createTextureState({ cache = createEncodeCache(), pixels = new Map(), keepOriginals = false, originals = [] } = {}) {
  return { pending: new Map(), entries: new Map(), originals, cache, pixels, keepOriginals };
}

const ENCODE_CACHE_LIMIT = 192 * 1024 * 1024;
export function createEncodeCache() {
  const map = new Map();
  map.bytes = 0;
  return map;
}

function entryFor(state, texture, index, role) {
  if (!state.entries.has(texture)) {
    const size = safeSize(texture);
    state.entries.set(texture, {
      index,
      name: texture.getName() || texture.getURI() || `texture_${index}`,
      role,
      before: { width: size?.[0] || 0, height: size?.[1] || 0, mime: texture.getMimeType(), bytes: texture.getImage()?.byteLength || 0 },
      after: null,
      actions: [],
      notes: [],
      status: 'unchanged',
    });
  }
  return state.entries.get(texture);
}

const sameBytes = (a, b) => {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
};

/** Identical source bytes + identical plan → reuse the result (LOD variants, textures shared across assets). */
function cached(map, bytes, planKey, compute) {
  const key = `${contentKey(bytes)}|${planKey}`;
  const hit = map.get(key);
  if (hit && sameBytes(hit.source, bytes)) return hit.result;
  const result = Promise.resolve().then(compute);
  map.set(key, { source: bytes, result });
  if (map.bytes !== undefined) {
    // Encoded-results cache: account its size once the encode lands, and
    // start over rather than grow without bound on huge batches.
    result.then((out) => {
      map.bytes += (out?.byteLength || 0) + bytes.byteLength;
      if (map.bytes > ENCODE_CACHE_LIMIT) {
        map.clear();
        map.bytes = 0;
      }
    }, () => map.delete(key));
  }
  return result;
}

function backupOriginal(state, texture, entry) {
  if (!state.keepOriginals || state.originals.some((o) => o.name === entry.name)) return;
  const image = texture.getImage();
  if (image) state.originals.push({ name: entry.name, mime: texture.getMimeType(), bytes: image.slice() });
}

// ---------------------------------------------------------------------------

export async function resizeTextures({ document, settings, codecs, state, log }) {
  const { roles, powerOfTwo } = settings.textures;
  const textures = document.getRoot().listTextures();
  for (let i = 0; i < textures.length; i += 1) {
    const texture = textures[i];
    const role = roleForTexture(document, texture);
    const entry = entryFor(state, texture, i, role);
    const limit = roles[role].maxSize;
    const { width, height, mime } = entry.before;
    if (!width || !height) {
      entry.notes.push('Dimensions unreadable: left unchanged.');
      continue;
    }
    const npot = (width & (width - 1)) !== 0 || (height & (height - 1)) !== 0;
    const cap = limit || Math.max(width, height);
    if (Math.max(width, height) <= cap && !(powerOfTwo && npot)) continue;
    if (mime === 'image/ktx2') {
      entry.notes.push('Already KTX2 (GPU block-compressed): cannot be resized without its source image.');
      continue;
    }
    if (!codecs.canDecode(mime)) {
      entry.notes.push(`${mime} cannot be decoded in this environment: left at ${width}×${height}.`);
      continue;
    }
    const target = fitSize(width, height, cap, powerOfTwo);
    if (target.width === width && target.height === height) continue;
    try {
      const bytes = texture.getImage();
      const image = await cached(state.pixels, bytes, `resize:${target.width}x${target.height}`, async () => resize(await codecs.decode(bytes, mime), target.width, target.height));
      backupOriginal(state, texture, entry);
      state.pending.set(texture, image);
      entry.actions.push(`resized ${width}×${height} → ${target.width}×${target.height}`);
      entry.status = 'resized';
    } catch (err) {
      entry.notes.push(`Resize failed (${err?.message || 'decode error'}): left unchanged.`);
      log.warn(`Texture "${entry.name}" could not be resized: ${err?.message || 'decode error'}.`);
    }
  }
}

/** Writes resized-but-unencoded pixels back in their source format. */
export async function flushPending({ document, codecs, state, log }) {
  for (const [texture, image] of state.pending) {
    const entry = state.entries.get(texture);
    const source = entry.before.mime;
    let format = source === 'image/jpeg' ? 'jpeg' : source === 'image/webp' && codecs.encoders.webp ? 'webp' : 'png';
    if (format === 'jpeg' && hasAlpha(image)) format = 'png';
    await writeImage({ document, texture, entry, image, format, quality: 92, codecs, state, settings: null, log });
  }
  state.pending.clear();
}

export async function compressTextures({ document, settings, codecs, state, log }) {
  const { roles, lossyDataMaps, ktx2 } = settings.textures;
  const textures = document.getRoot().listTextures();
  for (let i = 0; i < textures.length; i += 1) {
    const texture = textures[i];
    const role = roleForTexture(document, texture);
    const entry = entryFor(state, texture, i, role);
    const cfg = roles[role];
    const pending = state.pending.get(texture);
    const sourceMime = entry.before.mime;
    let format = cfg.format;

    if (format === 'keep') {
      if (pending) {
        state.pending.delete(texture);
        let keepFormat = sourceMime === 'image/jpeg' ? 'jpeg' : sourceMime === 'image/webp' && codecs.encoders.webp ? 'webp' : 'png';
        if (keepFormat === 'jpeg' && hasAlpha(pending)) keepFormat = 'png';
        await writeImage({ document, texture, entry, image: pending, format: keepFormat, quality: Math.max(cfg.quality, 90), codecs, state, settings, log });
      }
      continue;
    }

    if (MIME[format] === sourceMime && !pending && format !== 'jpeg' && format !== 'webp') continue; // already PNG/KTX2, nothing to gain
    if (sourceMime === 'image/ktx2') {
      entry.notes.push('Already KTX2: GPU-compressed data is never re-encoded.');
      continue;
    }

    // Data maps stay lossless unless explicitly allowed.
    if (DATA_ROLES.has(role) && !lossyDataMaps && (format === 'jpeg' || format === 'webp')) {
      entry.notes.push(`${format.toUpperCase()} refused for a ${role} map (it stores data, not colour). Kept lossless; enable “lossy data maps” to override.`);
      format = pending ? (sourceMime === 'image/jpeg' ? 'jpeg' : 'png') : null;
      if (!format) continue;
    }
    if (!codecs.encoders[format]) {
      entry.notes.push(`${format.toUpperCase()} encoder is not available here: kept ${EXT[sourceMime] || sourceMime}.`);
      log.warn(`"${entry.name}": ${format.toUpperCase()} is not available in this browser, texture kept in its source format.`);
      if (pending) await flushOne({ document, texture, entry, image: pending, codecs, state, log });
      state.pending.delete(texture);
      continue;
    }
    if (!codecs.canDecode(sourceMime) && !pending) {
      entry.notes.push(`${sourceMime} cannot be decoded here: left unchanged.`);
      continue;
    }

    try {
      const image = pending || (await cached(state.pixels, texture.getImage(), 'decode', () => codecs.decode(texture.getImage(), sourceMime)));
      state.pending.delete(texture);
      if (format === 'jpeg' && hasAlpha(image)) {
        format = codecs.encoders.webp ? 'webp' : 'png';
        entry.notes.push(`Has transparency, which JPEG cannot store: written as ${format.toUpperCase()} instead.`);
      }
      const options = { quality: cfg.quality };
      if (format === 'ktx2') {
        const mode = ktx2.mode === 'auto' || (DATA_ROLES.has(role) && !lossyDataMaps) ? (DATA_ROLES.has(role) ? 'uastc' : 'etc1s') : ktx2.mode;
        Object.assign(options, { mode, normalMap: role === 'normal', srgb: !LINEAR_ROLES.has(role), mipmaps: ktx2.mipmaps, quality: ktx2.quality });
      }
      await writeImage({ document, texture, entry, image, format, quality: cfg.quality, options, codecs, state, settings, log, allowLarger: Boolean(pending) || format === 'ktx2' });
    } catch (err) {
      entry.notes.push(`Compression failed (${err?.message || 'encoder error'}): left unchanged.`);
      log.warn(`Texture "${entry.name}" could not be compressed: ${err?.message || 'encoder error'}.`);
    }
  }
}

async function flushOne(args) {
  const source = args.entry.before.mime;
  const format = source === 'image/jpeg' && !hasAlpha(args.image) ? 'jpeg' : 'png';
  await writeImage({ ...args, format, quality: 92, settings: null });
}

async function writeImage({ document, texture, entry, image, format, quality, options = {}, codecs, state, allowLarger = true, log }) {
  const encode = codecs.encoders[format];
  const before = texture.getImage();
  const planKey = `${format}:${JSON.stringify({ quality, ...options })}:${image.width}x${image.height}`;
  // Cache on the decoded pixels' identity via the source bytes + target size.
  const out = await cached(state.cache, before, planKey, () => encode(image, { quality, ...options }));
  if (!allowLarger && out.byteLength >= before.byteLength) {
    entry.notes.push(`${format.toUpperCase()} would be larger (${out.byteLength} vs ${before.byteLength} bytes): original kept.`);
    return;
  }
  backupOriginal(state, texture, entry);
  const mime = MIME[format];
  texture.setImage(out).setMimeType(mime);
  const uri = texture.getURI();
  if (uri) texture.setURI(uri.replace(/\.[a-z0-9]+$/i, `.${EXT[mime]}`));
  if (mime === 'image/webp') document.createExtension(EXTTextureWebP).setRequired(true);
  if (mime === 'image/ktx2') document.createExtension(KHRTextureBasisu).setRequired(true);
  if (mime !== entry.before.mime) entry.actions.push(`${EXT[entry.before.mime] || entry.before.mime} → ${EXT[mime]}`);
  else if (!entry.actions.some((a) => a.startsWith('re-encoded'))) entry.actions.push(`re-encoded ${EXT[mime]}`);
  entry.status = 'changed';
  log.debug?.(`texture ${entry.name}: ${entry.actions.join(', ')}`);
}

/** Final per-texture summary, measured after all stages. */
export function textureReport(document, state) {
  return document
    .getRoot()
    .listTextures()
    .map((texture, i) => {
      const role = roleForTexture(document, texture);
      const entry = state.entries.get(texture) || { index: i, name: texture.getName() || `texture_${i}`, role, before: null, actions: [], notes: [], status: 'unchanged' };
      const size = safeSize(texture);
      const after = { width: size?.[0] || 0, height: size?.[1] || 0, mime: texture.getMimeType(), bytes: texture.getImage()?.byteLength || 0 };
      const before = entry.before || after;
      return {
        name: entry.name,
        role,
        before: { ...before, gpuBytes: textureGpuBytes(before.width, before.height, before.mime) },
        after: { ...after, gpuBytes: textureGpuBytes(after.width, after.height, after.mime) },
        actions: entry.actions,
        notes: entry.notes,
        resized: before.width !== after.width || before.height !== after.height,
        reencoded: entry.status === 'changed',
      };
    });
}
