import { LIFETIME_PRICE_LABEL } from '../config/billing.js';

// The on-load welcome popup that used to live here was removed: trial and
// licence messages now appear only where they're relevant (the paywall on a
// locked tool, the slim trial banner, and /pricing, which uses this artwork).
const OFFER_IMAGE = '/pricing/offer.webp';
const EMBER_COUNT = 22;

/**
 * Splash artwork with the FX layers on top: drifting embers and a one-off
 * light sweep. Embers are plain spans with randomised CSS custom properties,
 * so the whole effect is CSS animation — no rAF loop to clean up.
 */
export function splashHero(onMissing = () => {}) {
  const hero = document.createElement('div');
  hero.className = 'welcome-offer__hero';
  hero.innerHTML = `
    <img class="welcome-offer__image" src="${OFFER_IMAGE}" alt="Asset Bench — full access forever for ${LIFETIME_PRICE_LABEL}" width="1344" height="756" />
    <div class="welcome-offer__sweep" aria-hidden="true"></div>
    <div class="welcome-offer__embers" aria-hidden="true"></div>
  `;

  const embers = hero.querySelector('.welcome-offer__embers');
  for (let i = 0; i < EMBER_COUNT; i++) {
    const ember = document.createElement('span');
    ember.style.setProperty('--x', `${Math.random() * 100}%`);
    ember.style.setProperty('--size', `${2 + Math.random() * 4}px`);
    ember.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
    ember.style.setProperty('--duration', `${4 + Math.random() * 5}s`);
    ember.style.setProperty('--delay', `${-Math.random() * 8}s`);
    embers.appendChild(ember);
  }

  // No artwork deployed? Drop the hero and let the text-only layout stand.
  hero.querySelector('img').addEventListener('error', () => {
    hero.remove();
    onMissing();
  });

  return hero;
}
