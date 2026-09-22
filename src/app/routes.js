import { TOOLS } from '../shared/config/tools.js';

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
    handler: async (params, container) => (await import(`../tools/${tool.id}/index.js`)).mount(container, params),
  })),
];

export async function notFound(container) {
  return (await import('../pages/not-found/NotFoundPage.js')).render(container);
}
