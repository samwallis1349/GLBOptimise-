/**
 * Asset Report — batch library audit settings and display labels.
 */
export const ASSET_REPORT_CONFIG = {
  maxAssets: 200,
  // Thumbnails default on for batches up to this size (rendering is the slow part).
  autoThumbnailLimit: 40,
  thumbnail: { width: 240, height: 180 },
  defaultTarget: 'web',
  accept: '.glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2,.zip',
};

export const GRADES = ['A', 'B', 'C', 'D', 'F'];

/** Byte categories from analysis.bytes, in stacked-bar order. */
export const BYTE_CATEGORIES = [
  { key: 'geometry', label: 'Geometry', color: '#ffb547' },
  { key: 'textures', label: 'Textures', color: '#4dd8e0' },
  { key: 'animation', label: 'Animation', color: '#b48aff' },
  { key: 'morphTargets', label: 'Morph targets', color: '#ff6b9d' },
  { key: 'skinning', label: 'Skinning', color: '#5b9dff' },
  { key: 'json', label: 'JSON', color: '#e0c34a' },
  { key: 'other', label: 'Other', color: '#6f6c65' },
];

/**
 * Library-level names for issue codes (per-asset issue titles include
 * counts, e.g. "3 4K textures", so they can't be grouped by title).
 */
export const ISSUE_LABELS = {
  'no-geometry': 'No renderable triangles',
  'missing-resources': 'Missing external files',
  'gltf-json': 'Stored as .gltf (JSON)',
  'file-huge': 'Very large file',
  'file-large': 'Large file',
  'tris-extreme': 'Extreme triangle count',
  'tris-high': 'High triangle count',
  'no-lods': 'No LOD levels',
  'geometry-uncompressed': 'Geometry isn’t compressed',
  'not-quantized': 'Vertex data not quantized',
  unindexed: 'Primitives without index buffer',
  'no-normals': 'Missing normals',
  'textured-no-uv': 'Textured without UVs',
  'no-tangents': 'Normal maps without tangents',
  'scale-large': 'Model is very large (units)',
  'scale-small': 'Model is very small (units)',
  'drawcalls-high': 'Many draw calls',
  'drawcalls-medium': 'Moderate draw calls',
  'materials-many': 'Lots of materials',
  'alpha-blend': 'Alpha-blended materials',
  'unused-data': 'Unused data in file',
  'empty-nodes': 'Empty nodes',
  'negative-scale': 'Negative-scale nodes',
  'tex-8k': 'Textures above 4K',
  'tex-4k': '4K textures',
  'tex-npot': 'Non-power-of-two textures',
  'tex-no-ktx2': 'No GPU texture compression',
  'tex-heavy-png': 'Heavy PNG textures',
  'tex-bytes': 'Textures dominate file size',
  'tex-duplicate': 'Duplicate textures',
  'tex-orm': 'AO not packed with metal/rough',
  'anim-static': 'Static animation channels',
  'anim-dense': 'Densely sampled animation',
  'anim-bytes': 'Large animation data',
  'anim-many': 'Many animation clips',
  'rig-joints': 'Skins over 255 joints',
  'rig-influences': 'More than 4 bone influences',
  'ext-required': 'Uncommon required extensions',
  'ext-draco': 'Uses Draco compression',
  'ext-ktx2': 'Uses KTX2 textures',
};
