import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { analyseTextures } from './CompressTexturesAnalysis.js';
import { FORMATS, ADVANCED_DEFAULTS } from './presets.js';

/**
 * The texture compression engine.
 *
 * Pipeline per texture: decode the real image bytes -> draw to a canvas at the
 * target size -> re-encode. Resolution reduction is the primary operation and
 * is applied before any format change, because scaling first is what makes the
 * encode cheap and the result small.
 *
 * Encoders actually used:
 *   WebP / JPEG / PNG — the browser's own canvas encoder (canvas.toBlob).
 *   KTX2              — basis_universal compiled to WebAssembly, via
 *                       ktx2-encoder, producing ETC1S or UASTC with a full
 *                       mip chain, wrapped in KHR_texture_basisu.
 *
 * Nothing here estimates. Every before/after byte count is measured on the
 * bytes that were actually written.
 */

/** basis_universal wasm, served from /public rather than imported: the
 *  package's `exports` map blocks a deep import of the .wasm, and pinning the
 *  URL keeps the encoder working in a production build and offline. */
const BASIS_WASM_URL = `${import.meta.env?.BASE_URL || '/'}basis-encoder/basis_encoder.wasm`;

let encoderPromise = null;
async function getKtx2Encoder() {
  if (!encoderPromise) {
    encoderPromise = import('ktx2-encoder').then((mod) => mod.encodeToKTX2);
  }
  return encoderPromise;
}

const yieldToUI = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Decodes real image bytes to a bitmap. Throws if the browser can't read it. */
async function decodeImage(bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  return createImageBitmap(blob);
}

const floorToPowerOfTwo = (n) => 2 ** Math.floor(Math.log2(Math.max(1, n)));

/**
 * Target dimensions for one texture. The cap applies to the longest edge and
 * aspect ratio is preserved. A texture already within the cap is not upscaled.
 */
export function targetSize(width, height, maxSize, powerOfTwo) {
  let w = width;
  let h = height;

  if (maxSize && Math.max(w, h) > maxSize) {
    const scale = maxSize / Math.max(w, h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }

  if (powerOfTwo) {
    w = floorToPowerOfTwo(w);
    h = floorToPowerOfTwo(h);
  }

  return { width: w, height: h, changed: w !== width || h !== height };
}

/**
 * Draws a bitmap to a canvas at the target size.
 *
 * Halving in steps rather than one big downscale: a single drawImage from 4096
 * to 512 point-samples and aliases badly, because the browser's filter only
 * looks at a small neighbourhood. Repeated halving averages every source pixel
 * in, which is what a proper mip generator does.
 */
function drawResized(bitmap, width, height) {
  let src = bitmap;
  let sw = bitmap.width;
  let sh = bitmap.height;

  while (sw > width * 2 || sh > height * 2) {
    const nw = Math.max(width, Math.floor(sw / 2));
    const nh = Math.max(height, Math.floor(sh / 2));
    const step = document.createElement('canvas');
    step.width = nw;
    step.height = nh;
    const stepCtx = step.getContext('2d');
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(src, 0, 0, nw, nh);
    src = step;
    sw = nw;
    sh = nh;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  return canvas;
}

/** True if any pixel is not fully opaque. JPEG and ETC1S handle alpha badly. */
function hasTransparency(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

async function canvasToBytes(canvas, mime, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new Error(`The browser could not encode ${mime}.`);
  if (blob.type !== mime) {
    // Chromium silently substitutes PNG for formats it cannot encode. Writing
    // that out labelled as the requested format would be a lie in the file.
    throw new Error(`The browser returned ${blob.type} instead of ${mime}.`);
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Decides what should happen to one texture, given the global settings and any
 * per-texture override. Separated out so the UI can show the same decision
 * before anything runs — the preview and the engine cannot disagree.
 */
export function planForTexture(item, settings, override = {}) {
  const maxSize = override.maxSize !== undefined ? override.maxSize : settings.maxSize;
  const requestedFormat = override.format || settings.format;

  if (!item.decodable) {
    return { action: 'skip', reason: item.skipReason || 'This texture cannot be decoded in a browser.' };
  }
  if (!item.width || !item.height) {
    return { action: 'skip', reason: 'The image dimensions could not be read, so it is left untouched.' };
  }

  const size = targetSize(item.width, item.height, maxSize, settings.powerOfTwo);

  // Data maps keep their exact channel values unless the user opts in.
  const allowLossy =
    item.role.lossySafe ||
    override.recompress === true ||
    (override.recompress === undefined && settings.recompressDataMaps);

  let format = requestedFormat;
  let downgradeNote = null;

  if (!allowLossy && FORMATS[format]?.lossy) {
    format = 'keep';
    downgradeNote = `${item.role.label} map — resized only. ${item.role.note}`;
  }

  return {
    action: 'process',
    format,
    size,
    allowLossy,
    downgradeNote,
    quality: override.quality ?? settings.quality,
  };
}

export const DEFAULT_SETTINGS = {
  maxSize: 1024,
  format: 'webp',
  ...ADVANCED_DEFAULTS,
};

/**
 * @param {{
 *   document: import('@gltf-transform/core').Document,
 *   settings: object,
 *   overrides?: Record<number, object>,
 *   onProgress?: (stage: string, detail?: object) => void,
 * }} params
 */
export async function compressTextures({
  document: doc,
  settings,
  overrides = {},
  onProgress = () => {},
}) {
  onProgress('ANALYSING');
  const originalStats = analyseTextures(doc);
  const reports = [];
  const warnings = [];
  const executed = [];

  let basisuExtension = null;
  let wroteKtx2 = false;

  onProgress('COMPRESSING');

  for (let i = 0; i < originalStats.items.length; i += 1) {
    const item = originalStats.items[i];
    const plan = planForTexture(item, settings, overrides[item.index]);

    onProgress('COMPRESSING', {
      texture: i + 1,
      total: originalStats.items.length,
      name: item.name,
    });

    if (plan.action === 'skip') {
      reports.push({
        name: item.name,
        role: item.role.label,
        status: 'Skipped',
        reason: plan.reason,
        beforeBytes: item.bytes,
        afterBytes: item.bytes,
        beforeSize: dims(item),
        afterSize: dims(item),
        format: item.mime,
      });
      await yieldToUI();
      continue;
    }

    try {
      const bitmap = await decodeImage(item.texture.getImage(), item.mime);
      const canvas = drawResized(bitmap, plan.size.width, plan.size.height);
      bitmap.close?.();

      const transparent = hasTransparency(canvas);
      let format = plan.format;
      let note = plan.downgradeNote;

      if (format === 'jpeg' && transparent) {
        format = 'webp';
        note = 'Has an alpha channel, which JPEG cannot store — written as WebP instead so transparency survives.';
      }

      let bytes;
      let mime;

      if (format === 'ktx2') {
        const encodeToKTX2 = await getKtx2Encoder();
        // Basis takes encoded image bytes, so the resized canvas goes through
        // PNG first. PNG is lossless, so this costs time but not quality.
        const png = await canvasToBytes(canvas, 'image/png');
        bytes = new Uint8Array(
          await encodeToKTX2(png, {
            isKTX2File: true,
            isUASTC: settings.ktx2Mode === 'uastc',
            qualityLevel: settings.ktx2Quality,
            compressionLevel: 2,
            generateMipmap: settings.mipmaps,
            isNormalMap: item.role.ktx2Hint === 'normal',
            wasmUrl: BASIS_WASM_URL,
          })
        );
        mime = 'image/ktx2';
        if (!basisuExtension) {
          basisuExtension = doc.createExtension(KHRTextureBasisu).setRequired(true);
        }
        wroteKtx2 = true;
      } else if (format === 'keep') {
        // Resize only. PNG keeps every channel value exactly, which is the
        // whole point for normal and ORM maps.
        mime = item.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        bytes = await canvasToBytes(canvas, mime, plan.quality);
      } else {
        mime = FORMATS[format].mime;
        bytes = await canvasToBytes(canvas, mime, plan.quality);
      }

      // If the "compressed" result is bigger, keep the original. A tool that
      // makes files larger while reporting a saving is worse than useless.
      if (bytes.byteLength >= item.bytes && format !== 'ktx2') {
        reports.push({
          name: item.name,
          role: item.role.label,
          status: 'Unchanged',
          reason: `Re-encoding produced a larger file (${formatB(bytes.byteLength)} vs ${formatB(item.bytes)}), so the original was kept.`,
          beforeBytes: item.bytes,
          afterBytes: item.bytes,
          beforeSize: dims(item),
          afterSize: dims(item),
          format: item.mime,
        });
        await yieldToUI();
        continue;
      }

      item.texture.setImage(bytes).setMimeType(mime);

      reports.push({
        name: item.name,
        role: item.role.label,
        status: 'Compressed',
        reason: note,
        beforeBytes: item.bytes,
        afterBytes: bytes.byteLength,
        beforeSize: dims(item),
        afterSize: `${plan.size.width}×${plan.size.height}`,
        format: mime,
        resized: plan.size.changed,
      });
    } catch (err) {
      reports.push({
        name: item.name,
        role: item.role.label,
        status: 'Failed',
        reason: err?.message || 'Unknown error.',
        beforeBytes: item.bytes,
        afterBytes: item.bytes,
        beforeSize: dims(item),
        afterSize: dims(item),
        format: item.mime,
      });
      warnings.push(`"${item.name}" could not be compressed and was left as it was (${err?.message || 'unknown error'}).`);
    }

    await yieldToUI();
  }

  const processed = reports.filter((r) => r.status === 'Compressed');
  if (processed.length) {
    const formats = [...new Set(processed.map((r) => r.format))].join(', ');
    executed.push(`re-encode ${processed.length} texture(s) to ${formats}`);
  }
  if (processed.some((r) => r.resized)) {
    executed.push(`resize textures (max ${settings.maxSize || 'unchanged'}px)`);
  }
  if (wroteKtx2) {
    executed.push('write KHR_texture_basisu (ETC1S/UASTC with mipmaps)');
    warnings.push(
      'KTX2 output declares KHR_texture_basisu as required. Engines and viewers without Basis support will refuse the file — that is the trade for GPU-compressed textures.'
    );
  }

  const skipped = reports.filter((r) => r.status === 'Skipped');
  if (skipped.length === reports.length && reports.length > 0) {
    warnings.push('No texture could be compressed. Nothing in the output has changed.');
  }

  onProgress('REBUILDING');
  const reducedStats = analyseTextures(doc);

  return {
    outputDocument: doc,
    originalStats,
    reducedStats,
    reports,
    warnings,
    executed,
    wroteKtx2,
  };
}

const dims = (item) => (item.width ? `${item.width}×${item.height}` : 'unknown');
const formatB = (n) => (n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);
