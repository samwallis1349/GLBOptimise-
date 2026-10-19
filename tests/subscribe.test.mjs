import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function memoryKv() {
  const store = new Map();
  return {
    async get(key) { return store.get(key)?.value ?? null; },
    async put(key, value, { metadata } = {}) { store.set(key, { value, metadata }); },
    async list({ prefix }) {
      const keys = [...store].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.metadata }));
      return { keys, list_complete: true };
    },
  };
}

const subscribe = (email) => new Request('https://x.test/api/subscribe', { method: 'POST', body: JSON.stringify({ email, source: 'colossus-download' }) });

test('subscribe stores one record per address and exports CSV to the owner only', async () => {
  const env = { TRIALS: memoryKv(), STATS_KEY: 'owner-secret' };
  assert.equal((await worker.fetch(subscribe('Sam@Example.com'), env)).status, 200);
  assert.equal((await worker.fetch(subscribe('sam@example.com'), env)).status, 200); // same address, any case
  assert.equal((await worker.fetch(subscribe('not-an-email'), env)).status, 400);

  const exportReq = (auth) => new Request('https://x.test/api/subscribe', { headers: auth ? { Authorization: auth } : {} });
  assert.equal((await worker.fetch(exportReq(), env)).status, 401);
  assert.equal((await worker.fetch(exportReq('Bearer wrong'), env)).status, 401);

  const csv = await (await worker.fetch(exportReq('Bearer owner-secret'), env)).text();
  const rows = csv.split('\n');
  assert.equal(rows.length, 2);
  assert.match(rows[1], /^"sam@example.com","colossus-download","\d{4}-/);
});
