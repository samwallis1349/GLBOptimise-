const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLicense } = require('../app/license.cjs');

const STORE = 480634;
const PRODUCT = 111;

/** Fake Lemon Squeezy: `respond(action, params)` returns the JSON body, or throws to simulate being offline. */
function fakeApi(respond) {
  const calls = [];
  const fetch = async (url, { body }) => {
    const action = url.split('/').pop();
    const params = Object.fromEntries(body);
    calls.push({ action, params });
    const data = respond(action, params);
    return { ok: !data.error, json: async () => data };
  };
  return { fetch, calls };
}

const meta = (productId = PRODUCT) => ({ store_id: STORE, product_id: productId });

function setup(respond, machineId = 'pc-a') {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ab-licence-')), 'licence.json');
  const api = fakeApi(respond);
  const make = (id = machineId) => createLicense({
    storeId: STORE, productId: PRODUCT, productName: 'Asset Bench Reduce Polys',
    file, machineId: id, instanceName: 'Reduce Polys on TEST-PC', fetch: api.fetch,
  });
  return { file, api, license: make(), make };
}

test('a valid key for this product unlocks the app', async () => {
  const { license } = setup(() => ({ activated: true, instance: { id: 'i1' }, meta: meta() }));
  assert.equal(license.isUnlocked(), false);
  assert.deepEqual(await license.activate('KEY-1'), { ok: true });
  assert.equal(license.isUnlocked(), true);
});

test('a key for a different tool is rejected and its activation handed back', async () => {
  const { license, api } = setup((action) => action === 'activate'
    ? { activated: true, instance: { id: 'i1' }, meta: meta(999) }
    : { deactivated: true });
  const result = await license.activate('OTHER-TOOL-KEY');
  assert.equal(result.ok, false);
  assert.match(result.error, /different product/);
  assert.equal(license.isUnlocked(), false);
  assert.deepEqual(api.calls.map((c) => c.action), ['activate', 'deactivate']);
});

test('copying the licence file to another PC does not unlock it there', async () => {
  const { license, make } = setup(() => ({ activated: true, instance: { id: 'i1' }, meta: meta() }));
  await license.activate('KEY-1');
  assert.equal(make('pc-b').isUnlocked(), false);
});

test('an unknown key and the activation limit give clear errors', async () => {
  const unknown = setup(() => ({ error: 'license_key not found.' }));
  assert.match((await unknown.license.activate('NOPE')).error, /wasn't recognised/);
  const used = setup(() => ({ error: 'This license key has reached the activation limit.' }));
  assert.match((await used.license.activate('USED')).error, /already active on another PC/);
});

test('offline re-checks keep a paying buyer unlocked; a refunded key locks', async () => {
  let mode = 'activate';
  const { license } = setup(() => {
    if (mode === 'activate') return { activated: true, instance: { id: 'i1' }, meta: meta() };
    if (mode === 'offline') throw new Error('ENOTFOUND');
    return { valid: false, error: 'license_key is disabled', meta: meta() };
  });
  await license.activate('KEY-1');
  mode = 'offline';
  assert.equal(await license.revalidate(), true);
  mode = 'refunded';
  assert.equal(await license.revalidate(), false);
});

test('removing the licence frees the activation and locks this PC', async () => {
  const { license, api } = setup((action) => action === 'activate'
    ? { activated: true, instance: { id: 'i1' }, meta: meta() }
    : { deactivated: true });
  await license.activate('KEY-1');
  assert.deepEqual(await license.deactivate(), { ok: true });
  assert.equal(license.isUnlocked(), false);
  assert.deepEqual(api.calls.at(-1), { action: 'deactivate', params: { license_key: 'KEY-1', instance_id: 'i1' } });
});
