/**
 * Build-time Google AdSense files, driven entirely by src/shared/config/ads.js.
 *
 * Once ADSENSE_CLIENT_ID is set (whether or not ads are enabled yet), this:
 *   - adds <meta name="google-adsense-account"> to index.html, which is how
 *     Google verifies the site during review without loading any ad code
 *     (seoPages copies it into every per-route page, since it reads the
 *     built index.html), and
 *   - writes dist/ads.txt with the publisher's authorised-seller line.
 *
 * With no publisher ID, it does nothing.
 */

import { ADSENSE_CLIENT_ID, hasAdSenseClient, adsTxtLine } from '../src/shared/config/ads.js';

export function adsense() {
  return {
    name: 'asset-bench-adsense',
    transformIndexHtml() {
      if (!hasAdSenseClient()) return [];
      return [{ tag: 'meta', attrs: { name: 'google-adsense-account', content: ADSENSE_CLIENT_ID }, injectTo: 'head' }];
    },
    generateBundle() {
      if (ADSENSE_CLIENT_ID && !hasAdSenseClient()) {
        this.warn(`ADSENSE_CLIENT_ID "${ADSENSE_CLIENT_ID}" isn't in the ca-pub-XXXXXXXXXXXXXXXX format — AdSense stays off.`);
      }
      if (!hasAdSenseClient()) return;
      this.emitFile({ type: 'asset', fileName: 'ads.txt', source: `${adsTxtLine()}\n` });
    },
  };
}
