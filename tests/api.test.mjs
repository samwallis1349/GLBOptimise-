import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { decode as decodePng } from 'fast-png';
import worker from '../worker/index.js';
import { compileIntent } from '../worker/api/intent.js';
import { fitSize, sniffImage } from '../worker/api/images.js';
import { analyseGlb, readDocument } from '../worker/api/glb.js';
import { fitTo, sloppyTo, triangleCount } from '../worker/api/collision.js';
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { Document, NodeIO } from '@gltf-transform/core';
import { quantize } from '@gltf-transform/functions';
import { memoryKv, pngBytes, sphereGlb } from './helpers/apiFixtures.mjs';

// The Worker bundles the Basis encoder and libwebp .wasm as modules; under Node they are injected.
const wasmFile = (path) => WebAssembly.compile(readFileSync(new URL(`../node_modules/${path}`, import.meta.url)));
globalThis.__ASSETBENCH_BASIS_WASM__ = await wasmFile('ktx2-encoder/dist/basis/basis_encoder.wasm');
globalThis.__ASSETBENCH_WEBP_WASM__ = { dec: await wasmFile('@jsquash/webp/codec/dec/webp_dec.wasm'), enc: await wasmFile('@jsquash/webp/codec/enc/webp_enc_simd.wasm') };
globalThis.__ASSETBENCH_DRACO_WASM__ = await wasmFile('three/examples/jsm/libs/draco/gltf/draco_decoder.wasm');
globalThis.self ??= globalThis; // the libwebp glue reads self.location; workerd defines self, Node does not
const { decodeWebp, encodeWebp } = await import('../worker/api/webp.js');

const ADMIN = 'owner-secret-long-enough-for-tests';

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
  assert.deepEqual(pricing.plans.map((p) => [p.id, p.price.amount, p.quota]), [['trial', 0, 100], ['allaccess', 10, 1000], ['all', 50, 5000]], 'retired plans are never listed');
  assert.deepEqual(pricing.products.map((p) => p.id), ['check', 'game-ready', 'app-assets']);
  assert.ok(pricing.advanced.includes('POST /api/v1/3d/reduce'));
  assert.ok((await (await call('/api/v1/targets')).json()).targets.prop);
  const intent = await (await call('/api/v1/intent?target=shopify%20viewer')).json();
  assert.equal(intent.target, 'web');
});

test('a real endpoint asked with the wrong method is a 405, an unknown path a 404', async () => {
  const { call } = setup();
  for (const path of ['/api/v1/auth/keys', '/api/v1/track']) {
    const res = await call(path);
    assert.equal(res.status, 405, path);
    assert.equal((await res.json()).error.code, 'method_not_allowed');
  }
  assert.equal((await call('/api/v1/nope')).status, 404);
});

test('one working free key per network, never a paid plan without the owner key', async () => {
  const { call } = setup();
  const req = (ip, body = {}) => call('/api/v1/auth/keys', { method: 'POST', headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const first = await req('203.0.113.9', { plan: 'all' });
  assert.equal(first.status, 201);
  const body = await first.json();
  assert.match(body.key, /^abk_live_[a-f0-9]{48}$/);
  assert.equal(body.plan, 'trial');
  assert.equal(body.replacedPreviousKey, undefined);

  // Asking again from the same network replaces the key; the old one stops working.
  const again = await (await req('203.0.113.9')).json();
  assert.equal(again.replacedPreviousKey, true);
  assert.notEqual(again.key, body.key);
  const old = await call('/api/v1/auth/me', { headers: auth(body.key) });
  assert.equal(old.status, 403);
  assert.equal((await old.json()).error.code, 'key_replaced');
  assert.equal((await call('/api/v1/auth/me', { headers: auth(again.key) })).status, 200);

  // Same IPv6 /64 counts as the same network.
  const v6 = await (await req('2001:db8:1:2:aaaa::1')).json();
  assert.equal(v6.replacedPreviousKey, undefined);
  assert.equal((await (await req('2001:db8:1:2:bbbb::2')).json()).replacedPreviousKey, true, 'same IPv6 /64');
});

test('replacing a free key carries this month\'s usage over', async () => {
  const { call } = setup();
  const req = () => call('/api/v1/auth/keys', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.20', 'Content-Type': 'application/json' }, body: '{}' });
  const { key } = await (await req()).json();
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await call('/api/v1/3d/optimize?ratio=0.5', { method: 'POST', headers: auth(key), body: await getSphere() })).status, 200);
  }
  const { key: next } = await (await req()).json();
  const me = await (await call('/api/v1/auth/me', { headers: auth(next) })).json();
  assert.equal(me.quota.used, 2);
});

test('keys are required and validated; only hashes are stored', async () => {
  const { call, env, mint } = setup();
  const key = await mint('all');
  assert.equal((await call('/api/v1/auth/me')).status, 401);
  assert.equal((await call('/api/v1/auth/me', { headers: auth(`abk_live_${'0'.repeat(48)}`) })).status, 401);
  const me = await (await call('/api/v1/auth/me', { headers: auth(key) })).json();
  assert.equal(me.plan.id, 'all');
  assert.equal(me.quota.remaining, 5000);
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

test('reduce cuts triangles by ratio or to a target count, geometry only', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const before = analyseGlb(await getSphere()).triangles;

  const res = await call('/api/v1/3d/reduce?ratio=0.25', { method: 'POST', headers: auth(key), body: await getSphere() });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'model/gltf-binary');
  const out = analyseGlb(new Uint8Array(await res.arrayBuffer()));
  assert.ok(Math.abs(out.triangles - before * 0.25) < before * 0.05);
  assert.equal(out.textures.length, analyseGlb(await getSphere()).textures.length);

  const j = await (await call('/api/v1/3d/reduce?triangles=5000&output=json', { method: 'POST', headers: auth(key), body: await getSphere() })).json();
  assert.equal(j.report.settings.targetTriangles, 5000);
  assert.ok(j.report.after.triangles <= 5000 * 1.1 && j.report.after.triangles < before);

  // Free: needs a key but never uses quota.
  const me = await (await call('/api/v1/auth/me', { headers: auth(key) })).json();
  assert.equal(me.quota.used, 0);
  assert.equal(res.headers.get('X-Quota-Remaining'), null);
  assert.equal((await call('/api/v1/3d/reduce', { method: 'POST', body: await getSphere() })).status, 401);

  const bad = await call('/api/v1/3d/reduce?triangles=-3', { method: 'POST', headers: auth(key), body: await getSphere() });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'invalid_triangles');
  const badError = await call('/api/v1/3d/reduce?error=2', { method: 'POST', headers: auth(key), body: await getSphere() });
  assert.equal((await badError.json()).error.code, 'invalid_error');
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
  const usageKey = [...env.TRIALS.store.keys()].find((k) => k.startsWith('apikey:') && JSON.parse(env.TRIALS.store.get(k).value).plan === 'trial').replace('apikey:', 'apiuse:') + `:${new Date().toISOString().slice(0, 7)}`;
  await env.TRIALS.put(usageKey, '', { metadata: { count: 100 } });
  const spent = await call('/api/v1/2d/resize', { method: 'POST', headers: auth(trial), body: pngBytes(64, 64) });
  assert.equal(spent.status, 429);
  assert.equal((await spent.json()).error.code, 'quota_exhausted');
});

test('Draco input is inspectable and decompressed for processing', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const bin = Uint8Array.from(Buffer.from('RFJBQ08CAgEBAAAACAwBCwAAA19bCgEBEFUEXOONRgL/AAAAAQABAAkDAAECAQEJAwAAAwEBAQADAwEwARADACSWEwokBAAAAAD/BwAAAAAAvwAAAL8AAAC/AACAPwsGAwEBAQEBQAEA/wAAAH8AAAD/AqFBCAAA', 'base64'));
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { NORMAL: 1, POSITION: 2 }, indices: 0, mode: 4, extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { NORMAL: 0, POSITION: 1 } } } }] }],
    accessors: [
      { componentType: 5123, count: 36, type: 'SCALAR' },
      { componentType: 5126, count: 24, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1] },
      { componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 118 }],
    buffers: [{ byteLength: 120 }],
    extensionsUsed: ['KHR_draco_mesh_compression'],
    extensionsRequired: ['KHR_draco_mesh_compression'],
  };
  let jsonStr = JSON.stringify(gltf);
  while (jsonStr.length % 4 !== 0) jsonStr += ' ';
  const json = new TextEncoder().encode(jsonStr);
  const glb = new Uint8Array(12 + 8 + json.length + 8 + bin.length);
  const dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true);
  dv.setUint32(12, json.length, true); dv.setUint32(16, 0x4e4f534a, true); glb.set(json, 20);
  dv.setUint32(20 + json.length, bin.length, true); dv.setUint32(24 + json.length, 0x004e4942, true); glb.set(bin, 28 + json.length);

  const inspectRes = await call('/api/v1/3d/inspect', { method: 'POST', headers: auth(key), body: glb });
  assert.equal(inspectRes.status, 200);
  assert.equal((await inspectRes.json()).stats.compression.draco, true);

  const res = await call('/api/v1/3d/optimize?output=json', { method: 'POST', headers: auth(key), body: glb });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.report.before.stats.compression.draco, true);
  assert.equal(body.report.after.stats.compression.draco, false, 'Draco extension is decoded and replaced with clean/Meshopt output');
  assert.equal(body.report.after.stats.triangles, 12);
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

test('sales webhook records paid orders (Lemon Squeezy totals are in pence)', async () => {
  const env = { TRIALS: memoryKv(), LEMONSQUEEZY_WEBHOOK_SECRET: 'whsec' };
  const body = JSON.stringify({ meta: { event_name: 'order_created' }, data: { id: '42', attributes: { first_order_item: { product_id: 1420844 }, test_mode: false, status: 'paid', total: 2500, currency: 'gbp', created_at: '2026-10-09T00:00:00Z' } } });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const res = await worker.fetch(new Request('https://www.assetbench.co.uk/api/sales-webhook', { method: 'POST', headers: { 'X-Signature': sig }, body }), env, {});
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(env.TRIALS.store.get('site-sale:42').value), { productId: 1420844, cents: 2500, currency: 'GBP', createdAt: '2026-10-09T00:00:00Z' });
});

test('game-ready runs the pipeline and returns an engine pack', async () => {
  const { call, mint } = setup();
  const key = await mint('studio3d');
  const glb = await sphereGlb(80, { textureSize: [3000, 1500], parts: 6, lift: 4 });
  const res = await call('/api/v1/3d/game-ready?device=low&role=prop&engine=unity', { method: 'POST', headers: { ...auth(key), 'x-filename': 'Crate Stack.glb' }, body: glb });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Disposition'), /Crate_Stack-low-unity\.zip/);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files).sort(), ['Crate_Stack_LOD0.glb', 'Crate_Stack_LOD1.glb', 'Crate_Stack_LOD2.glb', 'Crate_Stack_collision.glb', 'IMPORT-UNITY.md', 'REPORT.txt', 'report.json']);

  const report = JSON.parse(await zip.file('report.json').async('string'));
  assert.equal(report.budget.tris, 5000);
  assert.equal(report.budget.texMax, 512);
  assert.equal(report.before.stats.drawCalls, 6);
  assert.equal(report.after.stats.drawCalls, 1, 'parts sharing a material are merged');
  assert.ok(report.after.stats.triangles <= 5000 * 1.05);
  assert.equal(report.after.stats.largestTexture, 512);
  assert.equal(report.after.evaluation.verdict, 'mobile-ready');
  const [lod0, lod1, lod2] = report.files.filter((f) => f.kind === 'lod').map((f) => f.triangles);
  assert.ok(lod0 > lod1 && lod1 > lod2 && lod2 <= lod0 * 0.25, `${lod0}/${lod1}/${lod2}`);
  const collider = report.files.find((f) => f.kind === 'collision');
  assert.ok(collider.triangles <= 255, `Unity convex collider limit, got ${collider.triangles}`);
  assert.equal(analyseGlb(await zip.file('Crate_Stack_LOD0.glb').async('uint8array')).compression.meshopt, false, 'engines import uncompressed');

  // Pivot: the model now sits on the ground at the origin.
  const { NodeIO, getBounds } = await import('@gltf-transform/core');
  const doc = await new NodeIO().readBinary(await zip.file('Crate_Stack_LOD0.glb').async('uint8array'));
  const { min, max } = getBounds(doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0]);
  assert.ok(Math.abs(min[1]) < 1e-4, `bottom at y=0, got ${min[1]}`);
  assert.ok(Math.abs((min[0] + max[0]) / 2) < 1e-4);

  assert.match(await zip.file('IMPORT-UNITY.md').async('string'), /LOD Group/);
  assert.match(await zip.file('REPORT.txt').async('string'), /Merge parts to cut draw calls: 6 → 1/);
});

test('game-ready engine rules: web compresses, roblox caps, bad options rejected', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const glb = await sphereGlb(120);
  const web = await call('/api/v1/3d/game-ready?device=high&role=hero&engine=web&collision=false&lods=false&output=json', { method: 'POST', headers: auth(key), body: glb });
  const j = await web.json();
  assert.equal(j.report.files.length, 1);
  assert.equal(j.report.after.stats.compression.meshopt, true);

  const roblox = await (await call('/api/v1/devices')).json();
  assert.equal(roblox.roles.hero.budgets.high.tris, 80000);

  const bad = await call('/api/v1/3d/game-ready?engine=cryengine', { method: 'POST', headers: auth(key), body: glb });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'invalid_engine');
});

test('inspect scores every device class', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const j = await (await call('/api/v1/3d/inspect?role=character', { method: 'POST', headers: auth(key), body: await getSphere() })).json();
  assert.deepEqual(j.devices.results.map((d) => d.device), ['low', 'mid', 'high', 'quest']);
  assert.equal(j.devices.results.find((d) => d.device === 'high').triangleBudget, 40000);
});

test('check scores the role on a device, and says what it used', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const check = async (query) => (await call(`/api/v1/check?${query}`, { method: 'POST', headers: auth(key), body: await getSphere() })).json();

  const plain = await check('role=character&device=high&engine=godot');
  assert.equal(plain.evaluation.target, 'character/high', 'same budget /game-ready fits to');
  assert.deepEqual(plain.resolved, { role: 'character', device: 'high', engine: 'godot' });
  assert.equal(plain.evaluation.checks.find((c) => c.key === 'triangles').budget, 40000);

  assert.equal((await check('role=prop')).evaluation.target, 'prop/mid', 'device defaults to mid-range');

  const vague = await check('role=character&target=mobile');
  assert.equal(vague.evaluation.target, 'character/mid', 'a target that names no use is ignored');
  assert.match(vague.notes.join(' '), /target 'mobile' names no use/);
  assert.equal((await check('role=character&target=web')).evaluation.target, 'web', 'a built-in target still wins');
  assert.equal((await check('target=Quest%203%20VR%20level')).evaluation.target, 'quest', 'a described use still wins');

  const unknown = await check('role=dragon&device=toaster&engine=cryengine');
  assert.deepEqual(unknown.resolved, { role: 'prop', device: 'mid', engine: 'unity' });
  for (const word of ["role 'dragon'", "device 'toaster'", "engine 'cryengine'"]) assert.match(unknown.notes.join(' '), new RegExp(`Unknown ${word}`));

  const legacy = await (await call('/api/v1/3d/audit?role=character', { method: 'POST', headers: auth(key), body: await getSphere() })).json();
  assert.equal(legacy.evaluation.target, 'character/mid', 'the old path answers the same');
});

test('product paths: game-ready, app-assets (every platform) and screenshots', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const icons = await call('/api/v1/app-assets', { method: 'POST', headers: auth(key), body: pngBytes(1024, 1024) });
  assert.equal(icons.status, 200);
  assert.deepEqual(JSON.parse(icons.headers.get('X-AssetBench-Summary')).platforms, ['ios', 'android', 'watchos']);
  const shots = await call('/api/v1/app-assets/screenshots?devices=iphone-6.9', { method: 'POST', headers: auth(key), body: pngBytes(645, 1398) });
  assert.equal(shots.status, 200);
  const pack = await call('/api/v1/game-ready?role=prop&device=mid', { method: 'POST', headers: auth(key), body: await sphereGlb(20) });
  assert.equal(pack.status, 200);
  assert.equal(pack.headers.get('Content-Type'), 'application/zip');
  const batch = new FormData();
  batch.append('operation', 'check');
  batch.append('files', new Blob([await sphereGlb(10)]), 'a.glb');
  assert.equal((await call('/api/v1/batch', { method: 'POST', headers: auth(key), body: batch })).status, 200, 'batch takes product names');
});

test('audit scores always sit in their verdict band', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const j = await (await call('/api/v1/3d/audit?role=prop', { method: 'POST', headers: auth(key), body: await getSphere() })).json();
  const band = (s) => (s >= 90 ? 'mobile-ready' : s >= 60 ? 'needs-work' : 'not-ready');
  for (const r of [j.evaluation, ...j.devices.results]) assert.equal(r.verdict, band(r.score), `${r.name ?? r.targetName}: ${r.score} is ${r.verdict}`);
  assert.ok(j.evaluation.score < 60, 'a check over twice its budget keeps the score under 60');
});

const isKtx2 = (u8) => [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30].every((b, i) => u8[i] === b);

test('KTX2: images and GLB textures', async () => {
  const { call, mint } = setup();
  const key = await mint('studio2d');
  const img = await call('/api/v1/textures/ktx2?mode=etc1s', { method: 'POST', headers: auth(key), body: pngBytes(100, 60) });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('Content-Type'), 'image/ktx2');
  assert.ok(isKtx2(new Uint8Array(await img.arrayBuffer())));
  assert.deepEqual([JSON.parse(img.headers.get('X-AssetBench-Summary')).width, JSON.parse(img.headers.get('X-AssetBench-Summary')).height], [128, 64], 'snapped to powers of two');

  const glb = await call('/api/v1/textures/ktx2', { method: 'POST', headers: auth(key), body: await sphereGlb(10, { textureSize: [64, 64] }) });
  assert.equal(glb.status, 200);
  const stats = analyseGlb(new Uint8Array(await glb.arrayBuffer()));
  assert.equal(stats.compression.ktx2, true);
  assert.equal(stats.textures[0].mimeType, 'image/ktx2');
});

test('convert: GLB to OBJ and glTF and back keeps geometry and textures; FBX output refused', async () => {
  const { call, mint } = setup();
  const key = await mint('studio3d');
  const glb = await sphereGlb(20, { textureSize: [64, 64], parts: 2 });
  for (const to of ['obj', 'gltf']) {
    const res = await call(`/api/v1/3d/convert?to=${to}`, { method: 'POST', headers: { ...auth(key), 'x-filename': 'ball.glb' }, body: glb });
    assert.equal(res.status, 200, to);
    const zipBytes = new Uint8Array(await res.arrayBuffer());
    const files = Object.keys((await JSZip.loadAsync(zipBytes)).files);
    assert.ok(files.includes(`ball.${to}`), files.join());
    const back = await call('/api/v1/3d/convert', { method: 'POST', headers: { ...auth(key), 'x-filename': 'ball.zip' }, body: zipBytes });
    assert.equal(back.status, 200);
    const stats = analyseGlb(new Uint8Array(await back.arrayBuffer()));
    assert.equal(stats.triangles, 2 * 2 * 20 * 20);
    assert.equal(stats.textures.length, 1);
  }
  const fbx = await call('/api/v1/3d/convert?to=fbx', { method: 'POST', headers: auth(key), body: glb });
  assert.equal((await fbx.json()).error.code, 'fbx_output_unsupported');
  const junk = await call('/api/v1/3d/convert', { method: 'POST', headers: auth(key), body: new Uint8Array([1, 2, 3, 4, 5]) });
  assert.equal(junk.status, 415);
});

test('store screenshots: every device size, orientation follows the input, always opaque', async () => {
  const { call, mint } = setup();
  const key = await mint('studio2d');
  const form = new FormData();
  form.append('file', new Blob([pngBytes(400, 866, { alpha: true })]), 'home.png');
  form.append('file', new Blob([pngBytes(866, 400)]), 'map.png');
  form.append('devices', 'iphone-6.9,android-phone');
  const res = await call('/api/v1/ios/screenshots', { method: 'POST', headers: auth(key), body: form });
  assert.equal(res.status, 200);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const sizes = {};
  for (const name of Object.keys(zip.files).filter((n) => n.endsWith('.jpg'))) {
    const img = jpeg.decode(await zip.file(name).async('uint8array'), { useTArray: true });
    sizes[name] = `${img.width}x${img.height}`;
  }
  assert.deepEqual(sizes, {
    'iphone-6.9/01_home.jpg': '1320x2868',
    'android-phone/01_home.jpg': '1080x1920',
    'iphone-6.9/02_map.jpg': '2868x1320',
    'android-phone/02_map.jpg': '1920x1080',
  });
});

test('batch: one ZIP in, per-file results and manifest out, failures isolated, charged per success', async () => {
  const { call, mint } = setup();
  const key = await mint('studio3d');
  const zip = new JSZip();
  zip.file('a.glb', await sphereGlb(40));
  zip.file('nested/b.glb', await sphereGlb(60));
  zip.file('broken.glb', new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]));
  zip.file('readme.txt', 'ignored');
  const body = await zip.generateAsync({ type: 'uint8array' });

  const audit = await call('/api/v1/batch?operation=audit', { method: 'POST', headers: auth(key), body });
  const a = await audit.json();
  assert.equal(a.total, 3);
  assert.equal(a.succeeded, 2);
  assert.equal(a.files.find((f) => f.file === 'broken.glb').status, 'error');
  assert.equal(a.charged, 0);

  const opt = await call('/api/v1/batch?operation=optimize&target=prop', { method: 'POST', headers: auth(key), body });
  assert.equal(opt.status, 200);
  assert.equal(opt.headers.get('X-Quota-Remaining'), '148');
  const out = await JSZip.loadAsync(await opt.arrayBuffer());
  const manifest = JSON.parse(await out.file('manifest.json').async('string'));
  assert.deepEqual(manifest.files.map((f) => f.status), ['ok', 'error', 'ok']);
  assert.ok(out.file('results/a/a-optimised.glb'));

  assert.equal((await (await call('/api/v1/batch?operation=nope', { method: 'POST', headers: auth(key), body })).json()).error.code, 'invalid_operation');
});

test('game-ready with ktx2 for Unity mentions the KTX package; Unreal skips KTX2', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const glb = await sphereGlb(20, { textureSize: [64, 64] });
  const unity = await JSZip.loadAsync(await (await call('/api/v1/3d/game-ready?engine=unity&ktx2=true&lods=false&collision=false', { method: 'POST', headers: auth(key), body: glb })).arrayBuffer());
  const name = Object.keys(unity.files).find((n) => n.endsWith('_LOD0.glb'));
  assert.equal(analyseGlb(await unity.file(name).async('uint8array')).compression.ktx2, true);
  assert.match(await unity.file('IMPORT-UNITY.md').async('string'), /com\.unity\.cloud\.ktx/);
  const unreal = await (await call('/api/v1/3d/game-ready?engine=unreal&ktx2=true&lods=false&collision=false&output=json', { method: 'POST', headers: auth(key), body: glb })).json();
  assert.equal(unreal.report.after.stats.compression.ktx2, false);
  assert.ok(unreal.report.warnings.some((w) => w.includes('KTX2')));
});

test('a short owner key never unlocks owner actions', async () => {
  const env = { TRIALS: memoryKv(), API_ADMIN_KEY: '1234' };
  const res = await worker.fetch(new Request('https://www.assetbench.co.uk/api/v1/auth/keys', { method: 'POST', headers: { Authorization: 'Bearer 1234', 'CF-Connecting-IP': '198.51.100.7' }, body: JSON.stringify({ plan: 'all' }) }), env, {});
  assert.equal((await res.json()).plan, 'trial', 'falls back to a trial key');
});

test('Lemon Squeezy subscription lifecycle drives the license key as an API key', async () => {
  const env = { TRIALS: memoryKv(), LEMONSQUEEZY_WEBHOOK_SECRET: 'whsec', API_LS_PRODUCTS: JSON.stringify({ 900001: 'studio3d', 900002: 'all' }) };
  const sign = async (body) => {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const hook = async (event, attributes) => {
    const body = JSON.stringify({ meta: { event_name: event }, data: { id: '1', attributes } });
    const res = await worker.fetch(new Request('https://www.assetbench.co.uk/api/sales-webhook', { method: 'POST', headers: { 'X-Signature': await sign(body) }, body }), env, {});
    assert.equal(res.status, 200);
    return res.json();
  };
  const me = (k) => worker.fetch(new Request('https://www.assetbench.co.uk/api/v1/auth/me', { headers: { Authorization: `Bearer ${k}` } }), env, {});
  const license = '38B1460A-5104-4067-A91D-77B872934D51';

  // Subscription event first, license key second: order must not matter.
  await hook('subscription_created', { order_id: 77, product_id: 900001, status: 'active' });
  assert.match((await hook('license_key_created', { order_id: 77, product_id: 900001, key: license })).api, /key issued/);
  const ok = await (await me(license.toLowerCase())).json();
  assert.equal(ok.plan.id, 'studio3d');

  await hook('subscription_updated', { order_id: 77, product_id: 900002, status: 'active' });
  assert.equal((await (await me(license)).json()).plan.id, 'all', 'upgrade follows the product');

  await hook('subscription_updated', { order_id: 77, product_id: 900002, status: 'cancelled' });
  assert.equal((await me(license)).status, 200, 'cancelled keeps working until the period ends');

  await hook('subscription_expired', { order_id: 77, product_id: 900002, status: 'expired' });
  const off = await me(license);
  assert.equal(off.status, 403);
  assert.equal((await off.json()).error.code, 'subscription_inactive');

  await hook('subscription_updated', { order_id: 77, product_id: 900002, status: 'active' });
  assert.equal((await me(license)).status, 200, 'renewal turns it back on');

  assert.equal((await hook('license_key_created', { order_id: 78, product_id: 1420844, key: '11111111-2222-3333-4444-555555555555' })).ignored, true, 'site products are not API keys');
  assert.ok(![...env.TRIALS.store.values()].some((v) => v.value.includes(license)), 'raw license key never stored');
});

test('All Access includes the API: new keys by webhook, existing keys on first use', async () => {
  const env = { TRIALS: memoryKv(), LEMONSQUEEZY_WEBHOOK_SECRET: 'whsec', API_LS_PRODUCTS: JSON.stringify({ 1420844: 'allaccess', 1430376: 'all' }) };
  const sign = async (body) => {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const hook = async (event, attributes) => {
    const body = JSON.stringify({ meta: { event_name: event }, data: { id: String(attributes.order_id), attributes } });
    return (await worker.fetch(new Request('https://www.assetbench.co.uk/api/sales-webhook', { method: 'POST', headers: { 'X-Signature': await sign(body) }, body }), env, {})).json();
  };
  const me = (k) => worker.fetch(new Request('https://www.assetbench.co.uk/api/v1/auth/me', { headers: { Authorization: `Bearer ${k}` } }), env, {});

  // A new subscriber: the webhook issues the key, and the sale is still recorded for the site.
  assert.match((await hook('license_key_created', { order_id: 90, product_id: 1420844, key: 'AAAAAAAA-1111-2222-3333-444444444444' })).api, /key issued \(allaccess\)/);
  const plan = (await (await me('AAAAAAAA-1111-2222-3333-444444444444')).json()).plan;
  assert.deepEqual([plan.id, plan.name], ['allaccess', 'All Access']);
  const sale = await hook('order_created', { order_id: 90, first_order_item: { product_id: 1420844 }, total: 25, currency: 'GBP', status: 'paid' });
  assert.deepEqual(sale, { ok: true }, 'order_created still reaches site sales');

  // Someone who subscribed before the API was included: checked with Lemon Squeezy on first use.
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push(String(init.body));
    const key = new URLSearchParams(String(init.body)).get('license_key');
    const live = key === 'BBBBBBBB-1111-2222-3333-444444444444';
    return new Response(JSON.stringify(live
      ? { valid: true, license_key: { status: 'active' }, meta: { store_id: 480634, product_id: 1420844, order_id: 91 } }
      : { valid: true, license_key: { status: 'active' }, meta: { store_id: 480634, product_id: 1420925, order_id: 92 } }));
  };
  try {
    const first = await me('bbbbbbbb-1111-2222-3333-444444444444');
    assert.equal(first.status, 200);
    assert.equal((await first.json()).plan.id, 'allaccess');
    await me('BBBBBBBB-1111-2222-3333-444444444444');
    assert.equal(asked.length, 1, 'checked once, then remembered');

    assert.equal((await me('CCCCCCCC-1111-2222-3333-444444444444')).status, 401, 'a single-tool key does not include the API');
    await me('CCCCCCCC-1111-2222-3333-444444444444');
    assert.equal(asked.length, 2, 'a miss is cached too');
  } finally {
    globalThis.fetch = realFetch;
  }

  await hook('subscription_expired', { order_id: 91, product_id: 1420844, status: 'expired' });
  assert.equal((await me('BBBBBBBB-1111-2222-3333-444444444444')).status, 403, 'ending the subscription switches the key off');
});

test('launch metrics: anonymous counters and an owner-only stats endpoint', async () => {
  const { call, env, mint } = setup();
  for (const event of ['popup_shown', 'popup_shown', 'popup_click', 'docs_view']) {
    assert.equal((await call('/api/v1/track', { method: 'POST', body: JSON.stringify({ event }) })).status, 200);
  }
  assert.equal((await call('/api/v1/track', { method: 'POST', body: JSON.stringify({ event: 'anything' }) })).status, 400);
  const free = await (await call('/api/v1/auth/keys', { method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.44' }, body: '{}' })).json();
  await call('/api/v1/2d/resize?maxSize=64', { method: 'POST', headers: auth(free.key), body: pngBytes(128, 128) });
  await call('/api/v1/2d/resize', { method: 'POST', headers: auth(free.key), body: new Uint8Array([1, 2, 3]) });
  await mint('all');

  assert.equal((await call('/api/v1/stats')).status, 401);
  const stats = await (await call('/api/v1/stats', { headers: { Authorization: `Bearer ${ADMIN}` } })).json();
  assert.equal(stats.totals.popup_shown, 2);
  assert.equal(stats.popupClickRate, 0.5);
  assert.equal(stats.totals.key_issued, 1);
  assert.equal(stats.totals.key_minted_owner, 1);
  assert.equal(stats.totals['op:resize'], 1);
  assert.equal(stats.totals['error:unsupported_image'], 1);
  assert.equal(stats.downloads, 1);
  assert.ok(![...env.TRIALS.store.keys()].some((k) => k.startsWith('apistat:') && k.includes('192.0.2.44')), 'no identifiers in counters');
});

/** A WebP image with a gradient, so resizing and lossless round trips can be checked. */
async function webpBytes(width, height, { lossless = false } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = (i % width) * 255 / width; data[i * 4 + 1] = Math.floor(i / width) * 255 / height; data[i * 4 + 2] = 128; data[i * 4 + 3] = 255;
  }
  return encodeWebp({ width, height, data }, { lossless });
}

/** A sphere whose colour and normal maps are WebP, stored the way many exporters do it. */
async function webpTexturedGlb(size) {
  const doc = await new NodeIO().readBinary(await sphereGlb(40, { textureSize: [8, 8] }));
  const material = doc.getRoot().listMaterials()[0];
  material.getBaseColorTexture().setImage(await webpBytes(size, size)).setMimeType('image/webp');
  material.setNormalTexture(doc.createTexture('normal').setImage(await webpBytes(size, size, { lossless: true })).setMimeType('image/webp'));
  return new NodeIO().writeBinary(doc);
}

const webpImages = async (glb) => {
  const doc = await readDocument(new Uint8Array(glb));
  return doc.getRoot().listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), size: sniffImage(t.getImage()) }));
};

test('WebP: decode and encode, lossless round trips exactly', async () => {
  const lossless = await webpBytes(33, 17, { lossless: true });
  assert.deepEqual([sniffImage(lossless).width, sniffImage(lossless).height], [33, 17]);
  const back = await decodeWebp(lossless);
  const again = await decodeWebp(await encodeWebp(back, { lossless: true }));
  assert.deepEqual([...again.data], [...back.data], 'lossless keeps every pixel');
});

test('game-ready shrinks WebP textures and keeps them WebP', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const res = await call('/api/v1/game-ready?role=prop&device=mid&engine=unity&lods=false&collision=false', { method: 'POST', headers: auth(key), body: await webpTexturedGlb(2048) });
  assert.equal(res.status, 200);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const report = JSON.parse(await zip.file('report.json').async('string'));
  assert.ok(!report.warnings.some((w) => /webp/i.test(w)), report.warnings.join(' | '));
  const images = await webpImages(await zip.file(/_LOD0\.glb$/)[0].async('uint8array'));
  for (const img of images) {
    assert.equal(img.mime, 'image/webp', `${img.name} stays WebP`);
    assert.equal(img.size.mime, 'image/webp', `${img.name} bytes are WebP`);
    assert.equal(Math.max(img.size.width, img.size.height), 1024, `${img.name} fits the 1024px mid-range budget`);
  }
});

test('WebP normal maps are re-encoded lossless, colour maps lossy', async () => {
  const { downscaleTextures } = await import('../worker/api/mesh.js');
  const doc = await readDocument(new Uint8Array(await webpTexturedGlb(512)));
  const changed = await downscaleTextures(doc, 256, []);
  assert.deepEqual(changed.map((c) => [c.name, c.format, c.to, c.lossless]).sort(), [['albedo', 'webp', '256x256', false], ['normal', 'webp', '256x256', true]]);
});

test('KTX2 converts WebP textures and drops EXT_texture_webp', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const res = await call('/api/v1/textures/ktx2', { method: 'POST', headers: auth(key), body: await webpTexturedGlb(64) });
  assert.equal(res.status, 200);
  const glb = new Uint8Array(await res.arrayBuffer());
  const stats = analyseGlb(glb);
  assert.equal(stats.compression.ktx2, true);
  assert.equal(stats.compression.webp, false);
  assert.ok((await webpImages(glb)).every((t) => t.mime === 'image/ktx2'));
});

test('resize, KTX2 and OBJ export accept WebP', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const resized = await call('/api/v1/textures/resize?maxSize=64&format=webp', { method: 'POST', headers: auth(key), body: await webpBytes(300, 150) });
  assert.equal(resized.status, 200);
  assert.equal(resized.headers.get('Content-Type'), 'image/webp');
  assert.deepEqual(Object.values(sniffImage(new Uint8Array(await resized.arrayBuffer()))), ['image/webp', 64, 32]);
  const asPng = await call('/api/v1/textures/resize?maxSize=64', { method: 'POST', headers: auth(key), body: await webpBytes(64, 64) });
  assert.equal(asPng.headers.get('Content-Type'), 'image/webp', 'keeps the input format by default');
  assert.equal((await call('/api/v1/textures/ktx2', { method: 'POST', headers: auth(key), body: await webpBytes(64, 64) })).status, 200);

  const obj = await call('/api/v1/3d/convert?to=obj', { method: 'POST', headers: auth(key), body: await webpTexturedGlb(32) });
  assert.equal(obj.status, 200);
  const zip = await JSZip.loadAsync(await obj.arrayBuffer());
  const files_ = Object.keys(zip.files).filter((f) => f.startsWith('textures/') && !zip.files[f].dir);
  assert.ok(files_.length && files_.every((f) => f.endsWith('.png')), `WebP textures become PNG for OBJ: ${files_}`);
});

test('the coarse LOD pass works on quantized meshes (KHR_mesh_quantization)', async () => {
  const quantized = async () => {
    const doc = await new NodeIO().readBinary(await sphereGlb(60));
    await doc.transform(quantize({ quantizePosition: 14 }));
    return doc;
  };
  const doc = await quantized();
  assert.equal(doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getNormalized(), true, 'positions are quantized');
  const start = triangleCount(doc);
  await sloppyTo(doc, Math.round(start * 0.1));
  const tris = triangleCount(doc);
  assert.ok(tris <= start * 0.1 * 1.25, `coarse pass: ${start} -> ${tris} (it used to skip quantized meshes)`);

  const fit = await fitTo(await quantized(), Math.round(start * 0.2), { error: 0.08, allowSloppy: true });
  assert.ok(fit.triangles <= start * 0.2 * 1.25, `fitTo reached ${fit.triangles} of ${Math.round(start * 0.2)}`);
});

test('game-ready LODs halve triangles and textures per level', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const res = await call('/api/v1/game-ready?role=prop&device=high&engine=godot&collision=false', { method: 'POST', headers: auth(key), body: await sphereGlb(90, { textureSize: [2048, 2048] }) });
  assert.equal(res.status, 200);
  const report = JSON.parse(await (await JSZip.loadAsync(await res.arrayBuffer())).file('report.json').async('string'));
  const lods = report.files.filter((f) => f.kind === 'lod');
  assert.deepEqual(lods.map((f) => f.largestTexture), [2048, 1024, 512]);
  const [lod0, lod1, lod2] = lods.map((f) => f.triangles);
  assert.ok(lod1 <= lod0 * 0.5 * 1.25 && lod2 <= lod0 * 0.2 * 1.25, `LODs ${lod0} / ${lod1} / ${lod2}`);
  assert.ok(lods[2].bytes < lods[0].bytes, 'the far LOD file is smaller');
});

test('OpenAPI 3.1.0 specification endpoint returns machine-readable spec', async () => {
  const { call } = setup();
  const res = await call('/api/v1/openapi.json');
  assert.equal(res.status, 200);
  const spec = await res.json();
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.paths['/api/v1/check']);
  assert.ok(spec.paths['/api/v1/game-ready']);
  assert.ok(spec.paths['/api/v1/app-assets']);
  assert.ok(spec.components.securitySchemes.BearerAuth);
});

test('quota headers are attached to metered JSON, binary, and 429 responses', async () => {
  const { call, env, mint } = setup();
  const key = await mint('trial');

  const meRes = await call('/api/v1/auth/me', { headers: auth(key) });
  assert.equal(meRes.status, 200);
  assert.equal(meRes.headers.get('X-Quota-Limit'), '100');
  assert.equal(meRes.headers.get('X-Quota-Remaining'), '100');
  assert.ok(meRes.headers.get('X-Quota-Reset')?.endsWith('Z'));

  const optRes = await call('/api/v1/3d/optimize?output=json', { method: 'POST', headers: auth(key), body: await sphereGlb(10) });
  assert.equal(optRes.status, 200);
  assert.equal(optRes.headers.get('X-Quota-Limit'), '100');
  assert.equal(optRes.headers.get('X-Quota-Remaining'), '99');
  assert.ok(optRes.headers.get('X-Quota-Reset')?.endsWith('Z'));

  const usageKey = [...env.TRIALS.store.keys()].find((k) => k.startsWith('apiuse:'));
  await env.TRIALS.put(usageKey, '', { metadata: { count: 100 } });
  const exhausted = await call('/api/v1/2d/resize', { method: 'POST', headers: auth(key), body: pngBytes(32, 32) });
  assert.equal(exhausted.status, 429);
  assert.equal(exhausted.headers.get('X-Quota-Limit'), '100');
  assert.equal(exhausted.headers.get('X-Quota-Remaining'), '0');
  assert.ok(Number(exhausted.headers.get('Retry-After')) > 0);
});

test('remote URL inputs work for ?url= and JSON body and block SSRF private addresses', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const originalFetch = globalThis.fetch;
  const samplePng = pngBytes(64, 64);

  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'cdn.example.com') {
      return new Response(samplePng, { status: 200, headers: { 'Content-Type': 'image/png', 'Content-Length': String(samplePng.byteLength) } });
    }
    return new Response('not found', { status: 404 });
  };

  try {
    const viaQuery = await call('/api/v1/textures/resize?maxSize=32&url=https://cdn.example.com/assets/hero_albedo.png', {
      method: 'POST',
      headers: auth(key),
    });
    assert.equal(viaQuery.status, 200);
    assert.deepEqual(JSON.parse(viaQuery.headers.get('X-AssetBench-Summary')).to.width, 32);

    const viaJson = await call('/api/v1/textures/resize?maxSize=16', {
      method: 'POST',
      headers: { ...auth(key), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://cdn.example.com/assets/hero_albedo.png' }),
    });
    assert.equal(viaJson.status, 200);
    assert.deepEqual(JSON.parse(viaJson.headers.get('X-AssetBench-Summary')).to.width, 16);

    for (const blockedUrl of [
      'http://127.0.0.1/secret.png',
      'http://localhost:8080/secret.png',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/internal.png',
      'http://192.168.1.1/router.png',
      'https://[::1]/secret.png',
      'ftp://cdn.example.com/file.png',
    ]) {
      const ssrf = await call(`/api/v1/textures/resize?url=${encodeURIComponent(blockedUrl)}`, {
        method: 'POST',
        headers: auth(key),
      });
      assert.equal(ssrf.status, 400, `SSRF guard should reject ${blockedUrl}`);
      assert.equal((await ssrf.json()).error.code, 'invalid_url');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ZIP bomb protection rejects archives with too many entries', async () => {
  const { call, mint } = setup();
  const key = await mint('all');
  const zip = new JSZip();
  for (let i = 0; i < 205; i++) zip.file(`f_${i}.png`, new Uint8Array([1, 2, 3, 4]));
  const zipBytes = await zip.generateAsync({ type: 'uint8array' });
  const res = await call('/api/v1/batch?operation=check', {
    method: 'POST',
    headers: { ...auth(key), 'Content-Type': 'application/zip' },
    body: zipBytes,
  });
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error.code, 'zip_too_large');
});

test('illustration enquiry validates email and tool-binding hashes keys safely', async () => {
  const { call } = setup();
  const badEmail = await call('/api/illustration-enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sam', email: 'not-an-email', description: 'A hero illustration' }),
  });
  assert.equal(badEmail.status, 400);

  const okEmail = await call('/api/illustration-enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sam', email: 'sam@assetbench.co.uk', description: 'A hero illustration' }),
  });
  assert.equal(okEmail.status, 200);

  const bind1 = await call('/api/tool-binding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'ABCD-1234-EFGH-5678', toolId: 'inspect-glb' }),
  });
  assert.equal(bind1.status, 200);
  assert.equal((await bind1.json()).toolId, 'inspect-glb');

  // A different key with identical alphanumeric characters in different positions must not collide.
  const bind2 = await call('/api/tool-binding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'ABCD1234-EFGH5678', toolId: 'pack-pbr' }),
  });
  assert.equal(bind2.status, 200);
  assert.equal((await bind2.json()).toolId, 'pack-pbr');
});

