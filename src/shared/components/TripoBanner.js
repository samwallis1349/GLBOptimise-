import { TRIPO_BANNER_TOOLS, TRIPO_IMPACT_AD, TRIPO_LINK_ATTRS, TRIPO_OFFER } from '../config/tripo.js';
import { trackApiEvent } from './ApiLaunchModal.js';

const PICK_KEY = 'ab-tripo-ad';

/** 'banner' or 'impact', picked at random once per visit so it doesn't flip between pages. */
function pickAd() {
  try {
    let pick = sessionStorage.getItem(PICK_KEY);
    if (pick !== 'banner' && pick !== 'impact') {
      pick = Math.random() < 0.5 ? 'banner' : 'impact';
      sessionStorage.setItem(PICK_KEY, pick);
    }
    return pick;
  } catch {
    return Math.random() < 0.5 ? 'banner' : 'impact';
  }
}

/**
 * Tripo advert, one of two in turn (picked per visit): our slim advert (one image (public/ads/tripo-banner.webp, our own art of a
 * prompt turning into a model), one line and a button, all one affiliate link),
 * or Impact's own 250 × 250 Tripo ad in its iframe. Either is labelled as an ad
 * and sits at the top of the homepage and of the tools in TRIPO_BANNER_TOOLS.
 * Clicks on our advert count as `tripo_banner_click`; Impact counts its own.
 *
 * @param {import('../config/tools.js').TOOLS[number]} [tool] the tool page it's on; none on the homepage
 * @returns {HTMLElement | null}
 */
export function TripoBanner(tool) {
  if (tool && !TRIPO_BANNER_TOOLS.has(tool.id)) return null;

  const banner = document.createElement('aside');
  banner.className = `tripo-banner${tool ? '' : ' tripo-banner--home'}`;
  banner.setAttribute('aria-label', 'Advert');
  if (pickAd() === 'impact') {
    banner.classList.add('tripo-banner--impact');
    banner.innerHTML = `
      <iframe class="tripo-banner__frame" src="${TRIPO_IMPACT_AD}" width="250" height="250" title="Tripo advert" loading="lazy" scrolling="no" frameborder="0"></iframe>
      <small class="affiliate-note tripo-banner__note">Ad · Affiliate link</small>
    `;
    return banner;
  }
  banner.innerHTML = `
    <a class="tripo-banner__link" ${TRIPO_LINK_ATTRS}>
      <img class="tripo-banner__art" src="/ads/tripo-banner.webp" width="160" height="80" alt="A text prompt turning into a 3D model">
      <strong class="tripo-banner__offer">${TRIPO_OFFER}</strong>
      <span class="btn btn--primary tripo-banner__button">Get the deal <span aria-hidden="true">↗</span></span>
    </a>
    <small class="affiliate-note tripo-banner__note">Ad · Affiliate link</small>
  `;
  banner.querySelector('a').addEventListener('click', () => trackApiEvent('tripo_banner_click'));
  return banner;
}
