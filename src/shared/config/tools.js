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
 * bento: the tool's place on the /tools bento grid (pages/tools/ToolsPage.js),
 *   which has one section per category. `order` is its position within its
 *   category: 1 takes the big featured panel, 2 and 3 sit beside it, and the
 *   rest follow in even rows.
 *
 * mcp: the assetbench-mcp tools (mcp/index.js) that do this tool's job, if
 *   any. Marks the card with an MCP badge and feeds the /tools MCP filter.
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
  { id: 'build', label: 'Build & Convert', icon: 'tools', accent: '--cat-blue', blurb: 'Convert, split, merge and make sprites, icons and app assets.' },
  { id: 'optimise', label: 'Optimise', icon: 'gauge', accent: '--cat-amber', blurb: 'Smaller, faster models and textures, ready for games and the web.' },
  { id: 'inspect', label: 'Inspect & Preview', icon: 'search', accent: '--cat-pink', blurb: 'Check what is inside a model before you ship it.' },
];

export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}

export const TOOLS = [
  {
    id: 'app-icon-generator',
    name: 'iOS App Icon Generator',
    route: '/app-icon-generator',
    description: 'Craft optimized AI prompts or upload icon → export Xcode AppIcon.appiconset, Android mipmaps, and Game UI sprite sheets.',
    keywords: ['ios', 'app icon', 'icon generator', 'ai prompt', 'prompt crafter', 'midjourney', 'dalle', 'xcode', 'appiconset', 'contents.json', 'android', 'mipmap', 'play store', 'game ui', 'sprite sheet', 'unity', 'godot', 'squircle'],
    icon: 'smartphone',
    thumbnail: '/thumbnails/app-icon-generator.webp',
    seo: {
      title: 'App Icon Generator — iOS, Android & Game UI Icons | Asset Bench',
      description:
        'Make an app icon from your artwork or a built-in sample, or write an AI image prompt for Midjourney, DALL-E or Flux. Export an Xcode AppIcon.appiconset, Android mipmaps and game UI sprite sheets.',
    },
    cardTheme: 'blue',
    features: [
      { icon: 'wand-2', label: 'AI Prompt Crafter' },
      { icon: 'smartphone', label: 'Xcode & Android' },
      { icon: 'grid', label: 'Game UI & Sprites' },
    ],
    status: 'available',
    category: 'build',
    bento: { order: 10 },
    mcp: ['make_app_assets'],
  },
  {
    id: 'app-store-screenshot-generator',
    name: 'App Store Screenshot Generator',
    route: '/app-store-screenshot-generator',
    description: 'Transform device captures into App Store Connect ready screenshots with titanium iPhone frames, gradients, and marketing copy.',
    keywords: ['ios', 'app store', 'screenshots', 'screenshot generator', 'iphone 16', 'app store connect', 'mockup', 'marketing copy', 'retina'],
    icon: 'smartphone',
    thumbnail: '/thumbnails/app-store-screenshot-generator.webp',
    seo: {
      title: 'App Store Screenshot Generator — iPhone Frames, 6.9" | Asset Bench',
      description:
        'Turn app screenshots into App Store marketing slides: iPhone 16 Pro frames, gradient backgrounds and headlines. Export 6.9" (1320×2868) and 6.5" PNGs, up to 5 slides as a ZIP.',
    },
    cardTheme: 'blue',
    features: [
      { icon: 'smartphone', label: 'iPhone Mockups' },
      { icon: 'camera', label: 'Marketing Slides' },
      { icon: 'layers', label: 'Multi-Display ZIP' },
    ],
    status: 'available',
    category: 'build',
    bento: { order: 11 },
    mcp: ['make_store_screenshots'],
  },
  {
    id: 'xcassets-generator',
    name: 'XCAssets Generator',
    route: '/xcassets-generator',
    description: 'Convert SVGs and PNGs into Xcode Assets.xcassets catalogs with @1x, @2x, @3x retina slicing, Dark Mode pairs, and Contents.json.',
    keywords: ['ios', 'xcassets', 'xcode', 'asset catalog', 'contents.json', 'retina', '1x 2x 3x', 'dark mode', 'swiftui', 'uikit'],
    icon: 'package-open',
    thumbnail: '/thumbnails/xcassets-generator.webp',
    seo: {
      title: 'Xcode Asset Catalog Generator — @1x @2x @3x | Asset Bench',
      description:
        'Turn SVGs and PNGs into an Xcode Assets.xcassets catalog with @1x, @2x and @3x slices, Dark Mode pairs and Contents.json. Download as a ZIP with SwiftUI and UIKit snippets.',
    },
    cardTheme: 'blue',
    features: [
      { icon: 'package-open', label: 'Xcode Catalog' },
      { icon: 'layers', label: 'Retina 1x · 2x · 3x' },
      { icon: 'file-text', label: 'Contents.json' },
    ],
    status: 'available',
    category: 'build',
    bento: { order: 12 },
  },
  {
    id: 'alpha-cutout',
    name: 'Alpha Cutout',
    route: '/alpha-cutout',
    description: 'Cut sprite sheets, remove backgrounds and export clean transparent frames.',
    keywords: ['sprites', 'alpha', 'cutout', 'background remover', 'sprite sheet cutter', 'trim'],
    icon: 'image-down',
    thumbnail: '/thumbnails/alpha-cutout.webp',
    seo: {
      title: 'Remove Background & Split Sprite Sheets — PNG | Asset Bench',
      description:
        'Remove a solid or gradient background from sprites, icons and effects, clean up the edges, and split a sprite sheet into separate transparent PNG frames. Runs in your browser.',
    },
    features: [
      { icon: 'scan', label: 'Auto detect' },
      { icon: 'grid', label: 'Sprite sheets' },
      { icon: 'image-down', label: 'PNG + JSON' },
    ],
    status: 'available',
    category: 'build',
    bento: { order: 5 },
  },
  {
    id: 'line-studio',
    name: 'Line Studio',
    route: '/line-studio',
    description: 'Cleans up fine line art, like colouring book pages. Rough lines in, smooth lines out.',
    keywords: ['colouring', 'line art', 'smooth lines', 'colouring pages', 'rough to smooth', 'line weight', 'join breaks', 'remove white', 'svg', 'trace', 'vectorise', 'colouring book'],
    icon: 'image-down',
    thumbnail: '/thumbnails/line-studio.webp',
    banner: '/thumbnails/line-studio-wide.webp',
    seo: {
      title: 'Line Art Cleaner — Colouring Pages to PNG & SVG | Asset Bench',
      description:
        'Clean up line art and colouring book pages: smooth rough lines to an even weight, join small gaps, remove the white background and export a transparent PNG or traced SVG.',
    },
    features: [
      { icon: 'wand-2', label: 'Smooth lines' },
      { icon: 'activity', label: 'Line weight' },
      { icon: 'image-down', label: 'PNG + SVG' },
    ],
    status: 'available',
    category: 'build',
    bento: { order: 1 },
  },
  {
    id: 'model-to-iso-sprites',
    fbxInput: true,
    name: 'Model to Iso Sprites',
    route: '/model-to-iso-sprites',
    description: 'Turn a 3D model into a finished isometric sprite set: fixed camera and scale, 8, 4 or 1 directions, animation frames, sheet + JSON.',
    keywords: ['isometric', 'iso sprites', 'sprite sheet', '2:1', 'eight directions', 'animation frames', 'pixel art', 'base point', 'pivot', 'atlas json', 'glb to sprites', 'fbx to sprites'],
    icon: 'grid',
    thumbnail: '/thumbnails/model-to-iso-sprites.webp',
    seo: {
      title: 'Model to Iso Sprites — GLB/FBX to 2:1 Isometric Sprite Sheet + JSON | Asset Bench',
      description:
        'Render a GLB or FBX model as a finished 2:1 isometric sprite set: one camera and scale for every asset, a fixed base point, 8/4/1 directions, loop-safe animation frames, outline and pixel-art styles, and a sprite sheet with JSON. Runs in your browser.',
    },
    features: [
      { icon: 'camera', label: '8 views' },
      { icon: 'play-circle', label: 'Clips' },
      { icon: 'grid', label: 'Sheet + JSON' },
    ],
    status: 'beta',
    category: 'build',
    bento: { order: 7 },
  },
  {
    id: 'model-to-isometric',
    name: 'Model to Isometric',
    route: '/model-to-isometric',
    description: 'Turn a 3D model into eight consistent isometric sprites.',
    keywords: ['isometric', 'sprite sheet', 'eight directions', 'orthographic'],
    icon: 'camera',
    thumbnail: '/thumbnails/model-to-isometric.webp',
    seo: {
      title: '3D Model to Isometric Sprites — 8 Directions | Asset Bench',
      description:
        'Render a GLB or FBX model as eight consistent isometric sprites, with animation frames per direction, lighting and transparent backgrounds. Download PNGs or a sprite sheet ZIP.',
    },
    features: [
      { icon: 'camera', label: '8 views' },
      { icon: 'image-down', label: 'PNG + ZIP' },
      { icon: 'grid', label: 'Sprite sheet' },
    ],
    status: 'available',
    category: 'build',
    bento: { order: 6 },
  },
  {
    id: 'iso-scene-builder',
    name: 'Iso Scene Builder',
    route: '/iso-scene-builder',
    description: 'Keep a bank of isometric PNG objects, drag them onto a 2:1 grid and export the scene.',
    keywords: ['isometric', 'iso', 'scene', 'level', 'map', 'tiles', 'tilemap', 'drag and drop', 'layout', 'sprites', 'diorama', '2.5d'],
    icon: 'layers',
    seo: {
      title: 'Isometric Scene Builder — Drag & Drop Iso Objects | Asset Bench',
      description:
        'Build isometric scenes from your own PNG objects: a saved object bank, a 2:1 snapping grid, depth sorting, flip, scale and layers. Export a PNG, layout JSON or scene ZIP. Nothing is uploaded.',
    },
    features: [
      { icon: 'layers', label: 'Object bank' },
      { icon: 'grid', label: 'Snap to grid' },
      { icon: 'image-down', label: 'PNG + JSON' },
    ],
    status: 'beta',
    category: 'build',
    bento: { order: 9 },
  },
  // ---------- Optimise (geometry, textures, animation) ----------
  {
    id: 'optimise-glb',
    fbxInput: true,
    fbxOutput: true,
    name: 'Optimise GLB',
    route: '/optimise-glb',
    description: 'Reduce model size while preserving important content.',
    keywords: ['compress', 'shrink', 'draco', 'meshopt', 'file size', 'fbx'],
    icon: 'package-open',
    thumbnail: '/thumbnails/optimise-glb.webp',
    seo: {
      title: 'Compress GLB & FBX Online — Draco, Meshopt, Textures | Asset Bench',
      description:
        'Compress GLB and glTF files in your browser: Draco or Meshopt geometry compression, texture downscaling and cleanup in one pass, with a before-and-after preview. Nothing is uploaded. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'shrink', label: 'Smaller' },
      { icon: 'shield', label: 'Quality' },
      { icon: 'zap', label: 'Fast' },
    ],
    status: 'available',
    category: 'optimise',
    bento: { order: 1 },
    mcp: ['optimize_model'],
  },
  {
    id: 'asset-pipeline',
    fbxInput: true,
    name: 'Asset Pipeline',
    route: '/asset-pipeline',
    description: 'Batch-optimise a whole folder of GLB / glTF: geometry, textures, LODs, validation and one ZIP out.',
    keywords: ['batch', 'pipeline', 'folder', 'bulk', 'automate', 'optimise', 'lod', 'ktx2', 'texture compression', 'polygon reduction', 'unity', 'unreal', 'godot', 'three.js', 'mobile', 'vr', 'zip', 'manifest', 'report', 'fbx'],
    icon: 'layers',
    thumbnail: '/thumbnails/asset-pipeline.webp',
    // Wide art for the full-width headline card (2.5:1).
    banner: '/thumbnails/asset-pipeline-wide.webp',
    seo: {
      title: 'Batch GLB & FBX Optimiser — LODs, KTX2, Validation | Asset Bench',
      description:
        'Optimise a whole folder of GLB and glTF models at once: polygon reduction, texture resizing, KTX2 or WebP compression, LOD chains, budgets and validation, with one ZIP out. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'layers', label: 'Whole folders' },
      { icon: 'shield', label: 'Validated' },
      { icon: 'package-open', label: 'One ZIP' },
    ],
    status: 'available',
    category: 'optimise',
    bento: { order: 2 },
    mcp: ['make_game_ready'],
  },
  {
    id: 'reduce-polys',
    fbxInput: true,
    fbxOutput: true,
    name: 'Reduce Polys',
    route: '/reduce-polys',
    description: 'Reduce geometry for realtime use.',
    keywords: ['decimate', 'simplify', 'triangles', 'polygons', 'lod', 'mesh', 'fbx'],
    icon: 'shrink',
    thumbnail: '/thumbnails/reduce-polys.webp',
    seo: {
      title: 'Reduce Polygon Count of GLB & FBX Models Online | Asset Bench',
      description:
        'Lower the triangle count of GLB and glTF models while keeping UVs, normals and material edges intact. Presets or a custom target, wireframe preview, and nothing is uploaded. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'shrink', label: 'Low tris' },
      { icon: 'shield', label: 'Keep form' },
      { icon: 'gamepad', label: 'Game ready' },
    ],
    status: 'available',
    category: 'optimise',
    bento: { order: 3 },
    mcp: ['reduce_model'],
  },
  {
    id: 'compress-textures',
    fbxInput: true,
    name: 'Compress Textures',
    route: '/compress-textures',
    description: 'Resize and compress model textures.',
    keywords: ['ktx2', 'basis', 'jpeg', 'png', 'webp', 'image', 'resolution', 'fbx'],
    icon: 'image-down',
    thumbnail: '/thumbnails/compress-textures.webp',
    seo: {
      title: 'Compress GLB & FBX Textures — KTX2, WebP, AVIF | Asset Bench',
      description:
        'Resize and re-encode the textures inside GLB and glTF models: 4K to 256, as KTX2 (ETC1S/UASTC), WebP, AVIF, JPEG or PNG. The quickest way to shrink a model, all in your browser. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'image-down', label: 'Smaller' },
      { icon: 'shield', label: 'Detail' },
      { icon: 'zap', label: 'Fast' },
    ],
    status: 'available',
    category: 'optimise',
    bento: { order: 4 },
    mcp: ['compress_textures'],
  },
  {
    id: 'ktx2-texture-encoder',
    name: 'KTX2 Texture Encoder',
    route: '/ktx2-texture-encoder',
    description: 'Convert PNG, JPEG and WebP textures, or the textures inside a GLB, to GPU-compressed KTX2 for phones, VR and the web.',
    keywords: ['ktx2', 'basis', 'basis universal', 'gpu memory', 'vram', 'texture compression', 'mobile', 'phone', 'vr', 'quest', 'glb', 'png', 'jpg', 'webp', 'uastc', 'etc1s'],
    icon: 'shrink',
    thumbnail: '/thumbnails/ktx2-texture-encoder.webp',
    banner: '/thumbnails/ktx2-texture-encoder-wide.webp',
    seo: {
      title: 'PNG to KTX2 Converter — Basis ETC1S & UASTC, No Upload | Asset Bench',
      description:
        'Convert PNG, JPEG and WebP images to KTX2 (Basis Universal ETC1S or UASTC) with mipmaps, or compress the textures inside a GLB. Batch files, download as ZIP. Runs in your browser.',
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
    bento: { order: 5 },
    mcp: ['compress_textures'],
  },
  {
    id: 'generate-lods',
    fbxInput: true,
    fbxOutput: true,
    name: 'Generate LODs',
    route: '/generate-lods',
    description: 'Create multiple Levels of Detail.',
    keywords: ['lod', 'detail', 'distance', 'performance', 'mesh', 'fbx'],
    icon: 'layers',
    thumbnail: '/thumbnails/generate-lods.webp',
    seo: {
      title: 'Generate LODs for GLB & FBX Models Online | Asset Bench',
      description:
        'Create LOD0–LOD3 levels of detail from one GLB or glTF model for Unity, Unreal and Three.js. Preview each level, then download one or all as a ZIP. Runs in your browser. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'layers', label: 'Multi-LOD' },
      { icon: 'gauge', label: 'Faster' },
      { icon: 'gamepad', label: 'Game ready' },
    ],
    status: 'available',
    category: 'optimise',
    bento: { order: 6 },
    mcp: ['generate_lods'],
  },

  {
    id: 'strip-animations',
    fbxInput: true,
    fbxOutput: true,
    name: 'Strip Animations',
    route: '/strip-animations',
    description: 'Inspect and remove unwanted animation clips.',
    keywords: ['clips', 'clean up', 'delete animation', 'rig', 'keyframes', 'fbx'],
    icon: 'film-off',
    thumbnail: '/thumbnails/strip-animations.webp',
    seo: {
      title: 'Remove Animations from GLB & FBX — Delete Clips | Asset Bench',
      description:
        'See every animation clip in a GLB or glTF, remove the ones you don’t need, and spot empty or duplicate clips. Download a smaller model with only the animations you keep. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'film-off', label: 'Cut clips' },
      { icon: 'shrink', label: 'Smaller' },
      { icon: 'gamepad', label: 'Game ready' },
    ],
    status: 'available',
    category: 'optimise',
    bento: { order: 7 },
  },
  {
    id: 'animation-optimiser',
    fbxInput: true,
    fbxOutput: true,
    name: 'Animation Optimiser',
    route: '/animation-optimiser',
    description: 'Reduce keyframes and optimise animation data.',
    keywords: ['keyframes', 'curve', 'compress animation', 'clips', 'fbx'],
    icon: 'activity',
    thumbnail: '/thumbnails/animation-optimiser.webp',
    seo: {
      title: 'GLB & FBX Animation Optimiser — Reduce Keyframes | Asset Bench',
      description:
        'Shrink GLB and glTF animation data by removing redundant keyframes, with a lossless mode and stronger presets. Compare before and after, and see how much each clip saves. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'shrink', label: 'Fewer keys' },
      { icon: 'shield', label: 'Motion' },
      { icon: 'gamepad', label: 'Game ready' },
    ],
    status: 'available',
    category: 'optimise',
    bento: { order: 8 },
  },

  {
    id: 'pack-pbr',
    name: 'Pack PBR',
    route: '/pack-pbr',
    description: 'Pack PBR maps into one channel-packed texture, or generate a full PBR set from a single image.',
    keywords: ['metalness', 'roughness', 'ao', 'orm', 'channel packing'],
    icon: 'layers-3',
    thumbnail: '/thumbnails/pack-pbr.webp',
    seo: {
      title: 'ORM Texture Packer & Image to PBR Maps | Asset Bench',
      description:
        'Pack ambient occlusion, roughness and metallic maps into one ORM texture (or a Unity HDRP mask), or generate a full PBR map set from a single surface image. Runs in your browser.',
    },
    features: [
      { icon: 'layers-3', label: 'ORM pack' },
      { icon: 'image-down', label: 'Fewer maps' },
      { icon: 'gauge', label: 'Faster' },
    ],
    status: 'available',
    category: 'optimise',
    bento: { order: 9 },
  },
  {
    id: 'texture-resizer',
    name: 'Texture Resizer',
    route: '/texture-resizer',
    description: 'Resize textures to 4K / 2K / 1K or a custom size.',
    keywords: ['downscale', 'resolution', 'image'],
    icon: 'maximize-2',
    thumbnail: '/thumbnails/texture-resizer.webp',
    seo: {
      title: 'Batch Texture Resizer — 4K, 2K, 1K to WebP/PNG | Asset Bench',
      description:
        'Resize up to 40 PNG, JPEG or WebP textures at once to 4K, 2K, 1K, 512 or a custom size, and save as WebP, PNG or JPEG. Power-of-two presets for games. Runs in your browser.',
    },
    features: [
      { icon: 'maximize-2', label: 'Smaller' },
      { icon: 'shield', label: 'Detail' },
      { icon: 'zap', label: 'Fast' },
    ],
    status: 'available',
    category: 'optimise',
    bento: { order: 10 },
    mcp: ['resize_texture'],
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
    seo: {
      title: '3D Model Converter — FBX, OBJ, STL to GLB Online | Asset Bench',
      description:
        'Convert 3D models between 24 input and 14 output formats, including FBX to GLB, OBJ to GLB, DAE, STL, PLY and 3MF. Runs in your browser, so your files are never uploaded.',
    },
    features: [
      { icon: 'refresh-cw', label: 'Formats' },
      { icon: 'package-open', label: 'GLB out' },
      { icon: 'zap', label: 'Fast' },
    ],
    status: 'available',
    category: 'build',
    bento: { order: 2 },
    mcp: ['convert_model'],
  },
  {
    id: 'glb-builder',
    name: 'GLB Builder & Merger',
    route: '/glb-builder',
    description: 'Arrange GLB, glTF and FBX assets on a ground plane and export one merged scene.',
    keywords: ['arranger', 'arrange', 'combine', 'join', 'assemble', 'scene build', 'layout', 'place', 'level', 'merge'],
    icon: 'package-plus',
    thumbnail: '/thumbnails/glb-builder.webp',
    seo: {
      title: 'Merge GLB Files Online — Combine Models Into One | Asset Bench',
      description:
        'Place GLB, glTF and FBX models on a ground plane, move, rotate and scale them, and export one merged GLB scene. No Blender needed, and nothing is uploaded.',
    },
    // Double-width artwork for the featured slot on the All Tools page.
    banner: '/thumbnails/glb-builder-wide.webp',
    features: [
      { icon: 'package-plus', label: 'Arrange' },
      { icon: 'git-merge', label: 'Merge' },
      { icon: 'grid', label: 'One scene' },
    ],
    status: 'available',
    category: 'build',
    bento: { order: 4 },
  },
  {
    id: 'model-splitter',
    name: 'Model Splitter',
    route: '/model-splitter',
    description: 'Split a model into loose parts, materials or objects and export each as its own GLB.',
    keywords: ['loose parts', 'by material', 'separate', 'break apart', 'export objects', 'part splitter', 'explode', 'fbx', 'obj', 'gltf'],
    icon: 'git-branch',
    thumbnail: '/thumbnails/model-splitter.webp',
    seo: {
      title: 'Split a 3D Model Into Parts — GLB, FBX, OBJ | Asset Bench',
      description:
        'Split a GLB, glTF, FBX or OBJ model by loose parts, materials or objects, set each part’s pivot, and export them as separate GLB or glTF files. Keeps rigs and animations.',
    },
    features: [
      { icon: 'git-branch', label: 'Split' },
      { icon: 'package-open', label: 'Per part' },
      { icon: 'bone', label: 'Keeps rigs' },
    ],
    status: 'available',
    category: 'build',
    bento: { order: 3 },
  },

  // ---------- Inspect & Preview ----------
  {
    id: 'inspect-glb',
    fbxInput: true,
    name: 'Inspect GLB',
    route: '/inspect-glb',
    description: 'Explore every mesh, material, texture and byte in a GLB.',
    keywords: ['inspect', 'debug', 'structure', 'validate', 'json', 'scene graph', 'hierarchy', 'wireframe', 'uv', 'check', 'fbx'],
    icon: 'search',
    thumbnail: '/thumbnails/inspect-glb.webp',
    seo: {
      title: 'GLB & FBX Viewer & Inspector — What Makes It Big | Asset Bench',
      description:
        'Open a GLB or glTF and explore its scene tree, meshes, materials, textures, animations and size breakdown. Check Draco, Meshopt and KTX2 extensions. In your browser, no upload. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'search', label: 'Structure' },
      { icon: 'file-text', label: 'Report' },
      { icon: 'shield', label: 'Validate' },
    ],
    status: 'available',
    category: 'inspect',
    bento: { order: 2 },
  },
  {
    id: 'mobile-ready-checker',
    fbxInput: true,
    name: 'Mobile Ready Checker',
    route: '/mobile-ready-checker',
    description: 'Check whether your GLB is phone-ready, and see which tool fixes each problem.',
    keywords: ['mobile', 'phone', 'performance', 'budget', 'vr', 'quest', 'draw calls', 'triangles', 'texture memory', 'check', 'game ready', 'fbx'],
    icon: 'smartphone',
    thumbnail: '/thumbnails/mobile-ready-checker.webp',
    banner: '/thumbnails/mobile-ready-checker-wide.webp',
    seo: {
      title: 'Mobile Ready Checker — GLB & FBX Poly Budgets | Asset Bench',
      description:
        'Check a GLB against budgets for mobile games, standalone VR and web 3D viewers: triangles, texture memory and draw calls, with a score and a link to the tool that fixes each problem. Takes FBX too, converted to GLB in your browser.',
    },
    cardTheme: 'blue',
    features: [
      { icon: 'smartphone', label: 'Phone & VR' },
      { icon: 'gauge', label: 'Budgets' },
      { icon: 'wand-2', label: 'Fix links' },
    ],
    status: 'available',
    category: 'inspect',
    bento: { order: 1 },
    mcp: ['check_model'],
  },
  {
    id: 'asset-compare',
    fbxInput: true,
    name: 'Asset Compare',
    route: '/asset-compare',
    description: 'Compare two models side by side, stat by stat.',
    keywords: ['diff', 'before after', 'side by side', 'versus', 'regression', 'slider', 'fbx'],
    icon: 'columns-2',
    thumbnail: '/thumbnails/asset-compare.webp',
    seo: {
      title: 'Compare Two GLB or FBX Models — Side by Side | Asset Bench',
      description:
        'Compare two 3D models side by side or with a slider, with a stat-by-stat diff of triangles, textures, materials and animations. Check an optimised model against the original. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'columns-2', label: 'Compare' },
      { icon: 'gauge', label: 'Stat diff' },
      { icon: 'eye', label: 'Visual' },
    ],
    status: 'available',
    category: 'inspect',
    bento: { order: 5 },
  },
  {
    id: 'asset-report',
    fbxInput: true,
    name: 'Asset Report',
    route: '/asset-report',
    description: 'Audit a whole asset library with scores, budgets and CSV export.',
    keywords: ['audit', 'batch', 'summary', 'export csv', 'score', 'budget', 'library', 'pdf', 'fbx'],
    icon: 'file-text',
    thumbnail: '/thumbnails/asset-report.webp',
    seo: {
      title: '3D Asset Library Audit — Batch GLB & FBX Report | Asset Bench',
      description:
        'Audit a whole folder of GLB and glTF models: scores, platform budgets, errors and thumbnails for every asset. Export the report as CSV or JSON, or print it as a PDF. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'file-text', label: 'Audit' },
      { icon: 'grid', label: 'Batch' },
      { icon: 'columns-2', label: 'CSV out' },
    ],
    status: 'available',
    category: 'inspect',
    bento: { order: 3 },
  },

  {
    id: 'rig-inspector',
    fbxInput: true,
    name: 'Rig Inspector',
    route: '/rig-inspector',
    description: 'Inspect bones, weights and skinning.',
    keywords: ['skeleton', 'joints', 'weights', 'skin', 'rigging', 'fbx'],
    icon: 'bone',
    thumbnail: '/thumbnails/rig-inspector.webp',
    seo: {
      title: 'Rig Inspector — Check GLB & FBX Bones, Skin Weights | Asset Bench',
      description:
        'Inspect the skeleton of a GLB or glTF: bone hierarchy, joint weights and skinning. Finds unweighted and misnormalised vertices and duplicate joint names before you ship. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'bone', label: 'Joints' },
      { icon: 'search', label: 'Weights' },
      { icon: 'shield', label: 'Validate' },
    ],
    status: 'available',
    category: 'inspect',
    bento: { order: 6 },
  },
  {
    id: 'animation-inspector',
    fbxInput: true,
    name: 'Animation Inspector',
    route: '/animation-inspector',
    description: 'View and analyse animation clips.',
    keywords: ['clips', 'preview', 'playback', 'timeline', 'fbx'],
    icon: 'play-circle',
    thumbnail: '/thumbnails/animation-inspector.webp',
    seo: {
      title: 'GLB & FBX Animation Viewer — Clips, Curves & Loops | Asset Bench',
      description:
        'Play and scrub the animation clips in a GLB or glTF, view each node’s curves, and check whether clips loop cleanly. Flags empty tracks and other common animation issues. Takes FBX too, converted to GLB in your browser.',
    },
    features: [
      { icon: 'play-circle', label: 'Preview' },
      { icon: 'activity', label: 'Curves' },
      { icon: 'search', label: 'Issues' },
    ],
    status: 'available',
    category: 'inspect',
    bento: { order: 7 },
  },
  {
    id: 'character-workshop',
    fbxInput: true,
    name: 'Character Workshop',
    route: '/character-workshop',
    description: 'Import a GLB or FBX character, preview and check its animations and rig, then export a game-ready GLB.',
    keywords: ['character', 'fbx to glb', 'mixamo', 'rig', 'skeleton', 'animation', 'idle', 'walk', 'run', 'three.js', 'isometric', 'npc', 'agent', 'fbx'],
    icon: 'bone',
    thumbnail: '/thumbnails/character-workshop.webp',
    banner: '/thumbnails/character-workshop-wide.webp',
    seo: {
      title: 'Character Workshop — Preview & Export GLB, FBX Characters | Asset Bench',
      description:
        'Import a GLB, glTF or FBX character, play and scrub its animation clips, check the rig, materials and scale, then export a GLB with the clips you choose. Runs in your browser.',
    },
    features: [
      { icon: 'bone', label: 'Rig check' },
      { icon: 'play-circle', label: 'Clips' },
      { icon: 'package-open', label: 'GLB out' },
    ],
    status: 'beta',
    category: 'build',
    bento: { order: 8 },
  },
  {
    id: 'thumbnail-maker',
    name: 'Thumbnail Maker',
    route: '/thumbnail-maker',
    description: 'Render thumbnails, sprite sheets and catalogues from GLB, glTF and FBX models.',
    keywords: ['preview image', 'render', 'icon', 'snapshot'],
    icon: 'camera',
    thumbnail: '/thumbnails/thumbnail-maker.webp',
    seo: {
      title: '3D Model Thumbnail Generator — GLB & FBX to PNG | Asset Bench',
      description:
        'Render thumbnails for a batch of GLB, glTF and FBX models, then download them as PNGs, a sprite sheet or a printable asset catalogue. Runs in your browser.',
    },
    features: [
      { icon: 'camera', label: 'Renders' },
      { icon: 'image-down', label: 'PNG out' },
      { icon: 'grid', label: 'Batch' },
    ],
    status: 'available',
    // Free for everyone: no paywall or 99p offer, and a "Free tool" ribbon on its card.
    free: true,
    category: 'inspect',
    bento: { order: 4 },
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

/**
 * The order the homepage and /tools grids always show first (23 Oct 2026, the
 * user's list): these keep their places whatever the usage counts say, and the
 * first one gets the full-width headline card. Every other tool follows by usage.
 */
export const PINNED_ORDER = [
  'mobile-ready-checker',
  'line-studio',
  'glb-builder',
  'ktx2-texture-encoder',
  'convert-files',
  'thumbnail-maker',
  'alpha-cutout',
  'generate-lods',
  'model-to-isometric',
  'asset-report',
  'model-splitter',
  'inspect-glb',
];

/**
 * Starting order for tool grids, used before any usage counts arrive and to
 * break ties between tools with the same count. Grids are ranked purely by
 * site-wide usage (services/UsageService.js), and the most-used tool gets
 * the full-width headline card, so this only decides the order on a first
 * visit and between equals.
 */
export const POPULARITY_ORDER = [
  // The pinned tools first, then site-wide open counts as of 2026-10-13.
  ...PINNED_ORDER,
  'model-to-iso-sprites',
  'iso-scene-builder',
  'optimise-glb',
  'reduce-polys',
  'strip-animations',
  'animation-optimiser',
  'animation-inspector',
  'compress-textures',
  'rig-inspector',
  'asset-compare',
  'pack-pbr',
  'texture-resizer',
  'app-icon-generator',
  'app-store-screenshot-generator',
  'xcassets-generator',
  'asset-pipeline',
  'character-workshop',
];

/** The /tools bento grid's MCP banner sits after this category's section. */
export const BENTO_BANNER_AFTER = 'build';

/** A category's tools in their /tools bento order; a tool without `bento` goes last. */
export function getBentoTools(categoryId) {
  const order = (tool) => tool.bento?.order ?? Infinity;
  return getToolsByCategory(categoryId).sort((a, b) => order(a) - order(b));
}

export function getOrderedTools() {
  const rank = (tool) => {
    const i = POPULARITY_ORDER.indexOf(tool.id);
    return (tool.status === 'coming-soon' ? 1000 : 0) + (i === -1 ? POPULARITY_ORDER.length : i);
  };
  return [...TOOLS].sort((a, b) => rank(a) - rank(b));
}


/**
 * Tool groups for the /2d-games page, in display order. A tool can sit in
 * more than one group; ids missing from TOOLS are skipped.
 */
export const GAME_2D_GROUPS = [
  {
    id: 'isometric',
    label: 'Isometric game assets',
    description: 'Turn 3D models into matching 2:1 iso sprite sets, eight directions and animated, then lay them out on an isometric grid.',
    tools: ['model-to-iso-sprites', 'model-to-isometric', 'iso-scene-builder'],
  },
  {
    id: '2d',
    label: '2D game tools',
    description: 'Sprite sheets, transparent frames, clean line art and UI icons.',
    tools: ['alpha-cutout', 'line-studio', 'app-icon-generator'],
  },
];
