import test from 'node:test';
import assert from 'node:assert/strict';
import { ADSENSE_ENABLED, ADSENSE_SLOTS, adSlotFor, hasAdSenseClient } from '../src/shared/config/ads.js';
import { adsense } from '../scripts/adsense.mjs';

test('every ad placement is off while AdSense is disabled or unconfigured', () => {
  if (ADSENSE_ENABLED) return; // only meaningful in the shipped default state
  for (const placement of Object.keys(ADSENSE_SLOTS)) assert.equal(adSlotFor(placement), null);
});

test('unknown placements never resolve to a slot', () => {
  assert.equal(adSlotFor('not-a-placement'), null);
});

test('build plugin adds no verification tag without a valid publisher ID', () => {
  if (hasAdSenseClient()) return;
  assert.deepEqual(adsense().transformIndexHtml(), []);
});
