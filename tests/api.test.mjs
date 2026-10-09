import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { decode as decodePng } from 'fast-png';
import worker from '../worker/index.js';
import { compileIntent } from '../worker/api/intent.js';
import { fitSize } from '../worker/api/images.js';
import { analyseGlb } from '../worker/api/glb.js';
import { memoryKv, pngBytes, sphereGlb } from './helpers/apiFixtures.mjs';

const ADMIN = 'owner-secret';

function setup() {
  const env = { TRIALS: memoryKv(), API_ADMIN_KEY: ADMIN };
  const call = (path, init = {}) => worker.fetch(new Request(`https://www.assetbench.co.uk${path}`, init), env, {});
  const mint = async (plan) => {
    const res = await call('/api/v1/auth/keys', { method: 'POST', headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
    assert.equal(res.status, 201);
    return (await res.json()).key;
  };
  return { env, call, mint };
}

const auth = (key) => ({ Authorization: `Bearer ${key}` });

let sphere;
const getSphere = async () => (sphere ??= await sphereGlb(120, { textureSize: [1500, 1500] }));

test('pricing, targets and intent are public', async () => {
  const { call } = setup();
  const pricing = await (await call('/api/v1/pricing')).json();
  assert.deepEqual(pricing.plans.map((p) => [p.id, p.price.amount]), [['trial', 0], ['studio2d', 29], ['studio3d', 79], ['all', 99]]);
  assert.ok((await (await call('/api/v1/targets')).json()).targets.prop);
  const intent = await (await call('/api/v1/intent?target=shopify%20viewer')).json();
  assert.equal(intent.target, 'web');
});

test('one trial key per network, never a paid plan without the owner key', async () => {
  const { call } = setup();
  const req = (ip, body = {}) => call('/api/v1/auth/keys', { method: 'POST', headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const first = await req('203.0.113.9', { plan: 'all' });
  assert.equal(first.status, 201);
  const body = await first.json();
  assert.match(body.key, /^abk_live_[a-f0-9]{48}$/);
  assert.equal(body.plan, 'trial');
  assert.equal((await req('203.0.113.9')).status, 409);
  assert.equal((await req('2001:db8:1:2:aaaa::1')).status, 201);
  assert.equal((await req('2001:db8:1:2:bbbb::2')).status, 409, 'same IPv6 /64');
});

test('keys are required and validated; only hashes are stored', async () => {
  const { call, env, mint } = setup();
  const key = await mint('all');
  assert.equal((await call('/api/v1/auth/me')).status, 401);
  assert.equal((await call('/api/v1/auth/me', { headers: auth(`abk_live_${'0'.repeat(48)}`) })).status, 401);
  const me = await (await call('/api/v1/auth/me', { headers: auth(key) })).json();
  assert.equal(me.plan.id, 'all');
  assert.equal(me.quota.remaining, 400);
  assert.ok(![...env.TRIALS.store.keys()].some((k) => k.includes(key)), 'raw key never stored');

  const revoke = await call('/api/v1/auth/keys', { method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
  assert.equal(revoke.status, 200);
  assert.equal((await call('/api/v1/auth/me', { headers: auth(key) })).status, 403);
});

test('inspect scores a GLB and costs no quota', async () => {
  const { call, mint } = setup();
  const key = await mint('studio3d');
  const res = await call('/api/v1/3d/inspect?target=prop', { method: 'POST', headers: auth(key), body: await getSphere() });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.stats.triangles, 2 * 120 * 120);
  assert.equal(j.stats.largestTexture, 1500);
  assert.equal(j.stats.nonPowerOfTwoTextures, 1);
  assert.equal(j.evaluation.checks.find((c) => c.key === 'triangles').status, 'fail');
  const me = await (await call('/api/v1/auth/me', { headers: auth(key) })).json();
  assert.equal(me.quota.used, 0);
});

test('optimize hits the budget, resizes textures, compresses and charges one operation', async () => {
  const { call, mint } = setup();
  const key = await mint('studio3d');
  const form = new FormData();
  form.append('file', new Blob([await getSphere()]), 'hero sphere.glb');
  form.append('target', 'low-end android prop');
  const res = await call('/api/v1/3d/optimize', { method: 'POST', headers: auth(key), body: form });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'model/gltf-binary');
  assert.match(res.headers.get('Content-Disposition'), /hero_sphere-optimised\.glb/);
  assert.equal(res.headers.get('X-Quota-Remaining'), '149');
  const summary = JSON.parse(res.headers.get('X-AssetBench-Summary'));
  assert.ok(summary.trianglesAfter <= 6000 * 1.05, `got ${summary.trianglesAfter}`);
  assert.ok(summary.bytesAfter < summary.bytesBefore);

  const out = analyseGlb(new Uint8Array(await res.arrayBuffer()));
  assert.equal(out.compression.meshopt, true);
  assert.equal(out.largestTexture, 512);
  assert.equal(out.nonPowerOfTwoTextures, 0);
});

test('optimize with explicit ratio and JSON output', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const res = await call('/api/v1/3d/optimize?ratio=0.5&compress=false&maxTextureSize=0&output=json', { method: 'POST', headers: auth(key), body: await getSphere() });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.ok(Math.abs(j.report.after.stats.triangles - 14400) < 14400 * 0.1);
  assert.equal(j.report.after.stats.compression.meshopt, false);
  assert.equal(j.report.textures.length, 0);
  assert.match(j.report.summaryText, /AssetBench Cloud performance report/);
  assert.ok(j.file.base64.length > 1000);
});

test('LOD chain is a ZIP of decreasing levels', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const res = await call('/api/v1/3d/lods?levels=1,0.5,0.25', { method: 'POST', headers: auth(key), body: await getSphere() });
  assert.equal(res.status, 200);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files).sort(), ['lod0.glb', 'lod1.glb', 'lod2.glb', 'report.json']);
  const report = JSON.parse(await zip.file('report.json').async('string'));
  const tris = report.levels.map((l) => l.triangles);
  assert.equal(tris[0], 28800);
  assert.ok(tris[0] > tris[1] && tris[1] > tris[2]);
});

test('app icon pack: Contents.json matches files, iOS icons are opaque, Android adaptive present', async () => {
  const { call, mint } = setup();
  const key = await mint('studio2d');
  const form = new FormData();
  form.append('file', new Blob([pngBytes(1024, 1024, { alpha: true })], { type: 'image/png' }), 'logo.png');
  form.append('platforms', 'ios,android');
  form.append('background', '#112233');
  const res = await call('/api/v1/2d/app-icons', { method: 'POST', headers: auth(key), body: form });
  assert.equal(res.status, 200);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());

  const contents = JSON.parse(await zip.file('ios/AppIcon.appiconset/Contents.json').async('string'));
  assert.equal(contents.images.length, 18);
  for (const img of contents.images) {
    const file = zip.file(`ios/AppIcon.appiconset/${img.filename}`);
    assert.ok(file, img.filename);
    const png = decodePng(await file.async('uint8array'));
    assert.equal(png.width, Math.round(parseFloat(img.size) * parseFloat(img.scale)), img.filename);
    assert.equal(png.channels, 3, `${img.filename} must have no alpha`);
  }
  for (const [density, px, fg] of [['mdpi', 48, 108], ['xxxhdpi', 192, 432]]) {
    assert.equal(decodePng(await zip.file(`android/res/mipmap-${density}/ic_launcher.png`).async('uint8array')).width, px);
    assert.equal(decodePng(await zip.file(`android/res/mipmap-${density}/ic_launcher_foreground.png`).async('uint8array')).width, fg);
  }
  assert.match(await zip.file('android/res/values/ic_launcher_background.xml').async('string'), /#112233/);
  assert.ok(zip.file('android/res/mipmap-anydpi-v26/ic_launcher.xml'));
  assert.ok(zip.file('android/playstore-512.png'));
  assert.equal(zip.file('watchos/AppIcon.appiconset/Contents.json'), null);
});

test('xcassets defaults to iOS only; tiny or non-image uploads are rejected', async () => {
  const { call, mint } = setup();
  const key = await mint('studio2d');
  const res = await call('/api/v1/2d/xcassets', { method: 'POST', headers: auth(key), body: pngBytes(1024, 1024) });
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  assert.ok(zip.file('ios/AppIcon.appiconset/Contents.json'));
  assert.equal(zip.file('android/playstore-512.png'), null);

  assert.equal((await call('/api/v1/2d/app-icons', { method: 'POST', headers: auth(key), body: pngBytes(200, 200) })).status, 422);
  assert.equal((await call('/api/v1/2d/app-icons', { method: 'POST', headers: auth(key), body: new TextEncoder().encode('hello') })).status, 415);
});

test('resize snaps to the nearest power of two within maxSize', async () => {
  const { call, mint } = setup();
  const key = await mint('studio2d');
  const res = await call('/api/v1/2d/resize?maxSize=512&format=jpeg', { method: 'POST', headers: auth(key), body: pngBytes(1500, 700) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/jpeg');
  assert.deepEqual(JSON.parse(res.headers.get('X-AssetBench-Summary')).to.width, 512);
  assert.deepEqual(fitSize(1500, 700, 512, true), { width: 512, height: 256 });
  assert.deepEqual(fitSize(300, 300, 1024, true), { width: 256, height: 256 });
  assert.deepEqual(fitSize(1000, 1000, 1024, true), { width: 1024, height: 1024 });
});

test('plans gate engines and quotas', async () => {
  const { call, env, mint } = setup();
  const key2d = await mint('studio2d');
  const blocked = await call('/api/v1/3d/optimize', { method: 'POST', headers: auth(key2d), body: await getSphere() });
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).error.code, 'engine_not_in_plan');

  const trial = await mint('trial');
  const usageKey = [...env.TRIALS.store.keys()].find((k) => k.startsWith('apikey:') && JSON.parse(env.TRIALS.store.get(k).value).plan === 'trial').replace('apikey:', 'apiuse:') + ':lifetime';
  await env.TRIALS.put(usageKey, '', { metadata: { count: 25 } });
  const spent = await call('/api/v1/2d/resize', { method: 'POST', headers: auth(trial), body: pngBytes(64, 64) });
  assert.equal(spent.status, 429);
  assert.equal((await spent.json()).error.code, 'quota_exhausted');
});

test('Draco input is inspectable but not processable', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, extensionsUsed: ['KHR_draco_mesh_compression'], extensionsRequired: ['KHR_draco_mesh_compression'] }).padEnd(120, ' '));
  const glb = new Uint8Array(12 + 8 + json.length);
  const dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true);
  dv.setUint32(12, json.length, true); dv.setUint32(16, 0x4e4f534a, true); glb.set(json, 20);
  assert.equal((await call('/api/v1/3d/inspect', { method: 'POST', headers: auth(key), body: glb })).status, 200);
  const res = await call('/api/v1/3d/optimize', { method: 'POST', headers: auth(key), body: glb });
  assert.equal(res.status, 415);
  assert.equal((await res.json()).error.code, 'draco_input');
});

test('intent compiler maps plain English to budgets', () => {
  assert.equal(compileIntent('Roblox on a low-end Android phone without lag').triangleBudget, 6000);
  assert.equal(compileIntent('Shopify jewelry viewer on mobile Safari').target, 'web');
  assert.equal(compileIntent('Quest 3 VR level').target, 'quest');
  assert.equal(compileIntent('rigged hero character').target, 'character');
  const explicit = compileIntent('under 5k tris, 512px textures');
  assert.equal(explicit.triangleBudget, 5000);
  assert.equal(explicit.maxTextureSize, 512);
  assert.equal(compileIntent('web viewer, no compression').compress, false);
});

test('sales webhook records paid orders', async () => {
  const env = { TRIALS: memoryKv(), LEMONSQUEEZY_WEBHOOK_SECRET: 'whsec' };
  const body = JSON.stringify({ meta: { event_name: 'order_created' }, data: { id: '42', attributes: { first_order_item: { product_id: 1420844 }, test_mode: false, status: 'paid', total: 9.99, currency: 'gbp', created_at: '2026-10-09T00:00:00Z' } } });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const res = await worker.fetch(new Request('https://www.assetbench.co.uk/api/sales-webhook', { method: 'POST', headers: { 'X-Signature': sig }, body }), env, {});
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(env.TRIALS.store.get('site-sale:42').value), { productId: 1420844, cents: 999, currency: 'GBP', createdAt: '2026-10-09T00:00:00Z' });
});
