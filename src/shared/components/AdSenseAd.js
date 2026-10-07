import { ADSENSE_CLIENT_ID, adSlotFor } from '../config/ads.js';
import { SITE_URL } from '../config/seo.js';
import { hasStoredLicense, hasToolLicense } from '../../services/LicenseService.js';
import { hasConsent } from '../../services/ConsentService.js';

const SCRIPT_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
const SITE_HOST = new URL(SITE_URL).hostname.replace(/^www\./, '');

let scriptRequested = false;

/** Ads only run on assetbench.co.uk itself, plus `npm run dev` (as test ads). */
function isAdHost() {
  const host = location.hostname;
  return host === SITE_HOST || host.endsWith(`.${SITE_HOST}`) || import.meta.env.DEV;
}

/**
 * Adds Google's script once per page load, never more. It's async, so it
 * can't block the app; if it's blocked or fails, every ad slot is hidden
 * (see .ads-unavailable in components.css) rather than left as an empty box.
 */
function loadScript() {
  if (scriptRequested) return;
  scriptRequested = true;
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `${SCRIPT_SRC}?client=${encodeURIComponent(ADSENSE_CLIENT_ID)}`;
  script.onerror = () => document.documentElement.classList.add('ads-unavailable');
  document.head.appendChild(script);
}

function whenIdle(fn) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 3000 });
  else setTimeout(fn, 1500);
}

/**
 * A single, clearly labelled Google AdSense display unit.
 *
 * Returns null — so callers append nothing and no space is reserved — when
 * ads are switched off, the visitor hasn't allowed Advertising, the
 * placement has no slot ID, the page isn't on assetbench.co.uk, or the
 * visitor holds a paid license (for this tool, or for everything).
 *
 * The ad is only requested once the slot is near the viewport, and Google's
 * script loads after the page is idle, so tools are never held up by it.
 *
 * @param {{ placement: keyof typeof import('../config/ads.js').ADSENSE_SLOTS, toolId?: string }} options
 * @returns {HTMLElement | null}
 */
export function AdSenseAd({ placement, toolId } = {}) {
  const slot = adSlotFor(placement);
  // Advertising consent is required before any Google code loads. In the UK/EEA,
  // AdSense also expects Google's certified consent message (see config/ads.js).
  if (!slot || !isAdHost() || !hasConsent('advertising')) return null;
  if (hasStoredLicense() || (toolId && hasToolLicense(toolId))) return null;

  const aside = document.createElement('aside');
  aside.className = `ad-slot ad-slot--${placement} container`;
  aside.setAttribute('aria-label', 'Advertisement');

  const frame = document.createElement('div');
  frame.className = 'ad-slot__frame';

  const label = document.createElement('div');
  label.className = 'ad-slot__label';
  label.textContent = 'Advertisement';

  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle ad-slot__unit';
  ins.style.display = 'block';
  ins.dataset.adClient = ADSENSE_CLIENT_ID;
  ins.dataset.adSlot = slot;
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';
  // Local previews must never count as real impressions or clicks.
  if (import.meta.env.DEV) ins.dataset.adtest = 'on';

  frame.append(label, ins);
  aside.appendChild(frame);

  whenIdle(loadScript);

  // Request the ad only when the visitor scrolls near it. Before that the
  // slot is inert, and a slot removed by navigation never requests anything.
  const request = () => {
    if (!ins.isConnected) return;
    loadScript();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      aside.remove();
    }
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        request();
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(aside);
  } else {
    whenIdle(request);
  }

  return aside;
}
