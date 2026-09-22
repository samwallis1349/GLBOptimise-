import { listTextureSlots } from '@gltf-transform/functions';
import { roleForSlots, isMixedRole, ROLES } from './presets.js';

/**
 * Reads real texture facts out of a glTF document.
 *
 * Every number here comes from the actual image bytes — dimensions are parsed
 * from the file headers, not guessed from the buffer length, and byte counts
 * are the real payload sizes. Nothing is estimated.
 */

/** Reads width/height straight out of the image header. */
function readDimensions(bytes, mime) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  try {
    // PNG: IHDR is always the first chunk, width/height at bytes 16..24.
    if (mime === 'image/png' || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }

    // JPEG: walk the segment markers to the first SOFn frame header.
    if (mime === 'image/jpeg' || (bytes[0] === 0xff && bytes[1] === 0xd8)) {
      let offset = 2;
      while (offset < bytes.length - 8) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const marker = bytes[offset + 1];
        const length = view.getUint16(offset + 2);
        // SOF0-SOF15, excluding DHT(c4), JPG(c8) and DAC(cc).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        }
        offset += 2 + length;
      }
    }

    // WebP: RIFF container, dimensions depend on the VP8 variant.
    if (mime === 'image/webp' || (bytes[8] === 0x57 && bytes[9] === 0x45)) {
      const fourCC = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (fourCC === 'VP8 ') {
        return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      }
      if (fourCC === 'VP8L') {
        const bits = view.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (fourCC === 'VP8X') {
        return {
          width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
          height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
        };
      }
    }

    // KTX2: identifier is 12 bytes, then vkFormat/typeSize, then dimensions.
    if (mime === 'image/ktx2' || (bytes[0] === 0xab && bytes[1] === 0x4b)) {
      return { width: view.getUint32(20, true), height: view.getUint32(24, true) };
    }
  } catch {
    /* fall through to unknown */
  }

  return { width: null, height: null };
}

const isPowerOfTwo = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/**
 * @param {import('@gltf-transform/core').Document} document
 */
export function analyseTextures(document) {
  const root = document.getRoot();
  const textures = root.listTextures();
  const materials = root.listMaterials();

  const items = textures.map((texture, index) => {
    const image = texture.getImage();
    const bytes = image ? image.byteLength : 0;
    const mime = texture.getMimeType() || 'unknown';
    const { width, height } = image ? readDimensions(image, mime) : { width: null, height: null };
    const slots = listTextureSlots(texture);
    const role = roleForSlots(slots);

    // Which materials actually reference this texture. listParents() is the
    // graph's own answer, so a shared texture reports every material using it
    // — it gets compressed once and the saving counts once, which the table
    // needs to state or the per-texture numbers won't add up to the total.
    const usedBy = texture
      .listParents()
      .filter((parent) => materials.includes(parent))
      .map((m) => m.getName() || 'Untitled material');

    return {
      index,
      texture,
      name: texture.getName() || `Texture ${index + 1}`,
      uri: texture.getURI() || null,
      mime,
      bytes,
      width,
      height,
      pixels: width && height ? width * height : null,
      slots,
      role,
      mixedRole: isMixedRole(slots),
      powerOfTwo: isPowerOfTwo(width) && isPowerOfTwo(height),
      usedBy,
      /** Decodable by canvas — KTX2 input cannot be re-encoded in-browser. */
      decodable: mime !== 'image/ktx2' && mime !== 'unknown' && bytes > 0,
      skipReason:
        bytes === 0
          ? 'The texture has no image data.'
          : mime === 'image/ktx2'
            ? 'Already KTX2. Browsers cannot decode a Basis texture back to pixels, so it is left untouched.'
            : mime === 'unknown'
              ? 'Unrecognised image format.'
              : null,
    };
  });

  const totalBytes = items.reduce((sum, t) => sum + t.bytes, 0);
  const largest = items.reduce((max, t) => (t.bytes > (max?.bytes ?? -1) ? t : max), null);

  return {
    items,
    textureCount: items.length,
    materialCount: materials.length,
    totalBytes,
    largest,
    /** Rough VRAM cost: uncompressed RGBA in GPU memory, plus mip chain. */
    estimatedVramBytes: items.reduce(
      (sum, t) => sum + (t.pixels ? t.pixels * 4 * 1.33 : 0),
      0
    ),
    roleCounts: items.reduce((counts, t) => {
      counts[t.role.id] = (counts[t.role.id] || 0) + 1;
      return counts;
    }, {}),
  };
}

/**
 * The pre-flight list shown before the user commits to anything. Each item is
 * a fact about this specific model, not generic advice.
 */
export function buildTextureReport(analysis, settings) {
  const items = [];

  if (analysis.textureCount === 0) {
    items.push({ level: 'blocked', text: 'This model has no textures, so there is nothing to compress.' });
    return { items, canProceed: false };
  }

  items.push({
    level: 'ok',
    text: `${analysis.textureCount} texture${analysis.textureCount === 1 ? '' : 's'} across ${analysis.materialCount} material${analysis.materialCount === 1 ? '' : 's'}.`,
  });

  const cap = settings?.maxSize ?? null;
  const oversized = analysis.items.filter((t) => cap && t.width && Math.max(t.width, t.height) > cap);
  if (cap) {
    items.push(
      oversized.length
        ? {
            level: 'ok',
            text: `${oversized.length} texture${oversized.length === 1 ? ' is' : 's are'} larger than ${cap}px and will be scaled down.`,
          }
        : {
            level: 'warn',
            text: `Every texture is already ${cap}px or smaller. Nothing will be resized — only the format change will have any effect.`,
          }
    );
  }

  const nonPot = analysis.items.filter((t) => t.width && !t.powerOfTwo);
  if (nonPot.length) {
    items.push({
      level: 'warn',
      text: `${nonPot.length} texture${nonPot.length === 1 ? ' is' : 's are'} not power-of-two. Some engines will not mipmap those.`,
    });
  }

  const dataMaps = analysis.items.filter((t) => !t.role.lossySafe && t.decodable);
  if (dataMaps.length) {
    items.push({
      level: 'ok',
      text: `${dataMaps.length} data map${dataMaps.length === 1 ? '' : 's'} (${[...new Set(dataMaps.map((t) => t.role.label))].join(', ')}) — resized but not lossy-recompressed unless you override it.`,
    });
  }

  const alreadyKtx2 = analysis.items.filter((t) => t.mime === 'image/ktx2');
  if (alreadyKtx2.length) {
    items.push({
      level: 'warn',
      text: `${alreadyKtx2.length} texture${alreadyKtx2.length === 1 ? ' is' : 's are'} already KTX2 and will be skipped — browsers cannot decode Basis back to pixels.`,
    });
  }

  const shared = analysis.items.filter((t) => t.usedBy.length > 1);
  if (shared.length) {
    items.push({
      level: 'ok',
      text: `${shared.length} texture${shared.length === 1 ? ' is' : 's are'} shared between materials — compressed once, saving counts once.`,
    });
  }

  const mixed = analysis.items.filter((t) => t.mixedRole);
  if (mixed.length) {
    items.push({
      level: 'warn',
      text: `${mixed.length} texture${mixed.length === 1 ? ' is' : 's are'} bound to slots with different channel meanings, so the safest rule is applied.`,
    });
  }

  return { items, canProceed: analysis.items.some((t) => t.decodable) };
}

export { ROLES };
