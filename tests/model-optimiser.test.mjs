import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyseGlb } from '../worker/api/glb.js';
import { sphereGlb } from './helpers/apiFixtures.mjs';
import { pipelineIO, skinnedCharacter } from './helpers/pipelineFixtures.mjs';
import { runTool, TOOL_IDS } from '../extensions/model-optimiser/src/engine.js';
import { activateKey, isUnlocked, revalidate, SITE_TOOL } from '../extensions/model-optimiser/src/licensing.js';
import { runsUsed, spendRun } from '../extensions/model-optimiser/src/quota.js';
import { EDITIONS } from '../extensions/model-optimiser/editions.js';
import { LICENSE_PRODUCT_ID, LICENSE_STORE_ID } from '../src/shared/config/billing.js';
import { SINGLE_TOOL_PRODUCT_ID } from '../src/shared/config/toolProducts.js';

globalThis.__ASSETBENCH_BASIS_WASM__ ??= await WebAssembly.compile(readFileSync(new URL('../node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm', import.meta.url)));

let sphere;
const getSphere = async () => (sphere ??= await sphereGlb(120, { textureSize: [256, 256] }));

test('Model Optimiser: the four tools run locally and return GLBs', async () => {
  assert.deepEqual(TOOL_IDS, ['check', 'reduce', 'optimise', 'compress', 'textures', 'resize', 'inspect', 'rig', 'animations', 'compare']);
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

test('Texture Compressor: the free texture check lists textures; resize shrinks them', async () => {
  const bytes = await getSphere();

  const textures = await runTool('textures', bytes);
  assert.equal(textures.output, undefined);
  assert.equal(textures.report.textures.length, 1);
  assert.equal(textures.report.textures[0].width, 256);

  const resize = await runTool('resize', bytes, { maxSize: 64 }, 'Sphere.glb');
  assert.equal(resize.name, 'Sphere-64px.glb');
  assert.deepEqual(resize.report.textures.map((t) => t.to), ['64x64']);
  assert.ok(resize.report.memoryAfter < resize.report.memoryBefore);
  assert.equal(analyseGlb(resize.output).textures[0].width, 64);

  const again = await runTool('resize', resize.output, { maxSize: 64 });
  assert.equal(again.report.textures.length, 0);
  assert.match(again.report.warnings[0], /already 64 px or smaller/);
});

test('GLB Inspector: health check, rig, animations and compare run on the site analysers', async () => {
  const character = await skinnedCharacter(await pipelineIO());

  const inspect = await runTool('inspect', character, {}, 'Hero.glb');
  assert.equal(inspect.output, undefined);
  assert.ok(inspect.report.health.score > 0 && inspect.report.health.score <= 100);
  assert.equal(inspect.report.totals.joints, 3);
  assert.equal(inspect.report.totals.animations, 2);

  const rig = await runTool('rig', character);
  assert.equal(rig.report.hasRig, true);
  assert.equal(rig.report.joints, 3);
  assert.ok(rig.report.checks.some((c) => c.level === 'ok'));
  const noRig = await runTool('rig', await getSphere());
  assert.equal(noRig.report.hasRig, false);

  const anims = await runTool('animations', character);
  assert.deepEqual(anims.report.clips.map((c) => c.name), ['Wave', 'Bob']);
  assert.ok(anims.report.keyframes > 0);

  const lighter = (await runTool('reduce', character, { keep: 0.3 }, 'Hero.glb')).output;
  const compare = await runTool('compare', character, { other: lighter, otherName: 'Hero-reduced.glb' }, 'Hero.glb');
  assert.equal(compare.report.verdict.tone, 'better');
  assert.ok(compare.report.changes.some((c) => c.label === 'Triangles'));
  await assert.rejects(runTool('compare', character, {}), /second model/);
});

// Lemon Squeezy and the site's tool binding, faked.
function fakeServers({ product, bound = null, valid = true }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith('/activate')) {
      return Response.json({ activated: true, instance: { id: 'inst-1' }, meta: { store_id: LICENSE_STORE_ID, product_id: product } });
    }
    if (String(url).endsWith('/validate')) return Response.json({ valid, meta: { store_id: LICENSE_STORE_ID, product_id: product } }, { status: valid ? 200 : 404 });
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

  // In an extension one 99p key unlocks every tool it has.
  const inspector = ['inspect', 'rig', 'animations', 'compare'];
  const rig = await activateKey('KEY-RIG', 'rig', fakeServers({ product: SINGLE_TOOL_PRODUCT_ID }));
  for (const tool of inspector) assert.ok(isUnlocked(tool, [rig.license], new Set(['inspect']), inspector), tool);
  assert.ok(!isUnlocked('reduce', [rig.license], new Set(['check']), ['check', 'reduce']), 'but not another extension');
});

test('Model Optimiser: foreign keys are refused and released; refunded keys drop out', async () => {
  const servers = fakeServers({ product: 999 });
  const foreign = await activateKey('KEY-OTHER', 'reduce', servers);
  assert.equal(foreign.ok, false);
  assert.ok(!servers.calls.some((u) => u.endsWith('/activate')), 'extensions never use up a device slot');

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
  assert.ok(Object.values(EDITIONS).every((e) => !e.price && !e.checkoutUrl), 'every edition sells through the shared 99p product');
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

test('Model Optimiser: 10 free runs in all, and they never come back', async () => {
  const area = () => {
    const data = {};
    return { data, get: async (key) => ({ [key]: data[key] }), set: async (items) => Object.assign(data, items) };
  };
  const local = area();
  const sync = area();
  assert.equal(await runsUsed(local, sync), 0);
  assert.equal(await spendRun(local, sync), 1);
  assert.equal(await spendRun(local, sync), 2);
  assert.equal(sync.data.freeRunsUsed, 2);

  // Reinstalling clears local storage, but sync still remembers.
  const reinstalled = area();
  assert.equal(await runsUsed(reinstalled, sync), 2);
  assert.equal(await spendRun(reinstalled, sync), 3);

  // Sync unavailable: local still counts.
  const broken = { get: async () => { throw new Error('sync off'); }, set: async () => { throw new Error('sync off'); } };
  assert.equal(await spendRun(local, broken), 3);

  for (const edition of Object.values(EDITIONS)) assert.equal(edition.freeRuns, 10);
});
