/**
 * Central Asset Bench tool registry — the single source of truth for
 * every tool in the suite. Homepage cards, the /tools page, in-tool
 * navigation, and any future tool switcher must all read from this list
 * rather than hardcoding tool metadata themselves.
 *
 * status: 'available' | 'beta' | 'foundation-ready' | 'coming-soon'
 *   - 'available' tools render their real, working page module.
 *   - 'beta' tools are real and working but not yet fully hardened.
 *   - 'foundation-ready' tools have a page shell built but no processing
 *     engine wired up yet (e.g. Optimise GLB).
 *   - 'coming-soon' tools render only the shared placeholder shell.
 *
 * category: one of CATEGORIES[number].id below — groups tools on the
 * homepage into scannable families instead of one flat grid.
 *
 * To add a new tool:
 *   1. Create src/tools/<id>/ with an index.js exporting a `mount(container)`
 *      function (see src/tools/optimise-glb/index.js for the pattern).
 *   2. Add an entry below, with a `category` matching one of CATEGORIES.
 *   3. It will automatically appear in the homepage, the tools page, and
 *      the router — no other file needs to change.
 */

/**
 * Tool categories, in homepage display order. `accent` names a CSS custom
 * property (defined in src/styles/variables.css) used only for small
 * category icons/headings — the app stays fundamentally black/amber, so
 * these are deliberately restrained accents, not a full re-theme per tool.
 */
export const CATEGORIES = [
  { id: 'optimise', label: 'Optimise & Reduce', icon: 'gauge', accent: '--cat-amber' },
  { id: 'animation', label: 'Animations & Rigging', icon: 'bone', accent: '--cat-purple' },
  { id: 'materials', label: 'Materials & Textures', icon: 'layers-3', accent: '--cat-cyan' },
  { id: 'build', label: 'Build & Repair', icon: 'tools', accent: '--cat-blue' },
  { id: 'inspect', label: 'Inspect & Analyse', icon: 'search', accent: '--cat-pink' },
  { id: 'utilities', label: 'Preview & Utilities', icon: 'eye', accent: '--cat-yellow' },
];

export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}

export const TOOLS = [
  // ---------- Optimise & Reduce ----------
  {
    id: 'optimise-glb',
    name: 'Optimise GLB',
    route: '/optimise-glb',
    description: 'Reduce model size while preserving important content.',
    keywords: ['compress', 'shrink', 'draco', 'meshopt', 'file size'],
    icon: 'package-open',
    thumbnail: '/thumbnails/optimise-glb.webp',
    features: [
      { icon: 'shrink', label: 'Smaller' },
      { icon: 'shield', label: 'Quality' },
      { icon: 'zap', label: 'Fast' },
    ],
    status: 'available',
    category: 'optimise',
  },
  {
    id: 'reduce-polys',
    name: 'Reduce Polys',
    route: '/reduce-polys',
    description: 'Reduce geometry for realtime use.',
    keywords: ['decimate', 'simplify', 'triangles', 'polygons', 'lod', 'mesh'],
    icon: 'shrink',
    thumbnail: '/thumbnails/reduce-polys.webp',
    features: [
      { icon: 'shrink', label: 'Low tris' },
      { icon: 'shield', label: 'Keep form' },
      { icon: 'gamepad', label: 'Game ready' },
    ],
    status: 'available',
    category: 'optimise',
  },
  {
    id: 'compress-textures',
    name: 'Compress Textures',
    route: '/compress-textures',
    description: 'Resize and compress model textures.',
    keywords: ['ktx2', 'basis', 'jpeg', 'png', 'webp', 'image', 'resolution'],
    icon: 'image-down',
    thumbnail: '/thumbnails/compress-textures.webp',
    features: [
      { icon: 'image-down', label: 'Smaller' },
      { icon: 'shield', label: 'Detail' },
      { icon: 'zap', label: 'Fast' },
    ],
    status: 'available',
    category: 'optimise',
  },
  {
    id: 'generate-lods',
    name: 'Generate LODs',
    route: '/generate-lods',
    description: 'Create multiple Levels of Detail.',
    keywords: ['lod', 'detail', 'distance', 'performance', 'mesh'],
    icon: 'layers',
    thumbnail: '/thumbnails/generate-lods.webp',
    features: [
      { icon: 'layers', label: 'Multi-LOD' },
      { icon: 'gauge', label: 'Faster' },
      { icon: 'gamepad', label: 'Game ready' },
    ],
    status: 'available',
    category: 'optimise',
  },

  // ---------- Animations & Rigging ----------
  {
    id: 'strip-animations',
    name: 'Strip Animations',
    route: '/strip-animations',
    description: 'Inspect and remove unwanted animation clips.',
    keywords: ['clips', 'clean up', 'delete animation', 'rig', 'keyframes'],
    icon: 'film-off',
    thumbnail: '/thumbnails/strip-animations.webp',
    features: [
      { icon: 'film-off', label: 'Cut clips' },
      { icon: 'shrink', label: 'Smaller' },
      { icon: 'gamepad', label: 'Game ready' },
    ],
    status: 'available',
    category: 'animation',
  },
  {
    id: 'rig-inspector',
    name: 'Rig Inspector',
    route: '/rig-inspector',
    description: 'Inspect bones, weights and skinning.',
    keywords: ['skeleton', 'joints', 'weights', 'skin', 'rigging'],
    icon: 'bone',
    thumbnail: '/thumbnails/rig-inspector.webp',
    features: [
      { icon: 'bone', label: 'Joints' },
      { icon: 'search', label: 'Weights' },
      { icon: 'shield', label: 'Validate' },
    ],
    status: 'available',
    category: 'animation',
  },
  {
    id: 'animation-inspector',
    name: 'Animation Inspector',
    route: '/animation-inspector',
    description: 'View and analyse animation clips.',
    keywords: ['clips', 'preview', 'playback', 'timeline'],
    icon: 'play-circle',
    thumbnail: '/thumbnails/animation-inspector.webp',
    features: [
      { icon: 'play-circle', label: 'Preview' },
      { icon: 'activity', label: 'Curves' },
      { icon: 'search', label: 'Issues' },
    ],
    status: 'available',
    category: 'animation',
  },
  {
    id: 'animation-optimiser',
    name: 'Animation Optimiser',
    route: '/animation-optimiser',
    description: 'Reduce keyframes and optimise animation data.',
    keywords: ['keyframes', 'curve', 'compress animation', 'clips'],
    icon: 'activity',
    thumbnail: '/thumbnails/animation-optimiser.webp',
    features: [
      { icon: 'shrink', label: 'Fewer keys' },
      { icon: 'shield', label: 'Motion' },
      { icon: 'gamepad', label: 'Game ready' },
    ],
    status: 'available',
    category: 'animation',
  },

  // ---------- Materials & Textures ----------
  {
    id: 'pack-pbr',
    name: 'Pack PBR',
    route: '/pack-pbr',
    description: 'Pack PBR maps into efficient channel textures.',
    keywords: ['metalness', 'roughness', 'ao', 'orm', 'channel packing'],
    icon: 'layers-3',
    thumbnail: '/thumbnails/pack-pbr.webp',
    features: [
      { icon: 'layers-3', label: 'ORM pack' },
      { icon: 'image-down', label: 'Fewer maps' },
      { icon: 'gauge', label: 'Faster' },
    ],
    status: 'available',
    category: 'materials',
  },
  {
    id: 'texture-resizer',
    name: 'Texture Resizer',
    route: '/texture-resizer',
    description: 'Resize textures to 4K / 2K / 1K or a custom size.',
    keywords: ['downscale', 'resolution', 'image'],
    icon: 'maximize-2',
    thumbnail: '/thumbnails/texture-resizer.webp',
    features: [
      { icon: 'maximize-2', label: 'Smaller' },
      { icon: 'shield', label: 'Detail' },
      { icon: 'zap', label: 'Fast' },
    ],
    status: 'available',
    category: 'materials',
  },

  // ---------- Build & Repair ----------
  {
    id: 'convert-files',
    name: 'Convert Files',
    route: '/convert-files',
    description: 'Open 24 model formats and save to 14, including FBX, GLB, OBJ, DAE and 3MF.',
    keywords: ['fbx', 'obj', 'gltf', 'glb', 'usd', 'usdz', 'stl', 'ply', 'dae', 'collada', '3mf', '3ds', 'pmx', 'vox', 'x3d', 'vrml', 'format', 'model convertor', 'model converter'],
    icon: 'refresh-cw',
    thumbnail: '/thumbnails/convert-files.webp',
    features: [
      { icon: 'refresh-cw', label: 'Formats' },
      { icon: 'package-open', label: 'GLB out' },
      { icon: 'zap', label: 'Fast' },
    ],
    status: 'available',
    category: 'build',
  },
  {
    id: 'glb-builder',
    name: 'GLB Builder & Merger',
    route: '/glb-builder',
    description: 'Arrange GLB, glTF and FBX assets on a ground plane and export one merged scene.',
    keywords: ['arranger', 'arrange', 'combine', 'join', 'assemble', 'scene build', 'layout', 'place', 'level', 'merge'],
    icon: 'package-plus',
    thumbnail: '/thumbnails/glb-builder.webp',
    // Double-width artwork for the featured slot on the All Tools page.
    banner: '/thumbnails/glb-builder-wide.webp',
    features: [
      { icon: 'package-plus', label: 'Arrange' },
      { icon: 'git-merge', label: 'Merge' },
      { icon: 'grid', label: 'One scene' },
    ],
    status: 'available',
    category: 'build',
  },
  {
    id: 'model-splitter',
    name: 'Model Splitter',
    route: '/model-splitter',
    description: 'Extract objects into separate GLBs.',
    keywords: ['separate', 'break apart', 'export objects'],
    icon: 'git-branch',
    thumbnail: '/thumbnails/model-splitter.webp',
    features: [
      { icon: 'git-branch', label: 'Split' },
      { icon: 'package-open', label: 'Per object' },
      { icon: 'grid', label: 'Batch out' },
    ],
    status: 'coming-soon',
    category: 'build',
  },

  // ---------- Inspect & Analyse ----------
  {
    id: 'inspect-glb',
    name: 'Inspect GLB',
    route: '/inspect-glb',
    description: 'Explore every mesh, material, texture and byte in a GLB.',
    keywords: ['inspect', 'debug', 'structure', 'validate', 'json', 'scene graph', 'hierarchy', 'wireframe', 'uv', 'check'],
    icon: 'search',
    thumbnail: '/thumbnails/inspect-glb.webp',
    features: [
      { icon: 'search', label: 'Structure' },
      { icon: 'file-text', label: 'Report' },
      { icon: 'shield', label: 'Validate' },
    ],
    status: 'available',
    category: 'inspect',
  },
  {
    id: 'asset-compare',
    name: 'Asset Compare',
    route: '/asset-compare',
    description: 'Compare two models side by side, stat by stat.',
    keywords: ['diff', 'before after', 'side by side', 'versus', 'regression', 'slider'],
    icon: 'columns-2',
    thumbnail: '/thumbnails/asset-compare.webp',
    features: [
      { icon: 'columns-2', label: 'Compare' },
      { icon: 'gauge', label: 'Stat diff' },
      { icon: 'eye', label: 'Visual' },
    ],
    status: 'available',
    category: 'inspect',
  },
  {
    id: 'asset-report',
    name: 'Asset Report',
    route: '/asset-report',
    description: 'Audit a whole asset library with scores, budgets and CSV export.',
    keywords: ['audit', 'batch', 'summary', 'export csv', 'score', 'budget', 'library', 'pdf'],
    icon: 'file-text',
    thumbnail: '/thumbnails/asset-report.webp',
    features: [
      { icon: 'file-text', label: 'Audit' },
      { icon: 'grid', label: 'Batch' },
      { icon: 'columns-2', label: 'CSV out' },
    ],
    status: 'available',
    category: 'inspect',
  },

  // ---------- Preview & Utilities ----------
  {
    id: 'thumbnail-maker',
    name: 'Thumbnail Maker',
    route: '/thumbnail-maker',
    description: 'Create thumbnails from GLBs and FBXs.',
    keywords: ['preview image', 'render', 'icon', 'snapshot'],
    icon: 'camera',
    features: [
      { icon: 'camera', label: 'Renders' },
      { icon: 'image-down', label: 'PNG out' },
      { icon: 'grid', label: 'Batch' },
    ],
    status: 'available',
    category: 'utilities',
  },
];

export function getToolById(id) {
  return TOOLS.find((tool) => tool.id === id) ?? null;
}

export function getToolByRoute(route) {
  return TOOLS.find((tool) => tool.route === route) ?? null;
}

export function getToolsByCategory(categoryId) {
  return TOOLS.filter((tool) => tool.category === categoryId);
}
