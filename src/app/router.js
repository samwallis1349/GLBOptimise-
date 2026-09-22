/**
 * Minimal hash-based client-side router.
 *
 * Hash routing is used deliberately: Asset Bench is a static SPA that may
 * be deployed to plain static hosting later, and hash routes need no
 * server-side rewrite rules to support deep links or a hard refresh.
 * Browser Back/Forward work automatically because hash changes are
 * ordinary history entries.
 */

let routes = [];
let notFoundHandler = () => {};
let currentPath = '/';
let container = null;
let currentCleanup = null;
const listeners = new Set();

/**
 * Registers the shared DOM node that page/tool handlers render into.
 * Called once by App.js after the Header is mounted.
 */
export function setRouteContainer(el) {
  container = el;
}

/**
 * @param {{path: string, handler: (params: Record<string,string>, container: HTMLElement) => (void|(() => void)|Promise<void|(() => void)>)}[]} routeList
 * Each handler renders into the shared container and may return a cleanup
 * function, which is called automatically before the next navigation.
 */
export function registerRoutes(routeList, { notFound } = {}) {
  routes = routeList;
  if (notFound) notFoundHandler = notFound;
}

export function getCurrentPath() {
  return currentPath;
}

/** Subscribe to path changes (e.g. so the header can highlight the active link). */
export function onRouteChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function navigate(path) {
  if (location.hash.slice(1) === path) {
    resolveRoute(path);
    return;
  }
  location.hash = path;
}

function normalizeHash() {
  const raw = location.hash.replace(/^#/, '');
  return raw === '' ? '/' : raw;
}

function matchRoute(path) {
  for (const route of routes) {
    const params = matchPattern(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

/** Supports static segments and ":param" segments, no nested wildcards. */
function matchPattern(pattern, path) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const p = patternParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (p !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

async function resolveRoute(path) {
  currentPath = path;

  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  const myPath = path;
  const match = matchRoute(path);
  const result = match ? await match.route.handler(match.params, container) : await notFoundHandler(container);

  if (myPath !== currentPath) return; // a newer navigation already superseded this one

  if (typeof result === 'function') currentCleanup = result;

  listeners.forEach((listener) => listener(currentPath));
  window.scrollTo(0, 0);
}

export function startRouter() {
  window.addEventListener('hashchange', () => resolveRoute(normalizeHash()));
  resolveRoute(normalizeHash());
}
