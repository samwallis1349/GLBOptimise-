import { ALL_TOOLS_FREE, isFreePeriodActive, freeDaysRemaining, LIFETIME_PRICE_LABEL } from '../config/billing.js';
import { hasStoredLicense } from '../../services/LicenseService.js';

const DISMISS_KEY = 'assetbench_trial_banner_dismissed';

function isDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Slim top-of-page banner shown only while an unlicensed visitor's free trial is running. */
export function TrialBanner() {
  if (ALL_TOOLS_FREE || !isFreePeriodActive() || hasStoredLicense() || isDismissed()) return document.createDocumentFragment();

  const days = freeDaysRemaining();
  const bar = document.createElement('div');
  bar.className = 'trial-banner';
  bar.innerHTML = `
    <span>Free trial — ${days} day${days === 1 ? '' : 's'} left, then <a href="/pricing">${LIFETIME_PRICE_LABEL} once, forever</a>.</span>
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
