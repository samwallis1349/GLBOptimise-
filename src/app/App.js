import { Header } from '../shared/components/Header.js';
import { ShareBanner } from '../shared/components/ShareBanner.js';
import { Footer } from '../shared/components/Footer.js';
import { TrialBanner } from '../shared/components/TrialBanner.js';
import { SITE_NOTICE } from '../shared/config/siteNotice.js';
import { registerRoutes, setRouteContainer, startRouter } from './router.js';
import { routes, notFound } from './routes.js';
import { cleanupStaleSessions } from '../shared/storage/sessionCleanup.js';
import { revalidateStoredLicense } from '../services/LicenseService.js';
import { initTrial } from '../services/TrialService.js';
import { initLayoutEditor } from '../editor/LayoutEditor.js';
import { initCommandPalette } from '../shared/effects/CommandPalette.js';
import { initPromoBot } from '../shared/effects/PromoBot.js';
import { initConsentBanner } from '../shared/components/ConsentBanner.js';
import { initWelcomeModal } from '../shared/components/WelcomeModal.js';
import { initAnalytics } from '../services/AnalyticsService.js';
import { hasAccess, trialEndsAt } from '../shared/config/billing.js';
import { TOOLS } from '../shared/config/tools.js';
import { navigate } from './router.js';

/** Mounts the whole Asset Bench app (header, routed page content, footer) into rootEl. */
export function App(rootEl) {
  rootEl.innerHTML = '';
  rootEl.appendChild(Header());
  rootEl.appendChild(ShareBanner());

  const main = document.createElement('main');
  main.id = 'page-root';
  rootEl.appendChild(main);

  rootEl.appendChild(Footer());

  setRouteContainer(main);
  registerRoutes(routes, { notFound });
  startRouter();

  // Privacy choices: the notice explains default-on analytics and the simple
  // opt-out; AnalyticsService respects any saved opt-out.
  initConsentBanner();
  initAnalytics();

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

  // Welcome modal showcasing 3D AI generator partner
  initWelcomeModal();

  // The banner and Bench Bot both quote days left, so they wait for the
  // trial clock. initTrial() never rejects — it falls back to local time.
  if (SITE_NOTICE) {
    const notice = document.createElement('div');
    notice.className = 'trial-banner site-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = SITE_NOTICE;
    rootEl.prepend(notice);
  }

  initTrial().then(() => {
    const notice = rootEl.querySelector('.site-notice');
    if (notice) notice.after(TrialBanner());
    else rootEl.prepend(TrialBanner());
    // Bench Bot tool-finder / promo helper — floating, same mount-once pattern.
    initPromoBot();

    // An open tool must lock when the trial expires, not only on the next
    // navigation. Recheck after tab suspension or a system-clock change too.
    let hadAccess = hasAccess();
    const lockExpiredTool = () => {
      if (hasAccess()) {
        hadAccess = true;
        return;
      }
      if (!hadAccess) return;
      hadAccess = false;
      const open = TOOLS.find((tool) => tool.route === location.pathname && ['available', 'beta'].includes(tool.status));
      // A single-tool key keeps its own tool open after the trial ends.
      if (open && !hasAccess(open.id)) navigate(location.pathname);
    };
    setTimeout(lockExpiredTool, Math.max(0, trialEndsAt() - Date.now()) + 1);
    window.addEventListener('focus', lockExpiredTool);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) lockExpiredTool();
    });
  });
}
