/**
 * Asset Compare — which numbers are diffed and which direction is "better".
 *
 * better: 'lower'   smaller B is an improvement (size, triangles, memory…)
 *         'higher'  bigger B is an improvement (health score)
 *         'neutral' change is reported but not judged (counts that depend on intent)
 */

const maxTexture = (a) => Math.max(0, ...a.textures.map((t) => Math.max(t.width, t.height)));
const boundsAxis = (axis) => (a) => (a.bounds ? a.bounds.size[axis] : null);

export const METRICS = [
  { key: 'fileBytes', label: 'File size', group: 'File', kind: 'bytes', better: 'lower', read: (a) => a.file.bytes },
  { key: 'health', label: 'Health score', group: 'File', kind: 'score', better: 'higher', read: (a) => a.health.score },
  { key: 'triangles', label: 'Triangles', group: 'Geometry', kind: 'count', better: 'lower', read: (a) => a.totals.triangles },
  { key: 'vertices', label: 'Vertices', group: 'Geometry', kind: 'count', better: 'lower', read: (a) => a.totals.vertices },
  { key: 'drawCalls', label: 'Draw calls', group: 'Geometry', kind: 'count', better: 'lower', read: (a) => a.totals.drawCalls },
  { key: 'meshes', label: 'Meshes', group: 'Geometry', kind: 'count', better: 'neutral', read: (a) => a.totals.meshes },
  { key: 'primitives', label: 'Primitives', group: 'Geometry', kind: 'count', better: 'lower', read: (a) => a.totals.primitives },
  { key: 'materials', label: 'Materials', group: 'Materials', kind: 'count', better: 'neutral', read: (a) => a.totals.materials },
  { key: 'textures', label: 'Textures', group: 'Materials', kind: 'count', better: 'neutral', read: (a) => a.totals.textures },
  { key: 'maxTexture', label: 'Largest texture', group: 'Materials', kind: 'px', better: 'lower', read: maxTexture },
  { key: 'animations', label: 'Animations', group: 'Animation', kind: 'count', better: 'neutral', read: (a) => a.totals.animations },
  { key: 'joints', label: 'Joints', group: 'Animation', kind: 'count', better: 'neutral', read: (a) => a.totals.joints },
  { key: 'morphTargets', label: 'Morph targets', group: 'Animation', kind: 'count', better: 'neutral', read: (a) => a.totals.morphTargets },
  { key: 'gpuGeometry', label: 'GPU geometry (est.)', group: 'Memory', kind: 'bytes', better: 'lower', read: (a) => a.gpu.geometryBytes },
  { key: 'gpuTextures', label: 'GPU textures (est.)', group: 'Memory', kind: 'bytes', better: 'lower', read: (a) => a.gpu.textureBytes },
  { key: 'gpuTotal', label: 'GPU total (est.)', group: 'Memory', kind: 'bytes', better: 'lower', read: (a) => a.gpu.totalBytes },
  { key: 'boundsX', label: 'Bounds X', group: 'Bounds', kind: 'units', better: 'neutral', bounds: true, read: boundsAxis(0) },
  { key: 'boundsY', label: 'Bounds Y', group: 'Bounds', kind: 'units', better: 'neutral', bounds: true, read: boundsAxis(1) },
  { key: 'boundsZ', label: 'Bounds Z', group: 'Bounds', kind: 'units', better: 'neutral', bounds: true, read: boundsAxis(2) },
];

/** On-disk byte categories from analysis.bytes, in stacking order. */
export const BYTE_CATEGORIES = [
  { key: 'geometry', label: 'Geometry', color: '#ffb547' },
  { key: 'textures', label: 'Textures', color: '#4dd8e0' },
  { key: 'animation', label: 'Animation', color: '#b48aff' },
  { key: 'morphTargets', label: 'Morph targets', color: '#ff6b9d' },
  { key: 'skinning', label: 'Skinning', color: '#5b9dff' },
  { key: 'json', label: 'JSON', color: '#e0c34a' },
  { key: 'other', label: 'Other', color: '#6f6c65' },
];

/** Relative bounds change above this counts as a scale/pivot regression. */
export const BOUNDS_TOLERANCE = 0.01;

export const VIEW_MODES = [
  { id: 'shaded', label: 'Shaded' },
  { id: 'wireframe', label: 'Wireframe' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'normals', label: 'Normals' },
  { id: 'uv', label: 'UV' },
];

export const ACCEPT = '.glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2,.zip';
