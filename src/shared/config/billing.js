import { hasStoredLicense, hasToolLicense } from '../../services/LicenseService.js';
import { trialStartedAt } from '../../services/TrialService.js';

/**
 * Every visitor gets TRIAL_DAYS of full access from their first visit, then
 * every 'available'/'beta' tool needs a paid lifetime license key. The
 * trial clock itself lives in services/TrialService.js.
 */
export const TRIAL_DAYS = 3;

/**
 * Temporary: unlocks every tool for everyone and covers the welcome popup with
 * an "all tools free" notice while the Lemon Squeezy store is awaiting
 * verification. Set back to false once live checkout works.
 */
export const ALL_TOOLS_FREE = false;

/** PayPal donation page, offered in the free-tools popup and the footer. */
export const DONATE_URL = 'https://www.paypal.com/ncp/payment/SUD2ZPA339KCY';

export const LIFETIME_PRICE_LABEL = '£9.99';

export const CHECKOUT_URL = 'https://workbenchlabs.lemonsqueezy.com/checkout/buy/3d09253a-bc8b-44a4-853f-5882dc964807';

export const DISCOUNT_CODE = 'G0MTE1NA';

/** Lemon Squeezy IDs for the lifetime product — keys from any other store/product are rejected. */
export const LICENSE_STORE_ID = 480634;
export const LICENSE_PRODUCT_ID = 1420844;

/** Machines one key can unlock. Must match the product's activation limit in Lemon Squeezy. */
export const LICENSE_MACHINE_LIMIT = 2;

/** Lemon Squeezy's buyer portal — where customers can look up a lost key. */
export const MY_ORDERS_URL = 'https://app.lemonsqueezy.com/my-orders';

const DAY_MS = 86_400_000;

export function trialEndsAt() {
  // Before the clock has loaded, treat the trial as just started so nothing
  // flashes a paywall; routes.js waits for initTrial() before gating anyway.
  return (trialStartedAt() ?? Date.now()) + TRIAL_DAYS * DAY_MS;
}

export function isFreePeriodActive() {
  return Date.now() < trialEndsAt();
}

export function freeDaysRemaining() {
  return Math.max(0, Math.ceil((trialEndsAt() - Date.now()) / DAY_MS));
}

/**
 * True if the visitor can use gated tools right now — free period, trial
 * still running or a validated lifetime license. Pass a tool ID to also
 * count a single-tool key for that tool.
 */
export function hasAccess(toolId) {
  return ALL_TOOLS_FREE || isFreePeriodActive() || hasStoredLicense() || (toolId != null && hasToolLicense(toolId));
}
