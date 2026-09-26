import { Header } from '../shared/components/Header.js';
import { Footer } from '../shared/components/Footer.js';
import { TrialBanner } from '../shared/components/TrialBanner.js';
import { registerRoutes, setRouteContainer, startRouter } from './router.js';
import { routes, notFound } from './routes.js';
import { cleanupStaleSessions } from '../shared/storage/sessionCleanup.js';
import { revalidateStoredLicense } from '../services/LicenseService.js';
import { initLayoutEditor } from '../editor/LayoutEditor.js';
import { initCommandPalette } from '../shared/effects/CommandPalette.js';
import { initPromoBot } from '../shared/effects/PromoBot.js';

/** Mounts the whole Asset Bench app (header, routed page content, footer) into rootEl. */
export function App(rootEl) {
  rootEl.innerHTML = '';
  rootEl.appendChild(TrialBanner());
  rootEl.appendChild(Header());

  const main = document.createElement('main');
  main.id = 'page-root';
  rootEl.appendChild(main);

  rootEl.appendChild(Footer());

  setRouteContainer(main);
  registerRoutes(routes, { notFound });
  startRouter();

  cleanupStaleSessions().catch(() => {
    /* best-effort cleanup — never block app startup on it */
  });

  revalidateStoredLicense().catch(() => {
    /* best-effort — never block app startup on it */
  });

  // F8 visual layout editor — lives outside the router's DOM so it
  // survives navigation; invisible until the user presses F8.
  initLayoutEditor();

  // Ctrl/Cmd+K tool finder — same pattern: mounted once, outside the
  // router's DOM, reachable from any page.
  initCommandPalette();

  // Bench Bot tool-finder / promo helper — floating, same mount-once pattern.
  initPromoBot();
}
