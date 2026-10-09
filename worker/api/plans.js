/**
 * AssetBench Cloud API plans. Prices are display-only: billing is not wired
 * to Lemon Squeezy yet, so paid keys are minted by the owner (POST
 * /api/v1/auth/keys with the API_ADMIN_KEY secret) after a sale.
 *
 * `engines` gates which endpoint families a key may call; `quota` is
 * operations per calendar month (UTC), or lifetime for the trial.
 */
export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Free Trial',
    price: { amount: 0, currency: 'GBP', interval: null },
    quota: 25,
    period: 'lifetime',
    engines: ['2d', '3d'],
    maxUploadMB: 15,
    summary: '25 operations to try every endpoint. One key per network.',
  },
  studio2d: {
    id: 'studio2d',
    name: '2D Studio',
    price: { amount: 29, currency: 'GBP', interval: 'month' },
    quota: 150,
    period: 'month',
    engines: ['2d'],
    maxUploadMB: 25,
    summary: 'iOS, watchOS and Android app icon sets, adaptive icons and texture resizing.',
  },
  studio3d: {
    id: 'studio3d',
    name: '3D Studio',
    price: { amount: 79, currency: 'GBP', interval: 'month' },
    quota: 150,
    period: 'month',
    engines: ['3d'],
    maxUploadMB: 25,
    summary: 'Mobile-ready inspection, polygon reduction, texture downscaling, Meshopt compression and LOD chains.',
  },
  all: {
    id: 'all',
    name: 'All-Access Cloud',
    price: { amount: 99, currency: 'GBP', interval: 'month' },
    quota: 400,
    period: 'month',
    engines: ['2d', '3d'],
    maxUploadMB: 25,
    summary: 'Both engines with a shared monthly pool. Best value.',
    bestValue: true,
  },
};

export function publicPlans() {
  return Object.values(PLANS).map(({ id, name, price, quota, period, engines, maxUploadMB, summary, bestValue }) => ({
    id, name, price, quota, period, engines, maxUploadMB, summary, bestValue: Boolean(bestValue),
  }));
}
