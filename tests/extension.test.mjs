import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { analyseGlb } from '../worker/api/glb.js';
import { memoryKv, sphereGlb } from './helpers/apiFixtures.mjs';
import { reduceGlb, requestFreeKey } from '../extensions/chrome/api.js';

// The Chrome extension's API module, driven against the Worker in-process.
function setup() {
  const env = { TRIALS: memoryKv() };
  const fetchImpl = (url, init) =>
    worker.fetch(new Request(url, { ...init, headers: { ...init?.headers, 'CF-Connecting-IP': '203.0.113.7' } }), env, {});
  return { fetchImpl, base: 'https://www.assetbench.co.uk' };
}

test('extension: free key, then reduce a GLB to the requested fraction', async () => {
  const { fetchImpl, base } = setup();
  const key = await requestFreeKey({ base, fetchImpl });
  assert.match(key, /^abk_/);

  const glb = await sphereGlb(120, { textureSize: [256, 256] });
  const file = new File([glb], 'sphere.glb', { type: 'model/gltf-binary' });
  const { bytes, name, report } = await reduceGlb({ file, name: file.name, key, keep: 0.3, base, fetchImpl });
  assert.equal(name, 'sphere-reduced.glb');
  const out = analyseGlb(bytes);
  assert.equal(out.triangles, report.after.triangles);
  assert.ok(Math.abs(out.triangles - report.before.triangles * 0.3) < report.before.triangles * 0.05);
});

test('extension: second free key on the same network, and bad keys, give clear errors', async () => {
  const { fetchImpl, base } = setup();
  await requestFreeKey({ base, fetchImpl });
  await assert.rejects(requestFreeKey({ base, fetchImpl }), { code: 'trial_already_issued' });

  const file = new File([await sphereGlb(40)], 'a.glb');
  await assert.rejects(reduceGlb({ file, name: 'a.glb', key: 'abk_live_nope', keep: 0.5, base, fetchImpl }), { code: 'invalid_api_key' });
  await assert.rejects(reduceGlb({ file, name: 'a.glb', key: '', keep: 0.5, base, fetchImpl }), { code: 'no_key' });
});
