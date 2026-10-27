import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { rulePlan } from '../worker/api/ai.js';

function memoryKv() {
  const store = new Map();
  return {
    async get(key, type) { const v = store.get(key) ?? null; return v && type === 'json' ? JSON.parse(v) : v; },
    async put(key, value) { store.set(key, String(value)); },
    async delete(key) { store.delete(key); },
    async getWithMetadata() { return { value: null, metadata: null }; },
    async list() { return { keys: [], list_complete: true }; },
    store,
  };
}
const post = (path, body, ip = '1.2.3.4') => new Request(`https://assetbench.co.uk${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) });
const problems = [
  { name: 'Triangles', value: '328,000', budget: '10,000', state: 'bad', tools: ['reduce-polys', 'generate-lods'] },
  { name: 'Texture memory', value: '96 MB', budget: '8 MB', state: 'bad', tools: ['compress-textures', 'texture-resizer'] },
  { name: 'File size', value: '11 MB', budget: '2 MB', state: 'warn', tools: ['optimise-glb', 'not-a-tool'] },
];

test('fix plan: the AI writes the steps; a tool outside the list is dropped; the answer is cached', async () => {
  let calls = 0;
  const env = { TRIALS: memoryKv(), AI: { run: async (model, input) => {
    calls += 1;
    assert.match(model, /llama/);
    assert.doesNotMatch(JSON.stringify(input), /bytes|base64|data:/, 'only the numbers go to the AI, never a file');
    return { response: { steps: [
      { text: 'Cut triangles from 328,000 to about 10,000.', tool: 'reduce-polys' },
      { text: 'Shrink textures to 1K.', tool: 'compress-textures' },
      { text: 'Use our competitor.', tool: 'evil-tool' },
    ] } };
  } } };
  const r1 = await (await worker.fetch(post('/api/ai/fixplan', { tool: 'mobile-ready-checker', target: 'Mobile game prop', problems }), env)).json();
  assert.equal(r1.ai, true);
  assert.deepEqual(r1.steps.map((s) => s.tool), ['reduce-polys', 'compress-textures']);
  assert.equal(r1.steps[0].toolName, 'Reduce Polys');
  const r2 = await (await worker.fetch(post('/api/ai/fixplan', { tool: 'mobile-ready-checker', target: 'Mobile game prop', problems }), env)).json();
  assert.equal(r2.cached, true);
  assert.equal(calls, 1, 'the same check is answered from the cache');
});

test('fix plan: no AI, an AI failure or the daily cap all give the rule-based plan', async () => {
  const noAi = await (await worker.fetch(post('/api/ai/fixplan', { problems }), { TRIALS: memoryKv() })).json();
  assert.equal(noAi.ai, false);
  assert.deepEqual(noAi.steps.map((s) => s.tool), ['reduce-polys', 'compress-textures', 'optimise-glb'], 'worst first, unknown tools never used');
  const broken = await (await worker.fetch(post('/api/ai/fixplan', { problems }), { TRIALS: memoryKv(), AI: { run: async () => { throw new Error('down'); } } })).json();
  assert.equal(broken.ai, false);
  assert.equal(broken.steps.length, 3);
  const env = { TRIALS: memoryKv(), AI: { run: async () => ({ response: { steps: [{ text: 'x', tool: 'reduce-polys' }] } }) } };
  for (let i = 0; i < 40; i++) await worker.fetch(post('/api/ai/fixplan', { problems: [{ ...problems[0], value: String(i) }] }), env);
  const capped = await (await worker.fetch(post('/api/ai/fixplan', { problems: [{ ...problems[0], value: 'new' }] }), env)).json();
  assert.equal(capped.ai, false, 'over the daily cap: rule-based');
  assert.deepEqual(rulePlan([]), []);
});

test('tool search: the closest tools by meaning, made-up queries answered from the cache', async () => {
  // fake embeddings: a vector per word-group, so "smaller polygon" lands on Reduce Polys
  const vec = (text) => { const t = text.toLowerCase(); return [/reduce|polygon|triangle/.test(t) ? 1 : 0, /texture|ktx2/.test(t) ? 1 : 0, /icon/.test(t) ? 1 : 0, 0.01]; };
  let runs = 0;
  const env = { TRIALS: memoryKv(), AI: { run: async (model, input) => { runs += 1; assert.match(model, /bge/); return { data: input.text.map(vec) }; } } };
  const r = await (await worker.fetch(post('/api/ai/route', { q: 'make my model have fewer polygons' }), env)).json();
  assert.ok(r.tools.length >= 1);
  assert.ok(r.tools.every((t) => t.route && t.name));
  assert.ok(r.tools.some((t) => t.id === 'reduce-polys'), JSON.stringify(r.tools));
  const before = runs;
  const again = await (await worker.fetch(post('/api/ai/route', { q: 'make my model have fewer polygons' }), env)).json();
  assert.equal(again.cached, true);
  assert.equal(runs, before);
  const tiny = await (await worker.fetch(post('/api/ai/route', { q: 'hi' }), env)).json();
  assert.deepEqual(tiny.tools, []);
});
