import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderNoindexPage, renderPage, renderSitemap } from '../scripts/seo-pages.mjs';
import { TOOLS } from '../src/shared/config/tools.js';
import { HOME_SEO } from '../src/shared/config/seo.js';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('index.html homepage tags match HOME_SEO', () => {
  assert.ok(indexHtml.includes(`<title>${HOME_SEO.title}</title>`));
  assert.ok(indexHtml.includes(`content="${HOME_SEO.description}"`));
});

test('tool pages get their own title, description, canonical and crawlable summary', () => {
  const html = renderPage(indexHtml, '/line-studio');
  assert.match(html, /<title>Line Studio — Free Colouring Page &amp; Line Art Cleaner \| Asset Bench<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.assetbench\.co\.uk\/line-studio"/);
  assert.match(html, /property="og:image"\s+content="https:\/\/www\.assetbench\.co\.uk\/thumbnails\/line-studio\.webp"/);
  assert.match(html, /<h1>Line Studio<\/h1>/);
  assert.match(html, /colouring book pages/);
  assert.doesNotMatch(html, /href="https:\/\/www\.assetbench\.co\.uk\/"/);
});

test('every tool renders without missing tags', () => {
  for (const tool of TOOLS) assert.doesNotThrow(() => renderPage(indexHtml, tool.route), tool.id);
});

test('sitemap lists every live tool', () => {
  const xml = renderSitemap();
  for (const tool of TOOLS) assert.ok(xml.includes(`<loc>https://www.assetbench.co.uk${tool.route}</loc>`), tool.id);
  assert.ok(xml.includes('<loc>https://www.assetbench.co.uk/pricing</loc>'));
});

test('sitemap dates each page from its source history, and omits dates without git', () => {
  const seen = [];
  const xml = renderSitemap({ lastmod: (paths) => { seen.push(paths); return '2026-10-10'; } });
  assert.equal((xml.match(/<lastmod>2026-10-10<\/lastmod>/g) || []).length, (xml.match(/<loc>/g) || []).length);
  assert.ok(seen.some((p) => p.includes('src/tools/reduce-polys')));
  assert.ok(seen.some((p) => p.includes('public/docs')));
  assert.ok(!renderSitemap({ lastmod: () => null }).includes('<lastmod>'));
});

test('the 404 page is the app shell, noindex, with no canonical', () => {
  const html = renderNoindexPage(indexHtml, 'Page not found | Asset Bench');
  assert.match(html, /<title>Page not found \| Asset Bench<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex, follow" \/>/);
  assert.ok(!html.includes('rel="canonical"'));
  assert.ok(html.includes('<div id="app"></div>'));
});
