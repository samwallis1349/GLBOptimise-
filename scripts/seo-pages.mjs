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
 * so new tools are listed automatically, and dist/llms.txt + dist/llms-full.txt
 * (plain-Markdown site guides for AI assistants and answer engines, see
 * https://llmstxt.org) from the same registry and tool guides.
 */

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TOOLS, CATEGORIES } from '../src/shared/config/tools.js';
import { SITE_URL, SITE_NAME, STATIC_PAGES, HOME_SEO, pageSeo } from '../src/shared/config/seo.js';
import { getToolGuide } from '../src/shared/config/toolGuides.js';
import { toolGuideMarkup } from '../src/shared/components/ToolGuide.js';

const LIVE = new Set(['available', 'beta']);

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`seo-pages: <meta ${attr}="${key}"> not found in index.html`);
  return html.replace(re, `$1${esc(value)}$2`);
}

/**
 * index.html's SoftwareApplication JSON-LD describes the whole site. Left as
 * is, every tool page would tell Google it's "Asset Bench" at "/", so tool
 * pages get their own entry, keeping the site's offer and linking back to it.
 */
const JSON_LD_RE = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;
function setToolJsonLd(html, tool, seo) {
  const match = html.match(JSON_LD_RE);
  if (!match) throw new Error('seo-pages: application/ld+json not found in index.html');
  const site = JSON.parse(match[2]);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    applicationCategory: site.applicationCategory,
    operatingSystem: site.operatingSystem,
    description: seo.description,
    url: seo.url,
    image: seo.image,
    ...(tool.keywords?.length ? { keywords: tool.keywords.join(', ') } : {}),
    offers: site.offers,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${SITE_URL}/` },
  };
  // "<" escaped so a description can never close the script tag.
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return html.replace(JSON_LD_RE, () => `${match[1]}\n${json}\n    ${match[3]}`);
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
  if (tool) html = setToolJsonLd(html, tool, seo);

  // Tool pages link their category neighbours; the rest link every live tool.
  const links = TOOLS.filter((t) => t !== tool && LIVE.has(t.status) && (!tool || t.category === tool.category))
    .map((t) => `<li><a href="${t.route}">${esc(t.name)}</a></li>`)
    .join('');
  const summary = (path === '/illustration' || path === '/illustrator')
    ? `<div id="app">
        <main>
          <h1>Sam — Graphic Design &amp; Illustration</h1>
          <p>Original graphic design, logo design, vector identity and visual storytelling for businesses, games and ambitious creative projects.</p>
          <ul>
            <li>Brand &amp; Logo Identity Systems</li>
            <li>Character Illustration</li>
            <li>Isometric Worlds</li>
            <li>Brand Illustration</li>
            <li>Game Art and Assets</li>
            <li>Editorial Illustration</li>
            <li>Mascots and Characters</li>
          </ul>
          <p><a href="https://illustrator.assetbench.co.uk">Visit Sam — Graphic Design Portfolio</a></p>
        </main>
      </div>`
    : `<div id="app">
        <main>
          <h1>${esc(seo.name ?? SITE_NAME)}</h1>
          <p>${esc(seo.description)}</p>
          ${tool?.features?.length ? `<ul>${tool.features.map((f) => `<li>${esc(f.label)}</li>`).join('')}</ul>` : ''}
          ${tool && getToolGuide(tool.id) ? toolGuideMarkup(getToolGuide(tool.id)) : ''}
          <p><a href="/tools">All ${SITE_NAME} tools</a></p>
          ${links ? `<ul>${links}</ul>` : ''}
        </main>
      </div>`;
  if (!html.includes('<div id="app"></div>')) throw new Error('seo-pages: <div id="app"></div> not found');
  return html.replace('<div id="app"></div>', summary);
}

/**
 * Last real change to a page, as YYYY-MM-DD from git history of the files
 * behind it. Google uses <lastmod> to pick what to re-crawl, and ignores it
 * if it's always "today", so it must track actual edits. Null (no lastmod)
 * when git isn't available, e.g. a build from a downloaded copy.
 */
function lastModified(paths) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Source files behind each sitemap URL. */
const PAGE_SOURCES = {
  '/': ['src/pages/home'],
  '/pricing': ['src/pages/pricing', 'src/shared/config/billing.js'],
  '/docs/': ['public/docs', 'worker/api/plans.js'],
};
const sourcesFor = (path, tool) =>
  tool
    ? [`src/tools/${tool.id}`, `public/tools/${tool.id}`, `public/thumbnails/${tool.id}.webp`, `public/thumbnails/${tool.id}-wide.webp`]
    : PAGE_SOURCES[path] ?? [`src/pages${path}`];

/**
 * The page served with a real 404 status for unknown URLs (wrangler.jsonc:
 * not_found_handling "404-page"), plus pages that exist in the app but
 * shouldn't be indexed. Same app shell, so the router still renders its own
 * not-found screen; noindex and no canonical so it never competes with "/".
 */
export function renderNoindexPage(indexHtml, title) {
  let html = indexHtml.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, follow" />');
  html = html.replace(/\s*<link rel="canonical" href="[^"]*"\s*\/?>/, '');
  if (!html.includes('content="noindex, follow"')) throw new Error('seo-pages: robots meta not found in index.html');
  return html;
}

/** App routes that aren't in the sitemap but must still load on a direct visit. */
const UNLISTED_ROUTES = ['/wizard-compare'];

export function renderSitemap({ lastmod = lastModified } = {}) {
  const url = (path, changefreq, priority, tool) => {
    const date = lastmod(sourcesFor(path, tool));
    return `  <url>\n    <loc>${SITE_URL}${path}</loc>\n${date ? `    <lastmod>${date}</lastmod>\n` : ''}    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  };
  const entries = [
    ...STATIC_PAGES.map((p) => url(p.path, p.changefreq, p.priority)),
    // The API docs are a standalone page (public/docs/), not an SPA route, so they're listed here rather than in STATIC_PAGES.
    url('/docs/', 'weekly', '0.8'),
    ...TOOLS.filter((t) => LIVE.has(t.status)).map((t) => url(t.route, 'monthly', t.id === 'optimise-glb' ? '0.9' : '0.8', t)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------- llms.txt
/** Markdown-safe one-liner (no newlines; brackets can't break link syntax). */
const md = (value) => String(value ?? '').replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim();
const liveTools = () => TOOLS.filter((t) => LIVE.has(t.status));
const pagesFor = (paths) => paths.map((path) => STATIC_PAGES.find((p) => p.path === path)).filter(Boolean);

/**
 * /llms.txt: a short Markdown map of the site for AI assistants, grouped by
 * category, every live tool with its link and one-line description.
 */
export function renderLlmsTxt() {
  const out = [
    `# ${SITE_NAME}`,
    '',
    `> ${md(HOME_SEO.description)}`,
    '',
    'Every tool runs in the browser: files are processed on the visitor\'s device and are not uploaded. Tools marked (beta) are new and still changing. Each tool page has a how-to guide and FAQs.',
    '',
  ];
  for (const cat of CATEGORIES) {
    const tools = liveTools().filter((t) => t.category === cat.id);
    if (!tools.length) continue;
    out.push(`## ${cat.label}`, '');
    for (const t of tools) {
      out.push(`- [${md(t.name)}](${SITE_URL}${t.route})${t.status === 'beta' ? ' (beta)' : ''}: ${md(t.description)}`);
    }
    out.push('');
  }
  out.push('## Pages', '');
  for (const p of pagesFor(['/tools', '/2d-games', '/pricing', '/about', '/contact'])) {
    out.push(`- [${md(p.name)}](${SITE_URL}${p.path}): ${md(p.description)}`);
  }
  out.push(
    '',
    '## Cloud API',
    '',
    `- [API docs](${SITE_URL}/docs/): HTTP API for optimising GLB models, encoding KTX2 textures and simplifying meshes on the server.`,
    `- [OpenAPI spec](${SITE_URL}/api/v1/openapi.json): machine-readable description of every endpoint.`,
    '',
    '## Optional',
    '',
    `- [Full tool guide](${SITE_URL}/llms-full.txt): every tool with its features, steps and FAQs in one file.`,
    `- [Sitemap](${SITE_URL}/sitemap.xml)`,
    '',
  );
  return out.join('\n');
}

/** /llms-full.txt: every live tool with its features, keywords, how-to steps and FAQs. */
export function renderLlmsFull() {
  const out = [
    `# ${SITE_NAME}: all tools in full`,
    '',
    `> ${md(HOME_SEO.description)}`,
    '',
    `Short index: ${SITE_URL}/llms.txt. Pricing: ${md(pageSeo('/pricing').description)}`,
    '',
  ];
  for (const cat of CATEGORIES) {
    const tools = liveTools().filter((t) => t.category === cat.id);
    if (!tools.length) continue;
    out.push(`## ${cat.label}`, '');
    for (const t of tools) {
      const seo = pageSeo(t.route);
      const guide = getToolGuide(t.id);
      out.push(`### ${md(t.name)}${t.status === 'beta' ? ' (beta)' : ''}`, '', `URL: ${SITE_URL}${t.route}`, '', md(seo.description || t.description), '');
      if (t.features?.length) out.push(`Features: ${t.features.map((f) => md(f.label)).join(', ')}`, '');
      if (t.keywords?.length) out.push(`Keywords: ${t.keywords.map(md).join(', ')}`, '');
      if (guide) {
        if (guide.heading) out.push(`#### ${md(guide.heading)}`, '');
        for (const para of guide.intro ?? []) out.push(md(para), '');
        if (guide.steps?.length) { guide.steps.forEach((step, i) => out.push(`${i + 1}. ${md(step)}`)); out.push(''); }
        for (const f of guide.faqs ?? []) out.push(`**${md(f.q)}** ${md(f.a)}`, '');
      }
    }
  }
  return out.join('\n');
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
      for (const path of UNLISTED_ROUTES) {
        await writeFile(join(outDir, `${path.slice(1)}.html`), renderNoindexPage(indexHtml, `${SITE_NAME}`));
      }
      await writeFile(join(outDir, '404.html'), renderNoindexPage(indexHtml, `Page not found | ${SITE_NAME}`));
      await writeFile(join(outDir, 'sitemap.xml'), renderSitemap());
      await writeFile(join(outDir, 'llms.txt'), renderLlmsTxt());
      await writeFile(join(outDir, 'llms-full.txt'), renderLlmsFull());
    },
  };
}
