import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderLlmsTxt, renderLlmsFull } from '../scripts/seo-pages.mjs';
import { TOOLS } from '../src/shared/config/tools.js';

const live = TOOLS.filter((t) => t.status === 'available' || t.status === 'beta');

test('llms.txt follows llmstxt.org: H1, summary, then link lists', () => {
  const txt = renderLlmsTxt();
  assert.match(txt, /^# Asset Bench\n\n> \S/);
  assert.ok(txt.includes('(https://www.assetbench.co.uk/llms-full.txt)'));
  assert.ok(txt.includes('(https://www.assetbench.co.uk/api/v1/openapi.json)'));
});

test('llms.txt links every live tool exactly once, and no coming-soon tool', () => {
  const txt = renderLlmsTxt();
  for (const t of live) assert.equal(txt.split(`](https://www.assetbench.co.uk${t.route})`).length - 1, 1, t.id);
  for (const t of TOOLS.filter((x) => x.status === 'coming-soon')) assert.ok(!txt.includes(`${t.route})`), t.id);
});

test('llms-full.txt has a section per live tool with its guide', () => {
  const full = renderLlmsFull();
  for (const t of live) assert.ok(full.includes(`URL: https://www.assetbench.co.uk${t.route}\n`), t.id);
  assert.ok(full.includes('#### How to turn a 3D model into isometric game sprites'));
  assert.ok(!/\n{3,}/.test(full), 'no runs of blank lines');
});

test('robots.txt welcomes AI crawlers, keeps /api/ private and lists the sitemap', async () => {
  const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) assert.match(robots, new RegExp(`^User-agent: ${bot}$`, 'm'));
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Allow: \/api\/v1\/openapi\.json$/m);
  assert.match(robots, /^Sitemap: https:\/\/www\.assetbench\.co\.uk\/sitemap\.xml$/m);
});
