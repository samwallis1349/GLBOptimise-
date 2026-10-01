import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { placeAtRowStart, rankByUsage } from '../src/services/UsageService.js';

function memoryKv() {
  const store = new Map();
  return {
    async get(key) { return store.get(key)?.value ?? null; },
    async getWithMetadata(key) { const e = store.get(key); return { value: e?.value ?? null, metadata: e?.metadata ?? null }; },
    async put(key, value, { metadata } = {}) { store.set(key, { value, metadata }); },
    async list({ prefix }) {
      const keys = [...store].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.metadata }));
      return { keys, list_complete: true };
    },
  };
}

const post = (tool) => new Request('https://x.test/api/usage', { method: 'POST', body: JSON.stringify({ tool }) });

test('usage endpoint counts opens per tool and rejects unknown ids', async () => {
  const env = { TRIALS: memoryKv() };
  for (const tool of ['line-studio', 'line-studio', 'pack-pbr']) {
    assert.equal((await worker.fetch(post(tool), env)).status, 200);
  }
  assert.equal((await worker.fetch(post('not-a-tool'), env)).status, 400);

  const res = await worker.fetch(new Request('https://x.test/api/usage'), env);
  assert.deepEqual((await res.json()).counts, { 'line-studio': 2, 'pack-pbr': 1 });
});

test('rankByUsage keeps pins first, sorts by count, ties keep input order', () => {
  const tools = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const ranked = rankByUsage(tools, { b: 1, d: 5, e: 1 }, ['c']).map((t) => t.id);
  assert.deepEqual(ranked, ['c', 'd', 'b', 'e', 'a']);
});

test('placeAtRowStart puts a tool first in row two, counting wide cards and wraps', () => {
  const ids = (list) => list.map((t) => t.id);
  const tools = ['a', 'b', 'c', 'd', 'e', 'x'].map((id) => ({ id }));
  assert.deepEqual(ids(placeAtRowStart(tools, 'x')), ['a', 'b', 'c', 'd', 'x', 'e']);
  // A 2-wide first card fills half of row one.
  const wide = placeAtRowStart(tools, 'x', { span: (t) => (t.id === 'a' ? 2 : 1) });
  assert.deepEqual(ids(wide), ['a', 'b', 'c', 'x', 'd', 'e']);
});
