import { decodeImage, encodeImage, sniffImage } from '../../../../worker/api/images.js';

/**
 * Image codecs used by the texture stages. The defaults are pure JavaScript
 * (the Cloud API's PNG/JPEG decoder, area-filter resampler and encoders), so
 * the engine runs unchanged in Node, a Web Worker or the page. The browser
 * build extends this with WebP (canvas) and KTX2 (Basis wasm) encoders — see
 * ui/browserCodecs.js. A format is only offered when its encoder exists.
 *
 * Image shape everywhere: { width, height, data: Uint8ClampedArray RGBA8 }.
 */
export function pureCodecs() {
  return {
    name: 'pure-js',
    canDecode: (mime) => mime === 'image/png' || mime === 'image/jpeg',
    async decode(bytes, mime) {
      const info = sniffImage(bytes);
      if (!info || (info.mime !== 'image/png' && info.mime !== 'image/jpeg')) {
        throw new Error(`${mime || 'This image format'} cannot be decoded here.`);
      }
      return decodeImage(bytes);
    },
    encoders: {
      png: async (image) => encodeImage(image, 'image/png'),
      jpeg: async (image, { quality = 85 } = {}) => encodeImage(image, 'image/jpeg', { quality }),
    },
  };
}

/** Which output formats this codec set can actually write. */
export function availableFormats(codecs) {
  return { keep: true, png: Boolean(codecs.encoders.png), jpeg: Boolean(codecs.encoders.jpeg), webp: Boolean(codecs.encoders.webp), ktx2: Boolean(codecs.encoders.ktx2) };
}

export const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', ktx2: 'image/ktx2' };
export const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/ktx2': 'ktx2' };

/** FNV-1a over the bytes plus length: a cheap content key for the per-batch encode cache. */
export function contentKey(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${bytes.length}`;
}
