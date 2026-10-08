import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function memoryKv() {
  const store = new Map();
  return {
    async get(key, type) {
      const val = store.get(key)?.value ?? null;
      if (val && type === 'json') {
        try { return JSON.parse(val); } catch { return null; }
      }
      return val;
    },
    async put(key, value, { metadata } = {}) {
      store.set(key, { value: String(value), metadata });
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix }) {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name, metadata: store.get(name)?.metadata }));
      return { keys, list_complete: true };
    },
  };
}

const req = (path, options = {}) =>
  new Request(`https://assetbench.co.uk${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

test('banner endpoints: create, read active, list, switch, and delete named banners', async () => {
  const env = { TRIALS: memoryKv() };

  // 1. Initially no active banner
  const getInitial = await worker.fetch(req('/api/banner'), env);
  assert.equal(getInitial.status, 200);
  assert.equal((await getInitial.json()).banner, null);

  // 2. Create banner 'ios-launch' with an image
  const post1 = await worker.fetch(
    req('/api/banner', {
      method: 'POST',
      body: JSON.stringify({
        name: 'ios-launch',
        title: 'New iOS 18 Tools Available',
        text: 'Generate App Store screenshots and icons in browser.',
        mediaUrl: '/images/hero.webp',
        linkUrl: '/app-icon-generator',
        linkText: 'Open Tool →',
      }),
    }),
    env
  );
  assert.equal(post1.status, 200);
  const data1 = await post1.json();
  assert.equal(data1.ok, true);
  assert.equal(data1.banner.name, 'ios-launch');
  assert.equal(data1.banner.mediaType, 'image');

  // 3. GET /api/banner returns the active 'ios-launch' banner
  const getActive1 = await worker.fetch(req('/api/banner'), env);
  const active1 = await getActive1.json();
  assert.equal(active1.active, 'ios-launch');
  assert.equal(active1.banner.title, 'New iOS 18 Tools Available');

  // 4. Create a second banner 'video-tutorial' with mp4 video
  const post2 = await worker.fetch(
    req('/api/banner', {
      method: 'POST',
      body: JSON.stringify({
        name: 'video-tutorial',
        title: 'Watch the GLB Optimization Workflow',
        text: 'Step by step guide to mobile asset pipelines.',
        mediaUrl: 'https://cdn.example.com/walkthrough.mp4',
        linkUrl: '/optimise-glb',
        active: false, // keep 'ios-launch' active for now
      }),
    }),
    env
  );
  assert.equal(post2.status, 200);
  const data2 = await post2.json();
  assert.equal(data2.banner.name, 'video-tutorial');
  assert.equal(data2.banner.mediaType, 'video');

  // 5. Active banner is still 'ios-launch'
  const getActive2 = await worker.fetch(req('/api/banner'), env);
  assert.equal((await getActive2.json()).active, 'ios-launch');

  // 6. GET /api/banner?name=video-tutorial accesses named banner directly
  const getNamed = await worker.fetch(req('/api/banner?name=video-tutorial'), env);
  assert.equal((await getNamed.json()).banner.name, 'video-tutorial');

  // 7. GET /api/banners lists all named banners
  const getList = await worker.fetch(req('/api/banners'), env);
  const listData = await getList.json();
  assert.equal(listData.count, 2);
  assert.deepEqual(
    listData.banners.map((b) => b.name).sort(),
    ['ios-launch', 'video-tutorial']
  );

  // 8. POST /api/banner/active switches the live homepage banner to 'video-tutorial'
  const switchRes = await worker.fetch(
    req('/api/banner/active', {
      method: 'POST',
      body: JSON.stringify({ name: 'video-tutorial' }),
    }),
    env
  );
  assert.equal(switchRes.status, 200);

  // 9. Now GET /api/banner returns 'video-tutorial'
  const getActive3 = await worker.fetch(req('/api/banner'), env);
  assert.equal((await getActive3.json()).active, 'video-tutorial');

  // 10. DELETE /api/banner?name=ios-launch deletes the named banner
  const delRes = await worker.fetch(req('/api/banner?name=ios-launch', { method: 'DELETE' }), env);
  assert.equal(delRes.status, 200);

  const getListAfter = await worker.fetch(req('/api/banners'), env);
  assert.equal((await getListAfter.json()).count, 1);
});

test('banner authorization rejects unauthorized modification when secret is set', async () => {
  const env = { TRIALS: memoryKv(), BANNER_SECRET: 'super-secret-key-123' };

  // Unauthorized POST
  const unauth = await worker.fetch(
    req('/api/banner', {
      method: 'POST',
      body: JSON.stringify({ name: 'hack', title: 'Unauthorized' }),
    }),
    env
  );
  assert.equal(unauth.status, 401);

  // Authorized POST via Bearer token
  const auth = await worker.fetch(
    req('/api/banner', {
      method: 'POST',
      headers: { Authorization: 'Bearer super-secret-key-123' },
      body: JSON.stringify({ name: 'good-post', title: 'Authorized Post' }),
    }),
    env
  );
  assert.equal(auth.status, 200);
  assert.equal((await auth.json()).ok, true);

  // Authorized POST via query param ?key=
  const authQuery = await worker.fetch(
    req('/api/banner?key=super-secret-key-123', {
      method: 'POST',
      body: JSON.stringify({ name: 'query-post', title: 'Query Auth Post' }),
    }),
    env
  );
  assert.equal(authQuery.status, 200);
});
