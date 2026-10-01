import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIAL_DAYS, freeDaysRemaining, hasAccess, isFreePeriodActive, trialEndsAt } from '../src/shared/config/billing.js';
import { initTrial } from '../src/services/TrialService.js';
import worker from '../worker/index.js';

test('trial ends at exactly 72 hours and blocks unlicensed access', async () => {
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const start = Date.UTC(2026, 8, 30, 12);
  let now = start;
  const values = new Map();
  Date.now = () => now;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ startedAt: start, now: start }) });

  try {
    await initTrial();
    assert.equal(TRIAL_DAYS, 3);
    assert.equal(trialEndsAt(), start + 72 * 60 * 60 * 1000);
    assert.equal(freeDaysRemaining(), 3);
    now = trialEndsAt() - 1;
    assert.equal(isFreePeriodActive(), true);
    assert.equal(hasAccess(), true);
    assert.equal(freeDaysRemaining(), 1);
    now = trialEndsAt();
    assert.equal(isFreePeriodActive(), false);
    assert.equal(hasAccess(), false);
    assert.equal(freeDaysRemaining(), 0);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }
});

test('worker preserves the earliest trial start for an IP', async () => {
  const originalNow = Date.now;
  const start = Date.UTC(2026, 8, 30, 12);
  let now = start;
  Date.now = () => now;
  const records = new Map();
  const env = {
    TRIALS: {
      get: async (key) => records.get(key) ?? null,
      put: async (key, value) => records.set(key, value),
    },
    ASSETS: { fetch: () => { throw Error('Unexpected asset request'); } },
  };
  const request = (startedAt) => new Request('https://example.test/api/trial', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': '198.51.100.7', 'Content-Type': 'application/json' },
    body: JSON.stringify({ startedAt }),
  });
  try {
    const first = await worker.fetch(request(null), env);
    assert.equal((await first.json()).startedAt, start);
    now += 4 * 86_400_000;
    const second = await worker.fetch(request(now), env);
    assert.equal((await second.json()).startedAt, start);
    assert.equal(records.size, 1);
  } finally {
    Date.now = originalNow;
  }
});
