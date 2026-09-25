/**
 * Homepage wizard hero — tunables and asset locations.
 *
 * Geometry, textures and downloads live in public/hero/ and are produced by
 * scripts/hero/build-assets.mjs, which also writes public/hero/manifest.json
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
  /** Level shown first (fast, small) while full detail streams in. */
  previewLod: 4,
  /** Texture set loaded by default. 4K (13 MB) is only fetched on request. */
  defaultTextures: '2',
  /** Texture set used on Save-Data connections. */
  saveDataTextures: '1',
  maxPixelRatio: 1.5,
};

/**
 * Byte sizes of a standalone GLB export for each (texture set × LOD), in
 * the same order as the six LODs. Measured by the handoff pipeline
 * (texture-lod-sizes.json); these describe what a user would download for
 * that combination, not what the hero has transferred.
 */
export const EXPORT_BYTES = {
  1: [29946760, 13499548, 6462992, 3073652, 2170560, 1748972],
  2: [32653672, 16206460, 9169904, 5780568, 4877476, 4455888],
  4: [41743812, 25296596, 18260044, 14870704, 13967616, 13546024],
};

/** The precomputed balanced preset applied by "Optimise". */
export const OPTIMISED = {
  file: 'downloads/assetbench-wizard-optimised.glb',
  triangles: 24999,
  bytes: 2375796,
  lod: 4,
  summary: 'Balanced: 2K colour · 1K normal · 512px material · Meshopt',
};

export const DOWNLOADS = {
  standard: {
    file: 'downloads/assetbench-wizard-balanced.glb',
    name: 'assetbench-wizard-balanced.glb',
    bytes: 2957912,
    note: '24,999 triangles · Textured GLB · Static, unrigged · Free to test',
  },
  optimised: {
    file: OPTIMISED.file,
    name: 'assetbench-wizard-optimised.glb',
    bytes: OPTIMISED.bytes,
    note: '24,999 triangles · Meshopt: needs an importer with EXT_meshopt_compression',
  },
};

/** Binary megabytes, labelled MB (matches formatFileSize elsewhere on the site). */
export function mb(bytes, decimals = 2) {
  return `${(bytes / 1048576).toFixed(decimals)} MB`;
}
