import { decode as decodePngRaw, encode as encodePng, convertIndexedToRgb } from 'fast-png';
import jpeg from 'jpeg-js';
import { ApiError } from './http.js';

/**
 * DOM-free image handling for the Worker: decode PNG/JPEG/WebP to RGBA8, resample
 * with a proper area filter (premultiplied, so transparent edges don't go
 * dark), encode back. Pure JS so it runs the same in workerd and Node tests.
 */

const MAX_PIXELS = 4096 * 4096;

/** Reads width/height from PNG, JPEG or WebP headers without decoding. */
export function sniffImage(bytes) {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { mime: 'image/png', width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let off = 2;
    while (off + 9 < bytes.length) {
      if (bytes[off] !== 0xff) { off += 1; continue; }
      const marker = bytes[off + 1];
      const len = (bytes[off + 2] << 8) | bytes[off + 3];
      // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: 'image/jpeg', height: (bytes[off + 5] << 8) | bytes[off + 6], width: (bytes[off + 7] << 8) | bytes[off + 8] };
      }
      off += 2 + len;
    }
    return { mime: 'image/jpeg', width: 0, height: 0 };
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === 'VP8X') return { mime: 'image/webp', width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    if (kind === 'VP8L') {
      const b = bytes.subarray(21, 25);
      return { mime: 'image/webp', width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) };
    }
    if (kind === 'VP8 ') return { mime: 'image/webp', width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  if (bytes.length >= 28 && bytes[0] === 0xab && bytes[1] === 0x4b && bytes[2] === 0x54 && bytes[3] === 0x58) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { mime: 'image/ktx2', width: dv.getUint32(20, true), height: dv.getUint32(24, true) };
  }
  return null;
}

function pngToRgba(png) {
  let { data, channels, depth } = png;
  if (png.palette) {
    data = convertIndexedToRgb(png);
    channels = png.palette[0]?.length === 4 ? 4 : 3;
    depth = 8;
  }
  const n = png.width * png.height;
  const out = new Uint8ClampedArray(n * 4);
  const read = depth === 16 ? (i) => data[i] >> 8 : depth === 8 ? (i) => data[i] : (i) => Math.round((data[i] / ((1 << depth) - 1)) * 255);
  for (let p = 0; p < n; p += 1) {
    const s = p * channels;
    const d = p * 4;
    if (channels >= 3) {
      out[d] = read(s); out[d + 1] = read(s + 1); out[d + 2] = read(s + 2);
      out[d + 3] = channels === 4 ? read(s + 3) : 255;
    } else {
      const g = read(s);
      out[d] = g; out[d + 1] = g; out[d + 2] = g;
      out[d + 3] = channels === 2 ? read(s + 1) : 255;
    }
  }
  return out;
}

/** Image types the API can decode and re-encode. */
export const DECODABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);

// WebP (libwebp wasm, ./webp.js) is plugged in by the Worker entry point,
// worker/api/index.js. The browser Asset Pipeline shares this module, and
// importing webp.js here would pull the wasm into the site bundle.
let webp = null;
export function registerWebpCodec(codec) { webp = codec; }
const needWebp = () => {
  if (!webp) throw new ApiError(415, 'unsupported_image', 'WebP is not available here; send PNG or JPEG.');
  return webp;
};

/** @returns {Promise<{width:number,height:number,data:Uint8ClampedArray,mime:string}>} RGBA8 */
export async function decodeImage(bytes) {
  const info = sniffImage(bytes);
  if (!info || !DECODABLE.has(info.mime)) {
    throw new ApiError(415, 'unsupported_image', 'Send a PNG, JPEG or WebP image.');
  }
  if (!info.width || !info.height) throw new ApiError(422, 'unreadable_image', 'Could not read the image dimensions.');
  if (info.width * info.height > MAX_PIXELS) {
    throw new ApiError(413, 'image_too_large', `Images are limited to ${MAX_PIXELS.toLocaleString('en-GB')} pixels (4096 x 4096).`);
  }
  try {
    if (info.mime === 'image/webp') {
      const img = await needWebp().decode(bytes);
      return { ...img, mime: info.mime };
    }
    if (info.mime === 'image/png') {
      const png = decodePngRaw(bytes);
      return { width: png.width, height: png.height, data: pngToRgba(png), mime: info.mime };
    }
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 17, maxMemoryUsageInMB: 256 });
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), mime: info.mime };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(422, 'unreadable_image', `The image could not be decoded (${err?.message || 'corrupt data'}).`);
  }
}

/**
 * Encodes to the given type. WebP is lossy unless `lossless` (use it for
 * normal and packed data maps); PNG is always lossless; JPEG drops alpha.
 */
export async function encodeAnyImage(image, mime, { quality = 88, lossless = false } = {}) {
  if (mime === 'image/webp') return needWebp().encode(image, { quality, lossless });
  return encodeImage(image, mime, { quality });
}

export function encodeImage(image, mime, { quality = 88 } = {}) {
  if (mime === 'image/jpeg') {
    // JPEG has no alpha: composite over white first so transparent areas don't turn black.
    const flat = hasAlpha(image) ? flatten(image, [255, 255, 255]) : image;
    const out = jpeg.encode({ width: flat.width, height: flat.height, data: flat.data }, quality).data;
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  const opaque = !hasAlpha(image);
  let data = image.data;
  if (opaque) {
    data = new Uint8Array(image.width * image.height * 3);
    for (let p = 0, s = 0; s < image.data.length; s += 4, p += 3) {
      data[p] = image.data[s]; data[p + 1] = image.data[s + 1]; data[p + 2] = image.data[s + 2];
    }
  }
  return encodePng({ width: image.width, height: image.height, data, channels: opaque ? 3 : 4, depth: 8 });
}

export function hasAlpha(image) {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 255) return true;
  return false;
}

/** Composites over a solid colour; returns a new opaque image. */
export function flatten(image, [r, g, b]) {
  const out = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < out.length; i += 4) {
    const a = image.data[i + 3] / 255;
    out[i] = image.data[i] * a + r * (1 - a);
    out[i + 1] = image.data[i + 1] * a + g * (1 - a);
    out[i + 2] = image.data[i + 2] * a + b * (1 - a);
    out[i + 3] = 255;
  }
  return { ...image, data: out };
}

function weights(srcSize, dstSize) {
  const scale = srcSize / dstSize;
  const support = Math.max(1, scale); // widen the tent when shrinking = area averaging
  const list = [];
  for (let d = 0; d < dstSize; d += 1) {
    const center = (d + 0.5) * scale - 0.5;
    const start = Math.max(0, Math.floor(center - support));
    const end = Math.min(srcSize - 1, Math.ceil(center + support));
    const idx = [];
    const w = [];
    let sum = 0;
    for (let s = start; s <= end; s += 1) {
      const x = Math.abs(s - center) / support;
      const weight = x < 1 ? 1 - x : 0;
      if (weight > 0) { idx.push(s); w.push(weight); sum += weight; }
    }
    if (!idx.length) { idx.push(Math.min(srcSize - 1, Math.max(0, Math.round(center)))); w.push(1); sum = 1; }
    list.push({ idx, w: w.map((v) => v / sum) });
  }
  return list;
}

/**
 * Separable resample in premultiplied float space.
 * Uses a sliding row cache instead of full-image Float32Array planes so a
 * 4096x4096 resize needs <1 MB of scratch RAM instead of ~512 MB (keeping
 * well inside the 128 MB Cloudflare Worker heap limit).
 */
export function resize(image, width, height) {
  if (width === image.width && height === image.height) return image;
  const { width: sw, height: sh, data } = image;
  const wx = weights(sw, width);
  const wy = weights(sh, height);
  const rowCache = new Map();

  function resampleRow(sy) {
    const row = new Float32Array(width * 4);
    const rowOff = sy * sw * 4;
    for (let x = 0; x < width; x += 1) {
      const { idx, w } = wx[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < idx.length; k += 1) {
        const s = rowOff + idx[k] * 4;
        const sa = data[s + 3];
        const scaleA = sa / 255;
        const wk = w[k];
        r += data[s] * scaleA * wk;
        g += data[s + 1] * scaleA * wk;
        b += data[s + 2] * scaleA * wk;
        a += sa * wk;
      }
      const d = x * 4;
      row[d] = r; row[d + 1] = g; row[d + 2] = b; row[d + 3] = a;
    }
    return row;
  }

  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const { idx, w } = wy[y];
    const minS = idx[0];
    for (const cachedS of rowCache.keys()) {
      if (cachedS < minS) rowCache.delete(cachedS);
    }
    const rows = idx.map((sy) => {
      let row = rowCache.get(sy);
      if (!row) {
        row = resampleRow(sy);
        rowCache.set(sy, row);
      }
      return row;
    });
    for (let x = 0; x < width; x += 1) {
      const rx = x * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < rows.length; k += 1) {
        const row = rows[k];
        const wk = w[k];
        r += row[rx] * wk;
        g += row[rx + 1] * wk;
        b += row[rx + 2] * wk;
        a += row[rx + 3] * wk;
      }
      const d = (y * width + x) * 4;
      const alpha = a / 255;
      out[d] = alpha > 0 ? r / alpha : 0;
      out[d + 1] = alpha > 0 ? g / alpha : 0;
      out[d + 2] = alpha > 0 ? b / alpha : 0;
      out[d + 3] = a;
    }
  }
  return { width, height, data: out, mime: image.mime };
}

/** Centre-crops to a square. */
export function cropSquare(image) {
  const size = Math.min(image.width, image.height);
  if (image.width === image.height) return image;
  const ox = Math.floor((image.width - size) / 2);
  const oy = Math.floor((image.height - size) / 2);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    out.set(image.data.subarray(((y + oy) * image.width + ox) * 4, ((y + oy) * image.width + ox + size) * 4), y * size * 4);
  }
  return { width: size, height: size, data: out, mime: image.mime };
}

/** Places `image` (already sized) centred on a transparent canvas. */
export function pad(image, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  const ox = Math.floor((size - image.width) / 2);
  const oy = Math.floor((size - image.height) / 2);
  for (let y = 0; y < image.height; y += 1) {
    out.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), ((y + oy) * size + ox) * 4);
  }
  return { width: size, height: size, data: out, mime: image.mime };
}

/** Anti-aliased circular mask (for Android ic_launcher_round). */
export function circleMask(image) {
  const out = new Uint8ClampedArray(image.data);
  const r = image.width / 2;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const dist = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      const cover = Math.max(0, Math.min(1, r - dist + 0.5));
      out[(y * image.width + x) * 4 + 3] *= cover;
    }
  }
  return { ...image, data: out };
}

export function parseHexColour(value, fallback = [255, 255, 255]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value ?? '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Nearest power of two (in log space), never above `max`. */
export function nearestPowerOfTwo(value, max = Infinity) {
  const pot = 2 ** Math.round(Math.log2(Math.max(1, value)));
  return pot > max ? 2 ** Math.floor(Math.log2(max)) : pot;
}

/** Target size for a texture: fit within maxSize, optionally snap to the nearest powers of two. */
export function fitSize(width, height, maxSize, powerOfTwo) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  let w = Math.max(1, Math.round(width * scale));
  let h = Math.max(1, Math.round(height * scale));
  if (powerOfTwo) { w = nearestPowerOfTwo(w, maxSize); h = nearestPowerOfTwo(h, maxSize); }
  return { width: w, height: h };
}
