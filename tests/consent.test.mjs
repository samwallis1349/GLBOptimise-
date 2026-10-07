import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { getConsent, hasConsent, setConsent, onConsentChange, CONSENT_VERSION } = await import('../src/services/ConsentService.js');

test('before any choice, analytics defaults on and advertising stays off', () => {
  store.clear();
  assert.equal(getConsent(), null);
  assert.equal(hasConsent('necessary'), true);
  assert.equal(hasConsent('analytics'), true);
  assert.equal(hasConsent('advertising'), false);
});

test('a saved choice is stored minimally and applied per category', () => {
  store.clear();
  const seen = [];
  const off = onConsentChange((c) => seen.push(c));
  setConsent({ analytics: true });
  off();
  assert.equal(hasConsent('analytics'), true);
  assert.equal(hasConsent('advertising'), false);
  assert.deepEqual(Object.keys(JSON.parse(store.get('assetbench_consent_v1'))).sort(), ['advertising', 'analytics', 'at', 'v']);
  assert.equal(seen.length, 1);
});

test('a choice from another consent version is ignored, so analytics returns to its default', () => {
  store.clear();
  store.set('assetbench_consent_v1', JSON.stringify({ v: CONSENT_VERSION + 1, analytics: true, advertising: true }));
  assert.equal(getConsent(), null);
  assert.equal(hasConsent('analytics'), true);
});
