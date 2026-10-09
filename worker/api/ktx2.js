import { KHRTextureBasisu } from '@gltf-transform/extensions';
import BASIS from './vendor/basis_encoder.js';
import { encodeWithModule } from '../../node_modules/ktx2-encoder/dist/encodeCore.js';
import { ApiError } from './http.js';
import { decodeImage, fitSize, resize } from './images.js';

/**
 * KTX2 (Basis Universal) encoding on the Worker. The encoder glue is a
 * patched copy (see scripts/vendor-basis.mjs) because Workers forbid the
 * `new Function` code generation the stock build relies on. The .wasm is
 * bundled as a module by wrangler; Node tests inject a compiled module via
 * globalThis.__ASSETBENCH_BASIS_WASM__.
 */

let modulePromise = null;
async function basis() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const wasmModule = globalThis.__ASSETBENCH_BASIS_WASM__ ?? (await import('./vendor/basisWasm.js')).default;
      const instance = await BASIS({
        print: () => {},
        printErr: () => {},
        instantiateWasm(imports, done) {
          WebAssembly.instantiate(wasmModule, imports).then((inst) => done(inst));
          return {};
        },
      });
      instance.initializeBasis();
      return instance;
    })();
    modulePromise.catch(() => { modulePromise = null; });
  }
  return modulePromise;
}

export const KTX2_MODES = ['etc1s', 'uastc'];

/** ETC1S: small files for colour maps. UASTC: higher quality, larger; right for normal maps. */
function options(mode, { normalMap = false, srgb = true, mipmaps = true, quality = 128 } = {}) {
  return {
    isUASTC: mode === 'uastc',
    isNormalMap: normalMap,
    isInputSRGB: srgb,
    isSetKTX2SRGBTransferFunc: srgb,
    generateMipmap: mipmaps,
    qualityLevel: Math.max(1, Math.min(255, quality)),
    compressionLevel: 2,
    needSupercompression: true,
    enableRDO: mode === 'uastc',
  };
}

/** Basis needs dimensions that are multiples of 4; mipmapped GPU textures want powers of two. */
function prepare(image, maxSize) {
  const target = fitSize(image.width, image.height, maxSize || 4096, true);
  return resize(image, Math.max(4, target.width), Math.max(4, target.height));
}

export async function encodeKtx2(imageBytes, { mode = 'etc1s', normalMap = false, srgb = true, mipmaps = true, quality, maxSize } = {}) {
  if (!KTX2_MODES.includes(mode)) throw new ApiError(400, 'invalid_mode', 'mode must be etc1s or uastc.');
  const image = prepare(decodeImage(imageBytes), maxSize);
  if (image.width * image.height > 12 * 1024 * 1024) throw new ApiError(413, 'image_too_large', 'KTX2 encoding is limited to 12 megapixels; pass maxSize to shrink first.');
  const module = await basis();
  const bytes = await encodeWithModule(module, imageBytes, {
    ...options(mode, { normalMap, srgb, mipmaps, quality }),
    imageDecoder: async () => ({ width: image.width, height: image.height, data: image.data }),
  });
  return { bytes, width: image.width, height: image.height };
}

const LINEAR_SLOTS = new Set(['normalTexture', 'metallicRoughnessTexture', 'occlusionTexture']);

/** Converts every PNG/JPEG texture in a document to KTX2 and marks KHR_texture_basisu required. */
export async function texturesToKtx2(document, { mode = 'auto', maxSize = 0, warnings = [] } = {}) {
  const root = document.getRoot();
  const roles = new Map();
  for (const material of root.listMaterials()) {
    const slots = {
      baseColorTexture: material.getBaseColorTexture(),
      emissiveTexture: material.getEmissiveTexture(),
      normalTexture: material.getNormalTexture(),
      metallicRoughnessTexture: material.getMetallicRoughnessTexture(),
      occlusionTexture: material.getOcclusionTexture(),
    };
    for (const [slot, tex] of Object.entries(slots)) {
      if (!tex) continue;
      const r = roles.get(tex) || new Set();
      r.add(slot);
      roles.set(tex, r);
    }
  }
  const converted = [];
  for (const texture of root.listTextures()) {
    const mime = texture.getMimeType();
    if (mime === 'image/ktx2') continue;
    if (mime !== 'image/png' && mime !== 'image/jpeg') { warnings.push(`Texture "${texture.getName() || 'unnamed'}" is ${mime}; left as is.`); continue; }
    const slots = roles.get(texture) || new Set();
    const normalMap = slots.has('normalTexture');
    const linear = [...slots].some((s) => LINEAR_SLOTS.has(s)) && !slots.has('baseColorTexture') && !slots.has('emissiveTexture');
    const texMode = mode === 'auto' ? (normalMap ? 'uastc' : 'etc1s') : mode;
    const before = texture.getImage().byteLength;
    const { bytes, width, height } = await encodeKtx2(texture.getImage(), { mode: texMode, normalMap, srgb: !linear, maxSize });
    texture.setImage(bytes).setMimeType('image/ktx2');
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.(png|jpe?g)$/i, '.ktx2'));
    converted.push({ name: texture.getName() || null, slots: [...slots], mode: texMode, size: `${width}x${height}`, bytesBefore: before, bytesAfter: bytes.byteLength });
  }
  if (converted.length) document.createExtension(KHRTextureBasisu).setRequired(true);
  return converted;
}
