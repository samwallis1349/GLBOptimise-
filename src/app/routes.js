import { TOOLS } from '../shared/config/tools.js';
import { hasAccess } from '../shared/config/billing.js';
import { Paywall } from '../shared/components/Paywall.js';
import { ToolOffer } from '../shared/components/ToolOffer.js';
import { ExtensionBar } from '../shared/components/ExtensionBar.js';
import { ToolNews } from '../shared/components/ToolNews.js';
import { ToolGuide } from '../shared/components/ToolGuide.js';
import { SampleModel } from '../shared/components/SampleModel.js';
import { TripoCard } from '../shared/components/TripoCard.js';
import { FbxBridge } from '../shared/fbx/FbxBridge.js';
import { ToolNextSteps } from '../shared/components/ToolNextSteps.js';
import { ToolClip } from '../shared/components/ToolClip.js';
import { AdSenseAd } from '../shared/components/AdSenseAd.js';
import { initTrial } from '../services/TrialService.js';
import { recordToolOpen } from '../services/UsageService.js';
import { pageSeo } from '../shared/config/seo.js';

const GATED_STATUSES = new Set(['available', 'beta']);

/** Keeps the tab title and search tags in step with in-app navigation (see shared/config/seo.js). */
function applyHead(path) {
  const seo = pageSeo(path);
  document.title = seo.title;
  const set = (selector, attr, value) => document.querySelector(selector)?.setAttribute(attr, value);
  set('meta[name="description"]', 'content', seo.description);
  set('link[rel="canonical"]', 'href', seo.url);
  set('meta[property="og:title"]', 'content', seo.title);
  set('meta[property="og:description"]', 'content', seo.description);
  set('meta[property="og:url"]', 'content', seo.url);
  set('meta[property="og:image"]', 'content', seo.image);
}

const page = (path, load) => async (params, container) => {
  applyHead(path);
  return (await load()).render(container, params);
};

async function mountTool(tool, container, params) {
  if (GATED_STATUSES.has(tool.status)) recordToolOpen(tool.id, location.pathname);
  const mod = await import(`../tools/${tool.id}/index.js`);
  const result = await mod.mount(container, params);
  // FBX in, GLB out: FBX files are converted before the tool sees them.
  const fbx = FbxBridge(tool, container);
  if (fbx) container.prepend(fbx);
  // No model to hand? Load the free Colossus into the tool (3D tools only).
  const sample = SampleModel(tool, container);
  if (sample) container.prepend(sample);
  const offer = ToolOffer(tool);
  if (offer) container.prepend(offer);
  const extension = ExtensionBar(tool);
  if (extension) container.prepend(extension);
  // Need a model? Tripo (affiliate) on the 3D tools, straight under the tool.
  const tripo = TripoCard(tool);
  if (tripo) container.append(tripo);
  // The tool's 5-second clip, straight under it.
  const clip = ToolClip(tool);
  if (clip) container.append(clip);
  // The tools people run next, and the API for doing it in bulk.
  const next = ToolNextSteps(tool);
  if (next) container.append(next);
  // How-to guide and FAQs, then editorial news and pro tips
  const guide = ToolGuide(tool);
  if (guide) container.append(guide);
  // Editorial news, updates, and pro tips for this tool
  const news = ToolNews(tool);
  if (news) container.append(news);
  // One ad, below the whole tool — never between its controls, preview or downloads.
  const ad = AdSenseAd({ placement: 'tool', toolId: tool.id });
  if (ad) container.append(ad);
  return result;
}

/**
 * Route table. Static pages and tools are all dynamically imported with
 * literal (or single-variable-segment) specifiers so Vite can statically
 * analyze and code-split them — each tool's dependencies (e.g. Three.js,
 * glTF Transform for Optimise GLB) are only downloaded when a user
 * actually visits that tool.
 */
export const routes = [
  {
    path: '/',
    handler: page('/', () => import('../pages/home/HomePage.js')),
  },
  {
    path: '/tools',
    handler: page('/tools', () => import('../pages/tools/ToolsPage.js')),
  },
  {
    path: '/2d-games',
    handler: page('/2d-games', () => import('../pages/game-2d/Game2DPage.js')),
  },
  {
    path: '/tripo-to-game-ready',
    handler: page('/tripo-to-game-ready', () => import('../pages/tripo/TripoPage.js')),
  },
  {
    path: '/about',
    handler: page('/about', () => import('../pages/about/AboutPage.js')),
  },
  {
    path: '/pricing',
    handler: page('/pricing', () => import('../pages/pricing/PricingPage.js')),
  },
  {
    path: '/media',
    handler: page('/media', () => import('../pages/media/MediaPage.js')),
  },
  {
    path: '/contact',
    handler: page('/contact', () => import('../pages/contact/ContactPage.js')),
  },
  {
    path: '/terms',
    handler: page('/terms', () => import('../pages/terms/TermsPage.js')),
  },
  {
    path: '/refunds',
    handler: page('/refunds', () => import('../pages/refunds/RefundsPage.js')),
  },
  {
    path: '/privacy',
    handler: page('/privacy', () => import('../pages/privacy/PrivacyPage.js')),
  },
  {
    path: '/wizard-compare',
    handler: page('/wizard-compare', () => import('../pages/wizard-compare/WizardComparePage.js')),
  },
  {
    path: '/illustration',
    handler: async (params, container) => {
      const { IllustrationApp } = await import('../illustration/IllustrationApp.js');
      return IllustrationApp(container);
    },
  },
  ...TOOLS.map((tool) => ({
    path: tool.route,
    handler: async (params, container) => {
      applyHead(tool.route);
      if (GATED_STATUSES.has(tool.status)) await initTrial();
      if (GATED_STATUSES.has(tool.status) && !hasAccess(tool.id)) {
        container.innerHTML = '';
        container.appendChild(
          Paywall({
            tool,
            onUnlock: () => mountTool(tool, container, params),
          }),
        );
        return;
      }
      return mountTool(tool, container, params);
    },
  })),
];

export async function notFound(container) {
  return (await import('../pages/not-found/NotFoundPage.js')).render(container);
}
