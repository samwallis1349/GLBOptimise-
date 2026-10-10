import { Logger } from '@gltf-transform/core';
import { MeshoptEncoder } from 'meshoptimizer';
import { getIO as getSharedIO } from '../../../shared/glb/createIO.js';
import { pureCodecs } from '../engine/codecs.js';

/**
 * Browser side of the engine's `env`: the shared site IO (Draco + Meshopt
 * decoders) plus the Meshopt encoder, and image codecs that add what only a
 * browser has — fast native decoding (incl. WebP), WebP encoding via canvas,
 * and KTX2 via the Basis Universal wasm encoder already used by Compress
 * Textures. Each encoder is probed before it is offered.
 */

let ioPromise = null;
export function getPipelineIO() {
  if (!ioPromise) {
    ioPromise = (async () => {
      const io = await getSharedIO();
      await MeshoptEncoder.ready;
      io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
      io.setLogger(new Logger(Logger.Verbosity.WARN));
      return io;
    })();
  }
  return ioPromise;
}

const BASIS_WASM_URL = `${import.meta.env?.BASE_URL || '/'}basis-encoder/basis_encoder.wasm`;

function canvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

async function canvasBlob(c, type, quality) {
  if (c.convertToBlob) return c.convertToBlob({ type, quality });
  return new Promise((resolve) => c.toBlob(resolve, type, quality));
}

function imageToCanvas(image) {
  const c = canvas(image.width, image.height);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength), image.width, image.height), 0, 0);
  return c;
}

async function probeWebp() {
  try {
    const c = canvas(4, 4);
    c.getContext('2d').fillRect(0, 0, 4, 4);
    const blob = await canvasBlob(c, 'image/webp', 0.8);
    return Boolean(blob) && blob.type === 'image/webp';
  } catch {
    return false;
  }
}

let codecsPromise = null;
export function getBrowserCodecs() {
  if (!codecsPromise) codecsPromise = createBrowserCodecs();
  return codecsPromise;
}

async function createBrowserCodecs() {
  const base = pureCodecs();
  const webp = await probeWebp();
  const codecs = {
    name: 'browser',
    canDecode: (mime) => ['image/png', 'image/jpeg', 'image/webp'].includes(mime),
    async decode(bytes, mime) {
      // Native decoding is much faster than the JS decoders for big textures.
      // colorSpaceConversion 'none' and premultiplyAlpha 'none' keep the stored values exact (normal maps!).
      const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      try {
        const c = canvas(bitmap.width, bitmap.height);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return { width: bitmap.width, height: bitmap.height, data };
      } finally {
        bitmap.close?.();
      }
    },
    encoders: { ...base.encoders },
    status: { webp: webp ? 'available' : 'This browser cannot encode WebP from a canvas.', ktx2: 'available' },
  };
  // The browser's PNG encoder filters and deflates far better than the JS
  // one. Canvas stores premultiplied alpha, which would round the colour of
  // semi-transparent pixels, so it is only used for fully opaque images.
  codecs.encoders.png = async (image) => {
    const d = image.data;
    let opaque = true;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] !== 255) {
        opaque = false;
        break;
      }
    }
    if (!opaque) return base.encoders.png(image);
    const blob = await canvasBlob(imageToCanvas(image), 'image/png');
    return blob ? new Uint8Array(await blob.arrayBuffer()) : base.encoders.png(image);
  };
  if (webp) {
    codecs.encoders.webp = async (image, { quality = 85 } = {}) => {
      const blob = await canvasBlob(imageToCanvas(image), 'image/webp', quality / 100);
      if (!blob || blob.type !== 'image/webp') throw new Error('WebP encoding failed in this browser.');
      return new Uint8Array(await blob.arrayBuffer());
    };
  }
  codecs.encoders.ktx2 = async (image, opts) => {
    const { encodeToKTX2 } = await import('ktx2-encoder');
    // Basis wants dimensions in multiples of 4.
    const png = await base.encoders.png(image);
    const out = await encodeToKTX2(png, {
      isKTX2File: true,
      isUASTC: opts.mode === 'uastc',
      qualityLevel: opts.quality,
      compressionLevel: 2,
      generateMipmap: opts.mipmaps,
      isNormalMap: opts.normalMap,
      isInputSRGB: opts.srgb,
      isSetKTX2SRGBTransferFunc: opts.srgb,
      needSupercompression: true,
      wasmUrl: BASIS_WASM_URL,
    });
    return new Uint8Array(out);
  };
  return codecs;
}
