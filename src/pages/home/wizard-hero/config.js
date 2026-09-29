import manifest from './hero-manifest.json';

/**
 * Homepage hero (the Rusted Colossus) — tunables and asset locations.
 *
 * Geometry, textures and downloads live in public/hero/ and are produced by
 * scripts/hero/build-from-glb.mjs, which also writes hero-manifest.json
 * (the measured triangle counts and byte sizes the hero displays).
 */
export const HERO_BASE = '/hero/';

export const HERO_CONFIG = {
  /** Full drag turns needed to go from full detail to the lowest level. */
  totalTurns: 5,
  /** Spring pulling displayed progress towards the drag target. */
  spring: { stiffness: 100, dampingDragging: 22, dampingReleased: 13 },
  /** Max settling tilt (radians) while the model is spinning. */
  maxTilt: 0.018,
  /** 0 disables the gold trails and sparks; 1 is the approved look. */
  fxIntensity: 1,
  zoom: { min: 0.75, max: 2, step: 0.1 },
  /** Model height in scene units after framing. */
  modelHeight: 2.65,
  /** Start with the sharpest geometry so the first live view is full detail. */
  previewLod: 0,
  /** Texture set loaded by default. */
  defaultTextures: '2',
  /** Texture set used on Save-Data connections. */
  saveDataTextures: '1',
  maxPixelRatio: 2,
};

/**
 * Byte sizes of a standalone GLB export for each (texture set × LOD), in
 * the same order as the six LODs. These describe what a user would download
 * for that combination, not what the hero has transferred.
 */
export const EXPORT_BYTES = manifest.exportBytes;

/** Texture set keys ('1', '2', …) in ascending resolution. */
export const TEXTURE_KEYS = Object.keys(manifest.textures).sort((a, b) => a - b);

/** The free download offered under the hero. */
export const DOWNLOAD = {
  file: manifest.downloads.balanced.file,
  name: 'assetbench-colossus-balanced.glb',
  bytes: manifest.downloads.balanced.bytes,
  note: `${manifest.downloads.balanced.triangles.toLocaleString('en-GB')} triangles · Textured GLB · Static, unrigged · Free to test`,
};

/** Binary megabytes, labelled MB (matches formatFileSize elsewhere on the site). */
export function mb(bytes, decimals = 2) {
  return `${(bytes / 1048576).toFixed(decimals)} MB`;
}
