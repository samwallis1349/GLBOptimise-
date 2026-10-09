import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { decode as decodePng } from 'fast-png';
import worker from '../worker/index.js';
import { compileIntent } from '../worker/api/intent.js';
import { fitSize } from '../worker/api/images.js';
import { analyseGlb } from '../worker/api/glb.js';
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { memoryKv, pngBytes, sphereGlb } from './helpers/apiFixtures.mjs';

// The Worker bundles the Basis encoder .wasm as a module; under Node it is injected.
globalThis.__ASSETBENCH_BASIS_WASM__ = await WebAssembly.compile(readFileSync(new URL('../node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm', import.meta.url)));

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
  assert.deepEqual(pricing.plans.map((p) => [p.id, p.price.amount, p.quota]), [['trial', 0, 100]], 'free launch hides paid plans');
  const paid = await (await worker.fetch(new Request('https://www.assetbench.co.uk/api/v1/pricing'), { API_PAID_PLANS: 'on' }, {})).json();
  assert.deepEqual(paid.plans.map((p) => [p.id, p.price.amount]), [['trial', 0], ['studio2d', 29], ['studio3d', 79], ['all', 99]]);
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
  const usageKey = [...env.TRIALS.store.keys()].find((k) => k.startsWith('apikey:') && JSON.parse(env.TRIALS.store.get(k).value).plan === 'trial').replace('apikey:', 'apiuse:') + `:${new Date().toISOString().slice(0, 7)}`;
  await env.TRIALS.put(usageKey, '', { metadata: { count: 100 } });
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
