import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyseGlb } from '../worker/api/glb.js';
import { sphereGlb } from './helpers/apiFixtures.mjs';
import { runTool, TOOL_IDS } from '../extensions/model-optimiser/src/engine.js';
import { activateKey, isUnlocked, revalidate, SITE_TOOL } from '../extensions/model-optimiser/src/licensing.js';
import { fmtCountdown, msUntilReset, runsUsed, spendRun, utcDay } from '../extensions/model-optimiser/src/quota.js';
import { EDITIONS } from '../extensions/model-optimiser/editions.js';
import { LICENSE_PRODUCT_ID, LICENSE_STORE_ID } from '../src/shared/config/billing.js';
import { SINGLE_TOOL_PRODUCT_ID } from '../src/shared/config/toolProducts.js';

globalThis.__ASSETBENCH_BASIS_WASM__ ??= await WebAssembly.compile(readFileSync(new URL('../node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm', import.meta.url)));

let sphere;
const getSphere = async () => (sphere ??= await sphereGlb(120, { textureSize: [256, 256] }));

test('Model Optimiser: the four tools run locally and return GLBs', async () => {
  assert.deepEqual(TOOL_IDS, ['check', 'reduce', 'optimise', 'compress']);
  const bytes = await getSphere();

  const check = await runTool('check', bytes, { role: 'prop' });
  assert.equal(check.output, undefined);
  assert.equal(check.report.devices.length, 4);

  const reduce = await runTool('reduce', bytes, { keep: 0.25 }, 'Sphere.glb');
  assert.equal(reduce.name, 'Sphere-reduced.glb');
  assert.ok(Math.abs(analyseGlb(reduce.output).triangles - check.report.stats.triangles * 0.25) < check.report.stats.triangles * 0.05);

  const optimise = await runTool('optimise', bytes, { target: 'prop' }, 'Sphere.glb');
  assert.ok(analyseGlb(optimise.output).triangles <= 10000 * 1.1);

  const compress = await runTool('compress', bytes, { maxSize: 128 }, 'Sphere.glb');
  assert.equal(compress.name, 'Sphere-ktx2.glb');
  assert.equal(compress.report.textures.length, 1);

  await assert.rejects(runTool('reduce', new Uint8Array([1, 2, 3, 4])), /not a binary glTF/);
});

// Lemon Squeezy and the site's tool binding, faked.
function fakeServers({ product, bound = null, valid = true }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith('/activate')) {
      return Response.json({ activated: true, instance: { id: 'inst-1' }, meta: { store_id: LICENSE_STORE_ID, product_id: product } });
    }
    if (String(url).endsWith('/validate')) return Response.json({ valid }, { status: valid ? 200 : 404 });
    if (String(url).endsWith('/deactivate')) return Response.json({ deactivated: true });
    if (String(url).endsWith('/api/tool-binding')) {
      const { toolId } = JSON.parse(init.body);
      return Response.json({ ok: true, toolId: bound ?? toolId });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { fetchImpl, calls };
}

test('Model Optimiser: All Access unlocks everything; a £5 key unlocks the tab it was bought for', async () => {
  const all = await activateKey('KEY-ALL', 'reduce', fakeServers({ product: LICENSE_PRODUCT_ID }));
  assert.equal(all.license.scope, 'all');
  for (const tool of ['check', 'reduce', 'optimise', 'compress']) assert.ok(isUnlocked(tool, [all.license]), tool);

  const one = await activateKey('KEY-ONE', 'optimise', fakeServers({ product: SINGLE_TOOL_PRODUCT_ID }));
  assert.equal(one.license.scope, SITE_TOOL.optimise);
  assert.ok(isUnlocked('optimise', [one.license]));
  assert.ok(!isUnlocked('reduce', [one.license]));
  assert.ok(isUnlocked('check', []), 'Check is free');
  assert.ok(isUnlocked('reduce', [], new Set(['check', 'reduce'])), 'an edition can make Reduce free');

  // An edition's own product (e.g. the £3 Edge one) unlocks its tool directly.
  const edge = await activateKey('KEY-EDGE', 'reduce', { ...fakeServers({ product: 4242 }), products: { 4242: 'reduce-polys' } });
  assert.equal(edge.license.scope, 'reduce-polys');
  assert.ok(isUnlocked('reduce', [edge.license]));

  // A key already bound to another tool on the website keeps that binding.
  const elsewhere = await activateKey('KEY-SITE', 'compress', fakeServers({ product: SINGLE_TOOL_PRODUCT_ID, bound: 'reduce-polys' }));
  assert.equal(elsewhere.license.scope, 'reduce-polys');
  assert.ok(isUnlocked('reduce', [elsewhere.license]));
  assert.ok(!isUnlocked('compress', [elsewhere.license]));
});

test('Model Optimiser: foreign keys are refused and released; refunded keys drop out', async () => {
  const servers = fakeServers({ product: 999 });
  const foreign = await activateKey('KEY-OTHER', 'reduce', servers);
  assert.equal(foreign.ok, false);
  assert.ok(servers.calls.some((u) => u.endsWith('/deactivate')), 'activation slot is given back');

  const license = { key: 'K', instanceId: 'i', scope: 'all' };
  assert.equal((await revalidate([license], fakeServers({ product: 0, valid: false }))).length, 0);
  assert.equal((await revalidate([license], fakeServers({ product: 0, valid: true }))).length, 1);
  assert.equal((await revalidate([license], { fetchImpl: async () => { throw new Error('offline'); } })).length, 1, 'offline keeps it');
});

test('editions: each has valid tools, and the store description fits', async () => {
  const { EDITIONS, DEFAULT_EDITION, allFree } = await import('../extensions/model-optimiser/editions.js');
  assert.equal(DEFAULT_EDITION, 'reduce-polys');
  assert.deepEqual(EDITIONS['reduce-polys'].tools, ['check', 'reduce']);
  assert.ok(!allFree(EDITIONS['reduce-polys']), 'Chrome: Reduce is paid');
  assert.ok(!allFree(EDITIONS['reduce-polys-edge']), 'Edge: Reduce is paid');
  assert.equal(EDITIONS['reduce-polys-edge'].price, '£3');
  for (const [id, e] of Object.entries(EDITIONS)) {
    assert.ok(e.tools.every((t) => TOOL_IDS.includes(t)), id);
    assert.ok(e.tools.includes(e.firstTool), id);
    assert.ok(e.free.every((t) => e.tools.includes(t)), `${id} frees a tool it doesn't have`);
    assert.ok(e.description.length <= 132, `${id} description is ${e.description.length} chars`);
    assert.ok(e.name.length <= 75, `${id} name too long`);
  }
});

test('the Add to Chrome bar stays hidden until a store URL is set', async () => {
  const { CHROME_EXTENSIONS, chromeExtensionFor } = await import('../src/shared/config/extensions.js');
  const saved = CHROME_EXTENSIONS['reduce-polys'].url;
  CHROME_EXTENSIONS['reduce-polys'].url = null;
  assert.equal(chromeExtensionFor('reduce-polys'), null);
  CHROME_EXTENSIONS['reduce-polys'].url = 'https://chromewebstore.google.com/detail/x';
  assert.equal(chromeExtensionFor('reduce-polys').name, 'Reduce Polys');
  assert.equal(chromeExtensionFor('optimise-glb'), null);
  CHROME_EXTENSIONS['reduce-polys'].url = saved;
});

test('Model Optimiser: free daily runs reset at midnight UTC', async () => {
  const data = {};
  const storage = { get: async (key) => ({ [key]: data[key] }), set: async (items) => Object.assign(data, items) };
  const evening = Date.UTC(2026, 9, 13, 23, 59, 59);
  const nextMorning = Date.UTC(2026, 9, 14, 0, 0, 1);

  assert.equal(utcDay(evening), '2026-10-13');
  assert.equal(await runsUsed(storage, evening), 0);
  assert.equal(await spendRun(storage, evening), 1);
  assert.equal(await spendRun(storage, evening), 2);
  assert.deepEqual(data.quota, { dailyRunsCount: 2, lastResetDay: '2026-10-13' });
  assert.equal(await runsUsed(storage, nextMorning), 0);
  assert.equal(await spendRun(storage, nextMorning), 1);

  assert.equal(msUntilReset(evening), 1000);
  assert.equal(fmtCountdown(msUntilReset(evening)), '00:00:01');
  assert.equal(fmtCountdown(msUntilReset(Date.UTC(2026, 9, 13, 0, 0, 0))), '24:00:00');
  assert.equal(fmtCountdown(5 * 3600_000 + 7 * 60_000 + 9_500), '05:07:10');

  for (const edition of Object.values(EDITIONS)) assert.equal(edition.dailyFree, 5);
});
