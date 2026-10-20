/**
 * One codebase, several store products. Within one store only one may be
 * listed: the Chrome Web Store (and Edge Add-ons) refuse several extensions
 * with duplicate functionality from the same developer.
 *
 *   reduce-polys       — Chrome Web Store: free Check + Reduce (5 free a day, 99p unlock).
 *   reduce-polys-edge  — Microsoft Edge Add-ons: free Check + Reduce (5 free a day, £3 unlock),
 *                        sold through its own £3 Lemon Squeezy product.
 *   model-optimiser    — all four tools (99p each), for later.
 *
 * Separate Chrome listings are fine when each does a different job, so the
 * per-job editions below each own tools no other listing has:
 *
 *   texture-compressor — free texture check, KTX2 compress and resize.
 *   inspector          — free health check, rig, animation and compare.
 *
 * `free` lists the tools that need no licence; `dailyFree` is how many runs
 * of the others a day anyone gets before the unlock card (src/quota.js).
 * An edition whose tools are all free ships without the licence-check host
 * permissions. `price` and `products` override the site's single-tool price and add Lemon Squeezy
 * products ({ productId: siteToolId }) whose keys unlock that tool here, with
 * `checkoutUrl` as the buy link. The shared site product still works too.
 */
export const EDITIONS = {
  'reduce-polys': {
    store: 'Chrome Web Store',
    name: 'Reduce Polys – GLB Polygon Reducer by AssetBench',
    shortName: 'Reduce Polys',
    description: 'Cut GLB triangle counts in your browser. Free model check, 5 free reduces a day, 99p for unlimited. Files stay on your computer.',
    heading: ['Reduce', 'Polys'],
    tools: ['check', 'reduce'],
    free: ['check'],
    dailyFree: 5,
    firstTool: 'reduce',
  },
  'reduce-polys-edge': {
    store: 'Microsoft Edge Add-ons',
    name: 'Reduce Polys – GLB Polygon Reducer by AssetBench',
    shortName: 'Reduce Polys',
    description: 'Cut GLB triangle counts in your browser. Free model check, 5 free reduces a day, £3 for unlimited. Files never leave your computer.',
    heading: ['Reduce', 'Polys'],
    tools: ['check', 'reduce'],
    free: ['check'],
    dailyFree: 5,
    firstTool: 'reduce',
    price: '£3',
    // The £3 "Reduce Polys (Edge)" product in Lemon Squeezy.
    products: { 1428470: 'reduce-polys' },
    checkoutUrl: 'https://workbenchlabs.lemonsqueezy.com/checkout/buy/d0d42274-6f50-4c44-a4d6-26b2b2c0a4f2',
  },
  'model-optimiser': {
    store: 'Chrome Web Store',
    name: 'AssetBench Model Optimiser',
    shortName: 'Model Optimiser',
    description: 'Check, reduce, optimise and compress GLB models for games and the web, right in your browser. Files never leave your computer.',
    heading: ['Model', 'Optimiser'],
    tools: ['check', 'reduce', 'optimise', 'compress'],
    free: ['check'],
    dailyFree: 5,
    firstTool: 'check',
  },
  'texture-compressor': {
    store: 'Chrome Web Store',
    name: 'GLB Texture Compressor – KTX2 & Resize by AssetBench',
    shortName: 'Texture Compressor',
    description: 'Shrink the textures in GLB models: free texture check, KTX2 compression and resizing. 5 free a day. Files stay on your PC.',
    heading: ['Texture', 'Compressor'],
    tools: ['textures', 'compress', 'resize'],
    free: ['textures'],
    dailyFree: 5,
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
    dailyFree: 5,
    firstTool: 'inspect',
    website: '/inspect-glb',
  },
};

export const DEFAULT_EDITION = 'reduce-polys';

export const allFree = (edition) => edition.tools.every((t) => edition.free.includes(t));

/** Tools that hand back a file; an edition without any doesn't ask for the downloads permission. */
const SAVING_TOOLS = ['reduce', 'optimise', 'compress', 'resize'];
export const savesFiles = (edition) => edition.tools.some((t) => SAVING_TOOLS.includes(t));
