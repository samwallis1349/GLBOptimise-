/**
 * Cloudflare Web Analytics. The site token is public (it's in every page's
 * beacon tag). The beacon is loaded by services/AnalyticsService.js unless
 * the visitor opts out, so in the Cloudflare dashboard this site must NOT use
 * "automatic setup" — otherwise Cloudflare bypasses the opt-out. '' disables it.
 */
export const CLOUDFLARE_ANALYTICS_TOKEN = 'b6c36233e3094049ac5ca51b94889bc8';
