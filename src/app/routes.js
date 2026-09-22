import { TOOLS } from '../shared/config/tools.js';
import { hasAccess } from '../shared/config/billing.js';
import { Paywall } from '../shared/components/Paywall.js';

const GATED_STATUSES = new Set(['available', 'beta']);

async function mountTool(tool, container, params) {
  const mod = await import(`../tools/${tool.id}/index.js`);
  return mod.mount(container, params);
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
    handler: async (params, container) => (await import('../pages/home/HomePage.js')).render(container, params),
  },
  {
    path: '/tools',
    handler: async (params, container) => (await import('../pages/tools/ToolsPage.js')).render(container, params),
  },
  {
    path: '/about',
    handler: async (params, container) => (await import('../pages/about/AboutPage.js')).render(container, params),
  },
  {
    path: '/pricing',
    handler: async (params, container) =>
      (await import('../pages/pricing/PricingPage.js')).render(container, params),
  },
  ...TOOLS.map((tool) => ({
    path: tool.route,
    handler: async (params, container) => {
      if (GATED_STATUSES.has(tool.status) && !hasAccess()) {
        container.innerHTML = '';
        container.appendChild(
          Paywall({
            toolName: tool.name,
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
