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
  // Build & Convert leads so the featured Asset Arranger is the homepage's first card.
  { id: 'build', label: 'Build & Convert', icon: 'tools', accent: '--cat-blue' },
  { id: 'optimise', label: 'Optimise', icon: 'gauge', accent: '--cat-amber' },
  { id: 'inspect', label: 'Inspect & Preview', icon: 'search', accent: '--cat-pink' },
];

export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}

export const TOOLS = [
  {
    id: 'alpha-cutout',
    name: 'Alpha Cutout',
    route: '/alpha-cutout',
    description: 'Cut sprite sheets, remove backgrounds and export clean transparent frames.',
    keywords: ['sprites', 'alpha', 'cutout', 'background remover', 'sprite sheet cutter', 'trim'],
    icon: 'image-down',
    thumbnail: '/thumbnails/alpha-cutout.webp',
    features: [
      { icon: 'scan', label: 'Auto detect' },
      { icon: 'grid', label: 'Sprite sheets' },
      { icon: 'image-down', label: 'PNG + JSON' },
    ],
    status: 'available',
    category: 'build',
  },
  {
    id: 'line-studio',
    name: 'Line Studio',
    route: '/line-studio',
    description: 'Cleans up fine line art, like colouring book pages. Rough lines in, smooth lines out.',
    keywords: ['colouring', 'line art', 'smooth lines', 'colouring pages', 'rough to smooth', 'line weight', 'join breaks', 'remove white', 'svg', 'trace', 'vectorise', 'colouring book'],
    icon: 'image-down',
    thumbnail: '/thumbnails/line-studio.webp',
    seo: {
      title: 'Line Studio — Free Colouring Page & Line Art Cleaner | Asset Bench',
      description:
        'Clean up fine line art and colouring book pages free in your browser. Turn rough, broken lines smooth at an even line weight, join gaps, remove the white background and export a transparent PNG or SVG.',
    },
    // Card-only re-tint: this card swaps the site's gold for blue.
    cardTheme: 'blue',
    features: [
      { icon: 'wand-2', label: 'Smooth lines' },
      { icon: 'activity', label: 'Line weight' },
      { icon: 'image-down', label: 'PNG + SVG' },
    ],
    status: 'available',
    category: 'build',
  },
  {
    id: 'model-to-isometric',
    name: 'Model to Isometric',
    route: '/model-to-isometric',
    description: 'Turn a 3D model into eight consistent isometric sprites.',
    keywords: ['isometric', 'sprite sheet', 'eight directions', 'orthographic'],
    icon: 'camera',
    thumbnail: '/thumbnails/model-to-isometric.webp',
    features: [
      { icon: 'camera', label: '8 views' },
      { icon: 'image-down', label: 'PNG + ZIP' },
      { icon: 'grid', label: 'Sprite sheet' },
    ],
    status: 'available',
    category: 'build',
  },
  // ---------- Optimise (geometry, textures, animation) ----------
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
    id: 'ktx2-texture-encoder',
    name: 'KTX2 Texture Encoder',
    route: '/ktx2-texture-encoder',
    description: 'KTX2 Texture Encoder fixes heavy game textures that crash or slow mobiles. It shrinks graphics memory up to 80%, free, right in your browser.',
    keywords: ['ktx2', 'basis', 'basis universal', 'gpu memory', 'vram', 'texture compression', 'mobile', 'phone', 'vr', 'quest', 'glb', 'png', 'jpg', 'webp', 'uastc', 'etc1s'],
    icon: 'shrink',
    thumbnail: '/thumbnails/ktx2-texture-encoder.webp',
    seo: {
      title: 'KTX2 Texture Encoder — Free Online KTX2 / Basis Converter | Asset Bench',
      description:
        'KTX2 Texture Encoder fixes heavy game textures that crash or slow mobiles. It shrinks graphics memory up to 80%, free, right in your browser.',
    },
    // Card-only re-tint: this card swaps the site's gold for silver.
    cardTheme: 'silver',
    features: [
      { icon: 'shrink', label: 'GPU memory' },
      { icon: 'smartphone', label: 'Phone & VR' },
      { icon: 'package-open', label: 'GLB + images' },
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
    category: 'optimise',
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
    category: 'optimise',
  },

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
    category: 'optimise',
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
    category: 'optimise',
  },

  // ---------- Build & Convert ----------
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
    description: 'Split a model into loose parts, materials or objects and export each as its own GLB.',
    keywords: ['loose parts', 'by material', 'separate', 'break apart', 'export objects', 'part splitter', 'explode', 'fbx', 'obj', 'gltf'],
    icon: 'git-branch',
    thumbnail: '/thumbnails/model-splitter.webp',
    features: [
      { icon: 'git-branch', label: 'Split' },
      { icon: 'package-open', label: 'Per part' },
      { icon: 'bone', label: 'Keeps rigs' },
    ],
    status: 'available',
    category: 'build',
  },

  // ---------- Inspect & Preview ----------
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
    id: 'mobile-ready-checker',
    name: 'Mobile Ready Checker',
    route: '/mobile-ready-checker',
    description: 'Check whether your GLB is phone-ready, and see which tool fixes each problem.',
    keywords: ['mobile', 'phone', 'performance', 'budget', 'vr', 'quest', 'draw calls', 'triangles', 'texture memory', 'check', 'game ready'],
    icon: 'smartphone',
    thumbnail: '/thumbnails/mobile-ready-checker.webp',
    features: [
      { icon: 'smartphone', label: 'Phone & VR' },
      { icon: 'gauge', label: 'Budgets' },
      { icon: 'wand-2', label: 'Fix links' },
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
    category: 'inspect',
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
    category: 'inspect',
  },
  {
    id: 'thumbnail-maker',
    name: 'Thumbnail Maker',
    route: '/thumbnail-maker',
    description: 'Create thumbnails from GLBs and FBXs.',
    keywords: ['preview image', 'render', 'icon', 'snapshot'],
    icon: 'camera',
    thumbnail: '/thumbnails/thumbnail-maker.webp',
    features: [
      { icon: 'camera', label: 'Renders' },
      { icon: 'image-down', label: 'PNG out' },
      { icon: 'grid', label: 'Batch' },
    ],
    status: 'available',
    category: 'inspect',
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
