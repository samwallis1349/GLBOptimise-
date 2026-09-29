import { CHECKOUT_URL, LICENSE_MACHINE_LIMIT, LIFETIME_PRICE_LABEL, TRIAL_DAYS, freeDaysRemaining, isFreePeriodActive } from '../config/billing.js';
import { hasStoredLicense } from '../../services/LicenseService.js';
import { trialStartedThisVisit } from '../../services/TrialService.js';
import { navigate } from '../../app/router.js';
import { openModal } from './Modal.js';

const SHOW_DELAY_MS = 1200;
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

/**
 * Welcome splash with the pricing offer. Shown on every page load to
 * visitors without a license, but never on /pricing (which already says it
 * all). Call after initTrial() so the days-left figure is real.
 */
export function initWelcomeOffer() {
  if (hasStoredLicense() || location.pathname === '/pricing') return;

  setTimeout(() => {
    if (hasStoredLicense() || document.querySelector('.modal-overlay')) return;

    const trialActive = isFreePeriodActive();
    const days = freeDaysRemaining();
    const daysLabel = `${days} day${days === 1 ? '' : 's'}`;
    // Returning visitors already have a trial running — offer to continue it, not start one.
    const returning = trialActive && !trialStartedThisVisit();

    const content = document.createElement('div');
    content.className = 'welcome-offer';
    content.innerHTML = `
      <p class="welcome-offer__lead">
        ${returning
          ? `You have ${daysLabel} left of your free trial — every tool is still unlocked.`
          : trialActive
          ? `Every tool is free for ${TRIAL_DAYS} days — no card, no account.`
          : 'Your free trial has ended — unlock every tool for good.'}
      </p>
      <div class="welcome-offer__price" hidden>${LIFETIME_PRICE_LABEL} <span class="text-muted">once, forever</span></div>
      <ul class="welcome-offer__points">
        <li>Every current and future Asset Bench tool</li>
        <li>License key emailed instantly — works on ${LICENSE_MACHINE_LIMIT} machines</li>
        <li>No subscription, and your files never leave your browser</li>
      </ul>
      <button type="button" class="welcome-offer__key">Already have a key?</button>
    `;

    const buy = document.createElement('a');
    buy.className = 'btn btn--primary welcome-offer__buy';
    buy.href = CHECKOUT_URL;
    buy.target = '_blank';
    buy.rel = 'noopener';
    buy.textContent = `Buy lifetime — ${LIFETIME_PRICE_LABEL}`;

    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'btn btn--secondary';
    later.textContent = returning
      ? `Continue trial (${daysLabel} left)`
      : trialActive ? 'Start free trial' : 'Maybe later';

    const close = openModal({
      title: returning
        ? 'Welcome back'
        : trialActive ? `Try Asset Bench free for ${TRIAL_DAYS} days` : 'Keep using Asset Bench',
      content,
      actions: [later, buy],
      className: 'modal--splash',
    });

    // The artwork carries the price itself; the text price only shows if it fails to load.
    const modal = content.closest('.modal');
    modal.prepend(splashHero(() => { content.querySelector('.welcome-offer__price').hidden = false; }));

    later.addEventListener('click', close);
    buy.addEventListener('click', close);
    content.querySelector('.welcome-offer__key').addEventListener('click', () => {
      close();
      navigate('/pricing');
    });
  }, SHOW_DELAY_MS);
}
