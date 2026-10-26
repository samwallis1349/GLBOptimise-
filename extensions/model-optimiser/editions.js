/**
 * One codebase, several store products. Within one store only one may be
 * listed: the Chrome Web Store (and Edge Add-ons) refuse several extensions
 * with duplicate functionality from the same developer.
 *
 *   reduce-polys       — Chrome Web Store: free Check + Reduce (10 free uses, then 99p).
 *   reduce-polys-edge  — Microsoft Edge Add-ons: the same, 99p through the shared
 *                        product. Keys from its old £3 product still unlock it.
 *   model-optimiser    — all four tools, for later.
 *
 * Separate Chrome listings are fine when each does a different job, so the
 * per-job editions below each own tools no other listing has:
 *
 *   texture-compressor — free texture check, KTX2 compress and resize.
 *   inspector          — free health check, rig, animation and compare.
 *   animation-tools    — free clip list, strip clips, cut keyframes.
 *   converter          — free file info, convert GLB/glTF/OBJ/FBX, split, merge, LODs.
 *   app-assets         — free icon check, app icon sets, Xcode image sets, store screenshots.
 *   image-tools        — free sprite-sheet check, background cutout, line art, iso sprites.
 *
 * `accepts`: 'glb' (the first listings: GLB only) or 'any' (GLB, glTF, FBX,
 * OBJ or a ZIP of one, converted to GLB on the way in). Image tools always
 * take PNG, JPEG or WebP (src/kinds.js).
 * `free` lists the tools that need no licence; `freeRuns` is how many runs
 * of the others anyone gets, in all, before the unlock card (src/quota.js).
 * After that one 99p payment (the shared single-tool product) unlocks every
 * tool in the edition. An edition whose tools are all free ships without the
 * licence-check host permissions. `products` adds Lemon Squeezy products
 * ({ productId: siteToolId }) whose keys also unlock it here.
 */
export const EDITIONS = {
  'reduce-polys': {
    store: 'Chrome Web Store',
    name: 'Reduce Polys – GLB Polygon Reducer by AssetBench',
    shortName: 'Reduce Polys',
    description: 'Cut GLB triangle counts in your browser. Free model check, 10 free reduces, then 99p once. Files stay on your computer.',
    heading: ['Reduce', 'Polys'],
    tools: ['check', 'reduce'],
    free: ['check'],
    freeRuns: 10,
    firstTool: 'reduce',
  },
  'reduce-polys-edge': {
    store: 'Microsoft Edge Add-ons',
    name: 'Reduce Polys – GLB Polygon Reducer by AssetBench',
    shortName: 'Reduce Polys',
    description: 'Cut GLB triangle counts in your browser. Free model check, 10 free reduces, then 99p once. Files never leave your computer.',
    heading: ['Reduce', 'Polys'],
    tools: ['check', 'reduce'],
    free: ['check'],
    freeRuns: 10,
    firstTool: 'reduce',
    // Keys from the old £3 "Reduce Polys (Edge)" product in Lemon Squeezy.
    products: { 1428470: 'reduce-polys' },
  },
  'model-optimiser': {
    store: 'Chrome Web Store',
    name: 'AssetBench Model Optimiser',
    shortName: 'Model Optimiser',
    description: 'Check, reduce, optimise and compress GLB models for games and the web, right in your browser. Files never leave your computer.',
    heading: ['Model', 'Optimiser'],
    tools: ['check', 'reduce', 'optimise', 'compress'],
    free: ['check'],
    freeRuns: 10,
    firstTool: 'check',
  },
  'texture-compressor': {
    store: 'Chrome Web Store',
    name: 'GLB Texture Compressor – KTX2 & Resize by AssetBench',
    shortName: 'Texture Compressor',
    description: 'Shrink the textures in GLB models: free texture check, KTX2 compression and resizing. 10 free, then 99p. Files stay on your PC.',
    heading: ['Texture', 'Compressor'],
    tools: ['textures', 'compress', 'resize'],
    free: ['textures'],
    freeRuns: 10,
    firstTool: 'textures',
    website: '/compress-textures',
  },
  inspector: {
    store: 'Chrome Web Store',
    name: 'GLB Inspector – Rig, Animation & Model Checker by AssetBench',
    shortName: 'GLB Inspector',
    description: 'Inspect GLB models in your browser: free health check, rig and animation checks, and before/after compare. Files stay local.',
    heading: ['GLB', 'Inspector'],
    tools: ['inspect', 'rig', 'animations', 'compare'],
    free: ['inspect'],
    freeRuns: 10,
    firstTool: 'inspect',
    website: '/inspect-glb',
  },
  'animation-tools': {
    store: 'Chrome Web Store',
    name: 'GLB & FBX Animation Tools – Strip & Optimise Clips by AssetBench',
    shortName: 'Animation Tools',
    description: 'List, strip and optimise animation clips in GLB, glTF and FBX models. Free clip list, 10 free runs, then 99p. Nothing uploaded.',
    heading: ['Animation', 'Tools'],
    tools: ['clips', 'strip', 'anim-optimise'],
    free: ['clips'],
    freeRuns: 10,
    firstTool: 'clips',
    accepts: 'any',
    website: '/strip-animations',
  },
  converter: {
    store: 'Chrome Web Store',
    name: '3D Model Converter – FBX, GLB, OBJ & glTF by AssetBench',
    shortName: '3D Converter',
    description: 'Convert FBX, GLB, OBJ and glTF, split models into parts, merge them and make LODs. Free file info, 10 free runs, then 99p.',
    heading: ['3D', 'Converter'],
    tools: ['formats', 'convert', 'split', 'merge', 'lods'],
    free: ['formats'],
    freeRuns: 10,
    firstTool: 'convert',
    accepts: 'any',
    website: '/convert-files',
  },
  'app-assets': {
    store: 'Chrome Web Store',
    name: 'App Icon & Store Asset Maker – iOS & Android by AssetBench',
    shortName: 'App Assets',
    description: 'Make iOS, Android and watchOS app icons, Xcode image sets and store screenshots from one image. 10 free runs, then 99p.',
    heading: ['App', 'Assets'],
    tools: ['icon-check', 'icons', 'xcassets', 'screenshots'],
    free: ['icon-check'],
    freeRuns: 10,
    firstTool: 'icons',
    accepts: 'any',
    website: '/app-icon-generator',
  },
  'image-tools': {
    store: 'Chrome Web Store',
    name: 'Sprite Cutout, Line Art & Iso Sprites by AssetBench',
    shortName: 'Sprite Studio',
    description: 'Remove backgrounds and split sprite sheets, clean line art to PNG + SVG, and turn 3D models into iso sprites. 10 free, then 99p.',
    heading: ['Sprite', 'Studio'],
    tools: ['sheet-check', 'cutout', 'lines', 'iso'],
    free: ['sheet-check'],
    freeRuns: 10,
    firstTool: 'cutout',
    accepts: 'any',
    website: '/alpha-cutout',
  },
};

export const DEFAULT_EDITION = 'reduce-polys';

export const allFree = (edition) => edition.tools.every((t) => edition.free.includes(t));

/** Tools that hand back a file; an edition without any doesn't ask for the downloads permission. */
const SAVING_TOOLS = ['reduce', 'optimise', 'compress', 'resize', 'strip', 'anim-optimise', 'convert', 'split', 'merge', 'lods', 'icons', 'xcassets', 'screenshots', 'cutout', 'lines', 'iso'];
export const savesFiles = (edition) => edition.tools.some((t) => SAVING_TOOLS.includes(t));
