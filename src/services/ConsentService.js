/**
 * The visitor's privacy choices, kept in this browser only.
 *
 * Categories:
 *   necessary   — always on; never asked (trial, licence keys, settings…).
 *   analytics   — Cloudflare Web Analytics and aggregate tool-usage counts (default on, opt-out available).
 *   advertising — Google AdSense, once it is switched on (config/ads.js).
 *
 * Anything that needs a category asks hasConsent(category) before it runs,
 * and can subscribe with onConsentChange() to start as soon as it's allowed.
 * Cloudflare Web Analytics and aggregate tool popularity counts are on by
 * default under the UK statistical purposes exception. A saved opt-out takes
 * precedence; advertising stays off unless explicitly allowed.
 *
 * Bump CONSENT_VERSION when the categories or what they cover change: every
 * stored choice then becomes invalid and the notice is shown again.
 */

export const CONSENT_VERSION = 1;
export const CONSENT_CATEGORIES = ['analytics', 'advertising'];

const STORAGE_KEY = 'assetbench_consent_v1';
const listeners = new Set();

// If storage is blocked, a choice still applies for the rest of this page view.
let unsaved = null;

/** The saved choice ({ v, analytics, advertising, at }), or null if none has been made. */
export function getConsent() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return unsaved; // storage blocked
  }
  try {
    const data = JSON.parse(raw);
    return data?.v === CONSENT_VERSION ? data : null;
  } catch {
    return null; // corrupt — ask again
  }
}

/** Analytics defaults on until the visitor opts out; advertising defaults off. */
export function hasConsent(category) {
  if (category === 'necessary') return true;
  const consent = getConsent();
  if (category === 'analytics') return consent ? consent.analytics === true : true;
  return consent?.[category] === true;
}

/** Saves a choice. Categories left out are refused. */
export function setConsent(choices) {
  const data = { v: CONSENT_VERSION, at: new Date().toISOString().slice(0, 10) };
  for (const category of CONSENT_CATEGORIES) data[category] = choices[category] === true;
  unsaved = data;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage blocked — `unsaved` covers this page view */
  }
  listeners.forEach((listener) => listener(data));
  return data;
}

/** Calls listener(consent) whenever a choice is saved. Returns an unsubscribe function. */
export function onConsentChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
