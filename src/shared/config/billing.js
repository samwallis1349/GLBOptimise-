import { hasStoredLicense } from '../../services/LicenseService.js';

/**
 * Asset Bench is free for everyone until this date, then every 'available'/
 * 'beta' tool requires a paid lifetime license. A fixed launch-window date
 * (rather than a per-visitor trial) needs no accounts or tracking — it's
 * just a clock check.
 */
export const FREE_UNTIL = '2026-09-29T23:59:59Z';

export const LIFETIME_PRICE_LABEL = '£35';

export const CHECKOUT_URL = 'https://assetbench.lemonsqueezy.com/checkout/buy/d07980c2-c239-43d1-bcc8-f315a9bd21aa';

export function isFreePeriodActive() {
  return Date.now() < new Date(FREE_UNTIL).getTime();
}

export function freeDaysRemaining() {
  const msRemaining = new Date(FREE_UNTIL).getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / 86_400_000));
}

/** True if the visitor can use gated tools right now — free window or a validated license. */
export function hasAccess() {
  return isFreePeriodActive() || hasStoredLicense();
}
