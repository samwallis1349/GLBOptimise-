import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { UsageCounter } from '../worker/index.js';
import { TOOLS, POPULARITY_ORDER, getOrderedTools } from '../src/shared/config/tools.js';
import { placeAtRowStart, placePairTogether, rankByUsage, rotateRow } from '../src/services/UsageService.js';

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

test('placePairTogether keeps a pair side by side, starting on an even column', () => {
  const ids = (list) => list.map((t) => t.id);
  const tools = ['a', 'p', 'b', 'c', 'd', 'q', 'e'].map((id) => ({ id }));
  // p ranked at column 1: the pair moves one slot to start on column 0.
  assert.deepEqual(ids(placePairTogether(tools, ['p', 'q'])), ['p', 'q', 'a', 'b', 'c', 'd', 'e']);
  // Other placements (here: 'a' pinned first) are applied to every try, so the pair goes the other way.
  const pinA = (list) => [list.find((t) => t.id === 'a'), ...list.filter((t) => t.id !== 'a')];
  assert.deepEqual(ids(placePairTogether(tools, ['p', 'q'], { arrange: pinA })), ['a', 'b', 'p', 'q', 'c', 'd', 'e']);
  // Already on an even column: just pulls the partner alongside.
  const even = ['a', 'b', 'p', 'c', 'q'].map((id) => ({ id }));
  assert.deepEqual(ids(placePairTogether(even, ['p', 'q'])), ['a', 'b', 'p', 'q', 'c']);
});

test('only mobile app dev tools have blue cardTheme', () => {
  const blueTools = TOOLS.filter((t) => t.cardTheme === 'blue').map((t) => t.id);
  assert.deepEqual(blueTools, ['app-icon-generator', 'app-store-screenshot-generator', 'xcassets-generator', 'mobile-ready-checker']);
});

test('POPULARITY_ORDER lists every tool exactly once', () => {
  assert.equal(new Set(POPULARITY_ORDER).size, POPULARITY_ORDER.length);
  assert.deepEqual([...POPULARITY_ORDER].sort(), TOOLS.map((t) => t.id).sort());
});

test('the most-used tool leads the grid, and a new leader takes over', () => {
  const ids = (counts) => rankByUsage(getOrderedTools(), counts).map((t) => t.id);
  const before = ids({ 'line-studio': 21, 'glb-builder': 14, 'pack-pbr': 3 });
  assert.deepEqual(before.slice(0, 3), ['line-studio', 'glb-builder', 'pack-pbr']);
  // Pack PBR overtakes: it moves to the top and everything else shifts down one.
  const after = ids({ 'line-studio': 21, 'glb-builder': 14, 'pack-pbr': 30 });
  assert.deepEqual(after.slice(0, 3), ['pack-pbr', 'line-studio', 'glb-builder']);
  assert.deepEqual(after.filter((id) => id !== 'pack-pbr'), before.filter((id) => id !== 'pack-pbr'));
});

test('with no counts yet, grids follow POPULARITY_ORDER', () => {
  const live = getOrderedTools().filter((t) => t.status !== 'coming-soon').map((t) => t.id);
  assert.deepEqual(rankByUsage(getOrderedTools(), {}).map((t) => t.id).slice(0, live.length), live);
  assert.equal(getOrderedTools()[0].id, POPULARITY_ORDER[0]);
});

test('rotateRow: the leader stays first, the next row takes turns among the next twelve', () => {
  const ranked = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}` }));
  const ids = (turn) => rotateRow(ranked, turn).map((t) => t.id);

  for (const turn of [0, 1, 2, 3, 7]) {
    const list = ids(turn);
    assert.equal(list[0], 't0', 'the most-used tool keeps first place');
    assert.equal(new Set(list).size, 20, 'every tool still appears once');
    assert.deepEqual(list.slice(13), ranked.slice(13).map((t) => t.id), 'tools below the pool keep their ranks');
  }
  assert.deepEqual(ids(0).slice(1, 5), ['t1', 't2', 't3', 't4']);
  assert.deepEqual(ids(1).slice(1, 5), ['t5', 't6', 't7', 't8']);
  assert.deepEqual(ids(2).slice(1, 5), ['t9', 't10', 't11', 't12']);
  assert.deepEqual(ids(3).slice(1, 5), ids(0).slice(1, 5), 'and round again');
  assert.deepEqual(ids(1).slice(5, 9), ['t1', 't2', 't3', 't4'], 'the rest of the pool follows in rank order');
});

// A stand-in for the USAGE Durable Object binding: one UsageCounter with in-memory storage.
function memoryUsage(env) {
  const store = new Map();
  const storage = {
    async get(key) { return store.get(key); },
    async put(key, value) { if (typeof key === 'object') for (const [k, v] of Object.entries(key)) store.set(k, v); else store.set(key, value); },
    async list() { return new Map([...store].sort()); },
  };
  const counter = new UsageCounter({ storage }, env);
  return { idFromName: (name) => name, get: () => ({ fetch: (url, init) => counter.fetch(new Request(url, init)) }) };
}
const hit = (tool, kind) => new Request('https://x.test/api/usage', { method: 'POST', body: JSON.stringify({ tool, kind }) });

test('the Durable Object counter keeps opens and runs, starting from the old KV opens', async () => {
  const env = { TRIALS: memoryKv() };
  await worker.fetch(post('line-studio'), env); // an old KV count from before the counter
  env.USAGE = memoryUsage(env);
  await Promise.all([hit('line-studio', 'open'), hit('line-studio', 'open'), hit('line-studio', 'run'), hit('pack-pbr', 'run')].map((r) => worker.fetch(r, env)));
  assert.equal((await worker.fetch(hit('line-studio', 'sneeze'), env)).status, 400);
  const body = await (await worker.fetch(new Request('https://x.test/api/usage'), env)).json();
  assert.deepEqual(body.opens, { 'line-studio': 3 }, 'the old KV count plus two new opens - none lost');
  assert.deepEqual(body.runs, { 'line-studio': 1, 'pack-pbr': 1 });
  assert.deepEqual(body.counts, body.opens, 'the grids still rank by opens');
  assert.ok(body.since);
});
