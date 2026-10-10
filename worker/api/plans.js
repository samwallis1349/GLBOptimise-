/**
 * AssetBench Cloud API plans. Prices are display-only: billing is not wired
 * to Lemon Squeezy yet, so paid keys are minted by the owner (POST
 * /api/v1/auth/keys with the API_ADMIN_KEY secret) after a sale.
 *
 * `engines` gates which endpoint families a key may call (texture
 * endpoints work with either); `quota` is operations per calendar month
 * (UTC), or lifetime for the trial. One processed file = one operation.
 */
export const PLANS = {
  // The free plan keeps the id 'trial' so keys issued before launch stay valid.
  trial: {
    id: 'trial',
    name: 'Free',
    price: { amount: 0, currency: 'GBP', interval: null },
    quota: 100,
    period: 'month',
    engines: ['2d', '3d'],
    maxUploadMB: 25,
    batchMaxMB: 40,
    summary: 'All seven APIs, 100 operations a month, free during launch. One key per network.',
  },
  studio2d: {
    id: 'studio2d',
    name: '2D Studio',
    price: { amount: 29, currency: 'GBP', interval: 'month' },
    quota: 150,
    period: 'month',
    engines: ['2d'],
    maxUploadMB: 25,
    batchMaxMB: 40,
    summary: 'iOS asset generation (icons, xcassets, store screenshots), KTX2 and texture resizing, batch.',
  },
  studio3d: {
    id: 'studio3d',
    name: '3D Studio',
    price: { amount: 79, currency: 'GBP', interval: 'month' },
    quota: 150,
    period: 'month',
    engines: ['3d'],
    maxUploadMB: 25,
    batchMaxMB: 40,
    summary: 'GLB optimisation and game-ready packs, audits, LODs, format conversion, KTX2, batch.',
  },
  all: {
    id: 'all',
    name: 'All-Access Cloud',
    price: { amount: 99, currency: 'GBP', interval: 'month' },
    quota: 400,
    period: 'month',
    engines: ['2d', '3d'],
    maxUploadMB: 25,
    batchMaxMB: 40,
    summary: 'All seven APIs with a shared monthly pool. Best value.',
    bestValue: true,
  },
};

/** The seven products in the package, in the order the docs present them. */
export const PRODUCTS = [
  { id: 'optimise', name: 'GLB Optimisation API', blurb: 'Upload a model; get back a compressed, reduced GLB, or a full game-ready pack fitted to a device and engine.', endpoints: ['POST /api/v1/3d/optimize', 'POST /api/v1/3d/reduce', 'POST /api/v1/3d/game-ready'] },
  { id: 'batch', name: 'Batch Asset Processing API', blurb: 'Run any operation over up to 50 models or textures in one request (send several files or one ZIP).', endpoints: ['POST /api/v1/batch'] },
  { id: 'ktx2', name: 'KTX2 Texture API', blurb: 'PNG, JPEG or every texture inside a GLB to GPU-compressed KTX2 (Basis Universal ETC1S / UASTC).', endpoints: ['POST /api/v1/textures/ktx2'] },
  { id: 'audit', name: '3D Asset Audit API', blurb: 'File size, triangles, draw calls, texture memory, animation data and a mobile-readiness score per device class.', endpoints: ['POST /api/v1/3d/audit'] },
  { id: 'convert', name: '3D Format Conversion API', blurb: 'FBX, OBJ and glTF to GLB; GLB to glTF or OBJ.', endpoints: ['POST /api/v1/3d/convert'] },
  { id: 'lods', name: 'LOD Generation API', blurb: 'Level-of-detail chains for game engines and mobile games.', endpoints: ['POST /api/v1/3d/lods'] },
  { id: 'ios', name: 'iOS Asset Generation API', blurb: 'App icons, store screenshot sizes and ready-to-import .xcassets packages.', endpoints: ['POST /api/v1/ios/app-icons', 'POST /api/v1/ios/xcassets', 'POST /api/v1/ios/screenshots'] },
];

/**
 * Plans for display. Paid plans are hidden unless API_PAID_PLANS is "on"
 * (free launch); their Lemon Squeezy billing keeps working either way.
 * Checkout links come from the API_LS_CHECKOUTS var: {"studio2d":"https://…", …}.
 */
export function publicPlans(env = {}) {
  let checkouts = {};
  try { checkouts = typeof env.API_LS_CHECKOUTS === 'string' ? JSON.parse(env.API_LS_CHECKOUTS) : env.API_LS_CHECKOUTS || {}; } catch { checkouts = {}; }
  const paid = env.API_PAID_PLANS === 'on';
  return Object.values(PLANS).filter((p) => paid || p.price.amount === 0).map(({ id, name, price, quota, period, engines, maxUploadMB, batchMaxMB, summary, bestValue }) => ({
    id, name, price, quota, period, engines, maxUploadMB, batchMaxMB, summary, bestValue: Boolean(bestValue),
    checkoutUrl: /^https:\/\/[\w.-]+\.lemonsqueezy\.com\//.test(checkouts[id] || '') ? checkouts[id] : null,
  }));
}
