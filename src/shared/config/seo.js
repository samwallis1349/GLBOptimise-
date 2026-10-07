/**
 * Per-page search metadata. Shared by the build (scripts/seo-pages.mjs writes
 * a static HTML file per route, plus sitemap.xml, so crawlers get the right
 * title/description/canonical without running JS) and by the router (which
 * keeps document.title and the meta tags in step during in-app navigation).
 *
 * A tool can override its search title/description with an `seo` field in
 * the registry; otherwise both are derived from its name and description.
 */

import { TOOLS } from './tools.js';

export const SITE_URL = 'https://www.assetbench.co.uk';
export const SITE_NAME = 'Asset Bench';
const DEFAULT_IMAGE = `${SITE_URL}/branding/asset-bench-logo.svg`;

/** Must match the homepage tags in index.html. */
export const HOME_SEO = {
  path: '/',
  title: 'Asset Bench — Free browser-based 3D asset optimisation tools',
  description:
    'Free browser-based tools to optimise, compress, inspect and convert 3D assets (GLB/glTF) for games and realtime apps. Reduce polys, compress textures, generate LODs and more — nothing ever leaves your device.',
};

/** Non-tool pages, in sitemap order. */
export const STATIC_PAGES = [
  { ...HOME_SEO, changefreq: 'weekly', priority: '1.0' },
  {
    path: '/tools',
    name: 'All Tools',
    title: `All Tools — Free browser-based asset tools | ${SITE_NAME}`,
    description:
      'Every Asset Bench tool in one place: optimise GLBs, reduce polys, compress textures, clean up line art, make sprites and thumbnails — free in your browser, nothing uploaded.',
    changefreq: 'weekly',
    priority: '0.9',
  },
  {
    path: '/about',
    name: 'About Asset Bench',
    title: `About — Browser-based 3D and game asset tools | ${SITE_NAME}`,
    description:
      'What Asset Bench is, which tools it offers, how files are processed in your browser, and how the trial and lifetime licence work.',
    changefreq: 'yearly',
    priority: '0.5',
  },
  {
    path: '/pricing',
    name: 'Pricing',
    title: `Pricing — Lifetime access | ${SITE_NAME}`,
    description: 'One payment unlocks every current and future Asset Bench tool, for life. Try every tool free first.',
    changefreq: 'monthly',
    priority: '0.6',
  },
  {
    path: '/contact',
    name: 'Contact',
    title: `Contact | ${SITE_NAME}`,
    description: 'How to contact Asset Bench about support, bug reports, licence keys, payments and feedback.',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/terms',
    name: 'Terms of Use',
    title: `Terms of Use | ${SITE_NAME}`,
    description: 'The terms for using Asset Bench: tools and results, your files, the free trial, lifetime licences, payments and acceptable use.',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/refunds',
    name: 'Refund Policy',
    title: `Refund Policy | ${SITE_NAME}`,
    description: 'Asset Bench licences are digital and delivered instantly, so sales are final — with help if a key or tool is faulty. Try every tool before buying.',
    changefreq: 'yearly',
    priority: '0.3',
  },
  {
    path: '/privacy',
    name: 'Privacy Policy',
    title: `Privacy Policy | ${SITE_NAME}`,
    description: 'How Asset Bench handles information: your files stay in your browser, what the free trial, licence checks and visitor statistics use, browser storage, and our plans for advertising.',
    changefreq: 'yearly',
    priority: '0.3',
  },
];

/** @param {import('./tools.js').TOOLS[number]} tool */
export function toolSeo(tool) {
  return {
    path: tool.route,
    name: tool.name,
    title: tool.seo?.title ?? `${tool.name} — Free in-browser tool | ${SITE_NAME}`,
    description: tool.seo?.description ?? `${tool.description} Free, in your browser — nothing is uploaded.`,
    image: tool.thumbnail ? `${SITE_URL}${tool.thumbnail}` : DEFAULT_IMAGE,
  };
}

/** Metadata for any route; unknown routes fall back to the homepage's tags. */
export function pageSeo(path) {
  const tool = TOOLS.find((t) => t.route === path);
  const page = tool ? toolSeo(tool) : (STATIC_PAGES.find((p) => p.path === path) ?? HOME_SEO);
  return { image: DEFAULT_IMAGE, ...page, url: `${SITE_URL}${page.path}` };
}
