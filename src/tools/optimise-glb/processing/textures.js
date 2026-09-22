import { textureCompress } from '@gltf-transform/functions';

/**
 * Colour textures — safe to re-encode into a lossy-capable format, because
 * they're interpreted as colour. Everything else (normal maps, packed
 * metallic-roughness/occlusion, transmission, clearcoat data) encodes
 * *numbers* in its channels, where re-compression artefacts become visible
 * lighting errors. Those are only ever resized, never converted.
 */
const COLOUR_SLOTS = /^(baseColorTexture|emissiveTexture|sheenColorTexture|specularColorTexture)$/;

export async function runTextures(document, plan, executed, warnings) {
  const textures = document.getRoot().listTextures();
  if (textures.length === 0) return;

  // 1. Resize — applies to every texture, including data textures. Scaling
  //    preserves channel semantics; it's re-encoding that doesn't.
  if (plan.textures.resize && plan.textures.maxSize) {
    try {
      await document.transform(
        textureCompress({ resize: [plan.textures.maxSize, plan.textures.maxSize] })
      );
      executed.push(`resize textures (max ${plan.textures.maxSize}px)`);
    } catch (err) {
      warnings.push(
        `Texture resize could not be completed (${err?.message || 'unknown error'}). Textures were left at their original resolution.`
      );
    }
  }

  // 2. Format conversion — colour slots only.
  if (plan.textures.toWebP) {
    try {
      await document.transform(
        textureCompress({ targetFormat: 'webp', slots: COLOUR_SLOTS })
      );
      executed.push('convert colour textures to WebP');
    } catch (err) {
      warnings.push(`WebP conversion failed (${err?.message || 'unknown error'}); textures kept their original format.`);
    }
  }
}
