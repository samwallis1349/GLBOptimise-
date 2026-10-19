/**
 * AssetBench Cloud API plans. Each paid plan is a Lemon Squeezy product with
 * licence keys on, and the licence key is the API key (worker/api/billing.js).
 *
 *   Free        100 operations a month, one key per network.
 *   All Access  the site's £10/month subscription; the API is included.
 *   Studio      £99/month for teams that need 5,000 operations.
 *
 * `engines` gates which endpoint families a key may call (texture
 * endpoints work with either); `quota` is operations per calendar month
 * (UTC). One processed file = one operation. Upload caps stay at or under
 * 100 MB: Cloudflare rejects larger request bodies, and a Worker has about
 * 128 MB of memory, which the heaviest jobs on the biggest files can exhaust. `legacy` plans are kept only so
 * keys sold under them keep working; they are never listed.
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
    summary: 'Every API, 100 operations a month. Checks are free and unlimited. One key per network.',
  },
  allaccess: {
    id: 'allaccess',
    name: 'All Access',
    price: { amount: 10, currency: 'GBP', interval: 'month' },
    quota: 1000,
    period: 'month',
    engines: ['2d', '3d'],
    maxUploadMB: 50,
    batchMaxMB: 100,
    summary: 'Included with the £10/month All Access subscription: every website tool, plus 1,000 Cloud API operations/month. Your All Access licence key is your API key.',
    bestValue: true,
  },
  // Id 'all' is kept from the first release so keys minted on it stay valid.
  all: {
    id: 'all',
    name: 'Studio',
    price: { amount: 99, currency: 'GBP', interval: 'month' },
    quota: 5000,
    period: 'month',
    engines: ['2d', '3d'],
    maxUploadMB: 100,
    batchMaxMB: 100,
    summary: 'For studios running whole asset libraries through the API every month.',
  },
  studio2d: {
    id: 'studio2d', name: '2D Studio', legacy: true,
    price: { amount: 29, currency: 'GBP', interval: 'month' }, quota: 150, period: 'month', engines: ['2d'], maxUploadMB: 25, batchMaxMB: 40,
    summary: 'Retired plan, kept so existing keys work.',
  },
  studio3d: {
    id: 'studio3d', name: '3D Studio', legacy: true,
    price: { amount: 79, currency: 'GBP', interval: 'month' }, quota: 150, period: 'month', engines: ['3d'], maxUploadMB: 25, batchMaxMB: 40,
    summary: 'Retired plan, kept so existing keys work.',
  },
};

/** The three things the API sells, in the order the docs present them. */
export const PRODUCTS = [
  { id: 'check', name: 'Check a model', free: true, blurb: 'Send a GLB and get a score for every device class, which phones and headsets can run it, and what to fix first. Free.', endpoints: ['POST /api/v1/check'] },
  { id: 'game-ready', name: 'Make it game-ready', blurb: 'One call returns an engine-ready ZIP: optimised GLB, LOD chain, collision mesh, optional KTX2 textures and import notes for Unity, Unreal, Godot, Roblox or the web.', endpoints: ['POST /api/v1/game-ready'] },
  { id: 'app-assets', name: 'App store assets', blurb: 'One square image becomes every app icon (Xcode AppIcon.appiconset, Android, watchOS, Play Store). Your screenshots become every store size.', endpoints: ['POST /api/v1/app-assets', 'POST /api/v1/app-assets/screenshots'] },
];

/** Single steps for developers who want one part of the pipeline on its own. */
export const ADVANCED_ENDPOINTS = [
  'POST /api/v1/3d/reduce',
  'POST /api/v1/3d/optimize',
  'POST /api/v1/3d/lods',
  'POST /api/v1/3d/convert',
  'POST /api/v1/textures/ktx2',
  'POST /api/v1/textures/resize',
  'POST /api/v1/batch',
];

/**
 * Plans for display: every plan except retired ones.
 * Checkout links come from the API_LS_CHECKOUTS var: {"allaccess":"https://…", …}.
 */
export function publicPlans(env = {}) {
  let checkouts = {};
  try { checkouts = typeof env.API_LS_CHECKOUTS === 'string' ? JSON.parse(env.API_LS_CHECKOUTS) : env.API_LS_CHECKOUTS || {}; } catch { checkouts = {}; }
  return Object.values(PLANS).filter((p) => !p.legacy).map(({ id, name, price, quota, period, engines, maxUploadMB, batchMaxMB, summary, bestValue }) => ({
    id, name, price, quota, period, engines, maxUploadMB, batchMaxMB, summary, bestValue: Boolean(bestValue),
    checkoutUrl: /^https:\/\/[\w.-]+\.lemonsqueezy\.com\//.test(checkouts[id] || '') ? checkouts[id] : null,
  }));
}
