import test from 'node:test';
import assert from 'node:assert/strict';
import { SINGLE_TOOL_PRODUCT_ID, TOOL_PRODUCTS } from '../src/shared/config/toolProducts.js';
import { LICENSE_PRODUCT_ID, LICENSE_STORE_ID } from '../src/shared/config/billing.js';
import {
  activateLicense,
  deactivateToolLicense,
  getToolLicenses,
  hasStoredLicense,
  hasToolLicense,
  revalidateStoredLicense,
} from '../src/services/LicenseService.js';

const TOOL_PRODUCT = 555;

/** Fresh browser storage and a fake Lemon Squeezy for each test. */
function setup(respond) {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.navigator ??= { userAgent: 'Chrome/1 Windows' };
  const calls = [];
  globalThis.fetch = async (url, { body }) => {
    const action = url.split('/').pop();
    calls.push(action);
    const data = respond(action, Object.fromEntries(body));
    return { ok: !data.error, json: async () => data };
  };
  return calls;
}

const meta = (productId) => ({ store_id: LICENSE_STORE_ID, product_id: productId });

test.beforeEach(() => { TOOL_PRODUCTS['reduce-polys'].productId = TOOL_PRODUCT; });
test.afterEach(() => { TOOL_PRODUCTS['reduce-polys'].productId = null; });

test('a £5 tool key unlocks only its own tool, not the lifetime license', async () => {
  setup(() => ({ activated: true, instance: { id: 'i1' }, meta: meta(TOOL_PRODUCT) }));
  assert.deepEqual(await activateLicense('TOOL-KEY'), { ok: true, toolId: 'reduce-polys' });
  assert.equal(hasToolLicense('reduce-polys'), true);
  assert.equal(hasToolLicense('optimise-glb'), false);
  assert.equal(hasStoredLicense(), false);
});

test('a variant-based tool key unlocks the matching tool', async () => {
  TOOL_PRODUCTS['compress-textures'].variantId = 777;
  try {
    setup(() => ({ activated: true, instance: { id: 'i1' }, meta: { store_id: LICENSE_STORE_ID, variant_id: 777 } }));
    assert.deepEqual(await activateLicense('VARIANT-KEY'), { ok: true, toolId: 'compress-textures' });
    assert.equal(hasToolLicense('compress-textures'), true);
  } finally {
    TOOL_PRODUCTS['compress-textures'].variantId = null;
  }
});

test('a universal single-tool key binds to the activated tool', async () => {
  setup(() => ({ activated: true, instance: { id: 'i1' }, meta: meta(SINGLE_TOOL_PRODUCT_ID) }));
  assert.deepEqual(await activateLicense('UNIVERSAL-KEY', 'model-to-isometric'), { ok: true, toolId: 'model-to-isometric' });
  assert.equal(hasToolLicense('model-to-isometric'), true);
  assert.equal(hasToolLicense('reduce-polys'), false);
});

test('the lifetime key still unlocks everything', async () => {
  setup(() => ({ activated: true, instance: { id: 'i1' }, meta: meta(LICENSE_PRODUCT_ID) }));
  assert.deepEqual(await activateLicense('LIFETIME'), { ok: true });
  assert.equal(hasStoredLicense(), true);
  assert.deepEqual(getToolLicenses(), []);
});

test('a key for some other product is rejected and handed back', async () => {
  const calls = setup((action) => action === 'activate'
    ? { activated: true, instance: { id: 'i1' }, meta: meta(999) }
    : { deactivated: true });
  assert.equal((await activateLicense('OTHER')).ok, false);
  assert.deepEqual(calls, ['activate', 'deactivate']);
});

test('a refunded tool key locks on re-check; removing frees the activation', async () => {
  let refunded = false;
  const calls = setup((action) => {
    if (action === 'activate') return { activated: true, instance: { id: 'i1' }, meta: meta(TOOL_PRODUCT) };
    if (action === 'validate') return { valid: !refunded, meta: meta(TOOL_PRODUCT) };
    return { deactivated: true };
  });
  await activateLicense('TOOL-KEY');
  await revalidateStoredLicense();
  assert.equal(hasToolLicense('reduce-polys'), true);
  refunded = true;
  await revalidateStoredLicense();
  assert.equal(hasToolLicense('reduce-polys'), false);

  refunded = false;
  await activateLicense('TOOL-KEY-2');
  assert.deepEqual(await deactivateToolLicense('reduce-polys'), { ok: true });
  assert.equal(hasToolLicense('reduce-polys'), false);
  assert.equal(calls.at(-1), 'deactivate');
});
