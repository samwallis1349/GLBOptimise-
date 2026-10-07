/**
 * Google AdSense — the only advertising provider on Asset Bench, and the one
 * place its settings live. Nothing else in the codebase holds a publisher ID
 * or slot ID: the AdSenseAd component, the router and the build
 * (scripts/adsense.mjs, which writes ads.txt and the site-verification tag)
 * all read from here.
 *
 * Three states:
 *
 *   1. Nothing set (default)      → no ad code, no Google requests, no ad space.
 *   2. ADSENSE_CLIENT_ID set,     → the build adds the google-adsense-account
 *      ADSENSE_ENABLED = false      meta tag and dist/ads.txt so Google can
 *                                   verify and review the site. Still no ads.
 *   3. ADSENSE_ENABLED = true     → ad units render wherever a placement has a
 *      + placement slot IDs         slot ID below. A placement with no slot ID
 *                                   simply renders nothing.
 *
 * Turning ADSENSE_ENABLED back to false switches every ad off at once.
 *
 * Consent: ads only render for visitors who allowed "Advertising" in Asset
 * Bench's privacy choices (services/ConsentService.js). That banner is not a
 * Google-certified CMP. Before serving ads to UK/EEA/Swiss visitors, publish
 * Google's consent message (AdSense → Privacy & messaging), which handles
 * Google's own consent signals once adsbygoogle.js loads.
 */

/** Master switch. Leave false until AdSense has approved assetbench.co.uk. */
export const ADSENSE_ENABLED = true;

/**
 * Your AdSense publisher ID, exactly as AdSense shows it: "ca-pub-" followed
 * by 16 digits (Account → Settings → Account information). Leave '' until
 * you have one — anything that isn't in that format is ignored.
 */
export const ADSENSE_CLIENT_ID = 'ca-pub-3501319729804021';

/**
 * One display ad unit per placement (AdSense → Ads → By ad unit → Display
 * ads). Paste each unit's data-ad-slot number here. Keys are the placement
 * names passed to AdSenseAd().
 */
export const ADSENSE_SLOTS = {
  /** Homepage, between the tool grid and the "Support the tools" panel. */
  homepage: '5330352255',
  /** Tool pages, below the tool itself — never inside it. */
  tool: '',
};

const CLIENT_ID_PATTERN = /^ca-pub-\d{16}$/;

/** True once a correctly formatted publisher ID has been entered. */
export function hasAdSenseClient() {
  return CLIENT_ID_PATTERN.test(ADSENSE_CLIENT_ID);
}

/** The slot ID for a placement, or null if ads are off or it isn't configured. */
export function adSlotFor(placement) {
  if (!ADSENSE_ENABLED || !hasAdSenseClient()) return null;
  const slot = String(ADSENSE_SLOTS[placement] ?? '').trim();
  return /^\d+$/.test(slot) ? slot : null;
}

/** The ads.txt line Google expects for this publisher ID (pub-…, without "ca-"). */
export function adsTxtLine() {
  return `google.com, ${ADSENSE_CLIENT_ID.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`;
}
