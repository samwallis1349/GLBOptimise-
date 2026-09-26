/** Inspect GLB — UI configuration. Analysis itself lives in src/shared/glb/. */

export const INSPECT_GLB_CONFIG = {
  accept: '.glb,.gltf,.bin,.zip,.png,.jpg,.jpeg,.webp,.ktx2',
  // Pretty-printed JSON above this size is truncated on screen (download stays full).
  maxJsonDisplayBytes: 2 * 1024 * 1024,
};

export const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'scene', label: 'Scene' },
  { id: 'meshes', label: 'Meshes' },
  { id: 'materials', label: 'Materials' },
  { id: 'textures', label: 'Textures' },
  { id: 'animations', label: 'Animations' },
  { id: 'skins', label: 'Skins' },
  { id: 'issues', label: 'Issues' },
  { id: 'json', label: 'JSON' },
];

export const VIEW_MODES = [
  { id: 'shaded', label: 'Shaded' },
  { id: 'wireframe', label: 'Wireframe' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'normals', label: 'Normals' },
  { id: 'uv', label: 'UV checker' },
];

// Order + colours for the "where are the bytes" bar.
export const BYTE_CATEGORIES = [
  { key: 'geometry', label: 'Geometry', color: '#ffb547' },
  { key: 'textures', label: 'Textures', color: '#4dd8e0' },
  { key: 'animation', label: 'Animation', color: '#b48aff' },
  { key: 'morphTargets', label: 'Morph targets', color: '#ff6b9d' },
  { key: 'skinning', label: 'Skinning', color: '#5b9dff' },
  { key: 'json', label: 'JSON', color: '#e0c34a' },
  { key: 'other', label: 'Other / padding', color: '#6f6c65' },
];
