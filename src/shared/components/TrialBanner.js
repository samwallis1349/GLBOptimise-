import { isFreePeriodActive, freeDaysRemaining, LIFETIME_PRICE_LABEL } from '../config/billing.js';

const DISMISS_KEY = 'assetbench_trial_banner_dismissed';

function isDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Slim top-of-page banner shown only during the free launch window. */
export function TrialBanner() {
  if (!isFreePeriodActive() || isDismissed()) return document.createDocumentFragment();

  const days = freeDaysRemaining();
  const bar = document.createElement('div');
  bar.className = 'trial-banner';
  bar.innerHTML = `
    <span>Free for everyone — ${days} day${days === 1 ? '' : 's'} left, then ${LIFETIME_PRICE_LABEL} once, forever.</span>
    <button type="button" class="trial-banner__close" aria-label="Dismiss">&times;</button>
  `;

  bar.querySelector('.trial-banner__close').addEventListener('click', () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* nothing to do */
    }
    bar.remove();
  });

  return bar;
}
