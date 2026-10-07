import { CLOUDFLARE_ANALYTICS_TOKEN } from '../shared/config/analytics.js';
import { SITE_URL } from '../shared/config/seo.js';
import { hasConsent, onConsentChange } from './ConsentService.js';

const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
const SITE_HOST = new URL(SITE_URL).hostname.replace(/^www\./, '');

function loadBeacon() {
  const host = location.hostname;
  if (!CLOUDFLARE_ANALYTICS_TOKEN || (host !== SITE_HOST && !host.endsWith(`.${SITE_HOST}`))) return;
  // Already there — loaded earlier this visit, or still injected by Cloudflare's automatic setup.
  if (document.querySelector('script[src*="cloudflareinsights.com/beacon"]')) return;
  const script = document.createElement('script');
  script.defer = true;
  script.src = BEACON_SRC;
  script.dataset.cfBeacon = JSON.stringify({ token: CLOUDFLARE_ANALYTICS_TOKEN });
  document.head.appendChild(script);
}

/**
 * Starts Cloudflare Web Analytics by default unless Analytics is opted out.
 * Withdrawing the opt-out takes effect from the next page load (a running
 * beacon can't be unloaded).
 */
export function initAnalytics() {
  if (hasConsent('analytics')) loadBeacon();
  onConsentChange((consent) => {
    if (consent.analytics) loadBeacon();
  });
}
