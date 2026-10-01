/**
 * Build-time SEO pages. The site is a single-page app, so without this every
 * URL is served the homepage's index.html — same title, same description and
 * a canonical pointing at "/", which tells search engines each tool page is
 * a duplicate of the homepage.
 *
 * After `vite build`, this writes dist/<route>.html for every tool and page
 * (Cloudflare serves /line-studio from line-studio.html) with its own title,
 * description, canonical and social tags, plus a plain-HTML summary inside
 * #app for crawlers and no-JS visitors — App.js clears #app on start, so real
 * visitors never see it. It also writes dist/sitemap.xml from the registry,
 * so new tools are listed automatically.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TOOLS } from '../src/shared/config/tools.js';
import { SITE_URL, SITE_NAME, STATIC_PAGES, pageSeo } from '../src/shared/config/seo.js';

const LIVE = new Set(['available', 'beta']);

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`seo-pages: <meta ${attr}="${key}"> not found in index.html`);
  return html.replace(re, `$1${esc(value)}$2`);
}

/** Returns index.html rewritten for one route (a tool or a STATIC_PAGES entry). */
export function renderPage(indexHtml, path) {
  const seo = pageSeo(path);
  const tool = TOOLS.find((t) => t.route === path);
  let html = indexHtml.replace(/<title>[^<]*<\/title>/, `<title>${esc(seo.title)}</title>`);
  html = setMeta(html, 'name', 'description', seo.description);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${seo.url}$2`);
  html = setMeta(html, 'property', 'og:title', seo.title);
  html = setMeta(html, 'property', 'og:description', seo.description);
  html = setMeta(html, 'property', 'og:url', seo.url);
  html = setMeta(html, 'property', 'og:image', seo.image);
  html = setMeta(html, 'name', 'twitter:title', seo.title);
  html = setMeta(html, 'name', 'twitter:description', seo.description);
  html = setMeta(html, 'name', 'twitter:image', seo.image);
  if (tool?.thumbnail) html = setMeta(html, 'name', 'twitter:card', 'summary_large_image');

  // Tool pages link their category neighbours; the rest link every live tool.
  const links = TOOLS.filter((t) => t !== tool && LIVE.has(t.status) && (!tool || t.category === tool.category))
    .map((t) => `<li><a href="${t.route}">${esc(t.name)}</a></li>`)
    .join('');
  const summary = `<div id="app">
      <main>
        <h1>${esc(seo.name ?? SITE_NAME)}</h1>
        <p>${esc(seo.description)}</p>
        ${tool?.features?.length ? `<ul>${tool.features.map((f) => `<li>${esc(f.label)}</li>`).join('')}</ul>` : ''}
        <p><a href="/tools">All ${SITE_NAME} tools</a></p>
        ${links ? `<ul>${links}</ul>` : ''}
      </main>
    </div>`;
  if (!html.includes('<div id="app"></div>')) throw new Error('seo-pages: <div id="app"></div> not found');
  return html.replace('<div id="app"></div>', summary);
}

export function renderSitemap() {
  const url = (path, changefreq, priority) =>
    `  <url>\n    <loc>${SITE_URL}${path}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  const entries = [
    ...STATIC_PAGES.map((p) => url(p.path, p.changefreq, p.priority)),
    ...TOOLS.filter((t) => LIVE.has(t.status)).map((t) => url(t.route, 'monthly', t.id === 'optimise-glb' ? '0.9' : '0.8')),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

/** Vite plugin: runs once after the production bundle is written. */
export function seoPages() {
  let outDir = 'dist';
  return {
    name: 'asset-bench-seo-pages',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
      const paths = [...STATIC_PAGES.map((p) => p.path).filter((p) => p !== '/'), ...TOOLS.map((t) => t.route)];
      for (const path of paths) {
        await writeFile(join(outDir, `${path.slice(1)}.html`), renderPage(indexHtml, path));
      }
      await writeFile(join(outDir, 'sitemap.xml'), renderSitemap());
    },
  };
}
