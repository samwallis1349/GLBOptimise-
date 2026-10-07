/**
 * Application-wide constants. Anything that describes "what Asset Bench
 * is" (branding strings, external-ish identifiers) belongs here rather
 * than being repeated in page markup.
 */
export const APP_NAME = 'Asset Bench';
export const APP_TAGLINE = 'Small tools. Bigger worlds.';
export const APP_DESCRIPTION =
  'Browser-based tools for preparing 3D assets for games and realtime applications.';

/** Human-readable labels for tool registry statuses (see config/tools.js). */
export const TOOL_STATUS_LABELS = {
  available: 'Available',
  beta: 'Beta',
  'foundation-ready': 'Foundation ready',
  'coming-soon': 'Coming soon',
};

/**
 * Public contact address shown on /contact (and linked from /about, /terms
 * and /privacy). Leave '' until a real inbox exists: the contact page then
 * says so plainly instead of showing an address nobody reads.
 */
export const CONTACT_EMAIL = 'Workbench5@gmail.com';

/** Who runs Asset Bench — named in the footer, terms, privacy and refund pages. */
export const OPERATOR_NAME = 'Workbench Labs';
