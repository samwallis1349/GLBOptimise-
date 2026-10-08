import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_TOOLS_FREE, TRIAL_DAYS, freeDaysRemaining, hasAccess, isFreePeriodActive, trialEndsAt } from '../src/shared/config/billing.js';
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
    assert.equal(hasAccess(), ALL_TOOLS_FREE);
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

test('device fingerprint prevents trial reset when IP changes via VPN', async () => {
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
  const deviceId = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
  const req = (ip, startedAt, devId) => new Request('https://example.test/api/trial', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startedAt, deviceId: devId }),
  });
  try {
    // Visitor on original IP (home network) starts trial
    const first = await worker.fetch(req('198.51.100.7', null, deviceId), env);
    assert.equal((await first.json()).startedAt, start);

    // 4 days later: visitor switches to a VPN (new IP) and opens Incognito (no startedAt sent)
    now += 4 * 86_400_000;
    const vpnVisit = await worker.fetch(req('203.0.113.99', null, deviceId), env);
    // Worker recognises device fingerprint and returns original start time
    assert.equal((await vpnVisit.json()).startedAt, start);
  } finally {
    Date.now = originalNow;
  }
});

test('owner stats count trials per day without exposing visitors', async () => {
  const day = 86_400_000;
  const now = Date.UTC(2026, 9, 2, 12);
  const originalNow = Date.now;
  Date.now = () => now;
  const records = new Map([
    ['trial:a', { value: String(now - 1000), metadata: { startedAt: now - 1000 } }],
    ['trial:b', { value: String(now - 2 * day), metadata: null }], // older record: backfilled
    ['trial:c', { value: String(now - 20 * day), metadata: { startedAt: now - 20 * day } }],
    ['usage:inspect-glb', { value: '', metadata: { count: 5 } }],
  ]);
  const env = {
    STATS_KEY: 'secret',
    TRIALS: {
      get: async (key) => records.get(key)?.value ?? null,
      put: async (key, value, opts) => records.set(key, { value, metadata: opts?.metadata ?? null }),
      list: async ({ prefix }) => ({ keys: [...records].filter(([k]) => k.startsWith(prefix)).map(([name, r]) => ({ name, metadata: r.metadata })), list_complete: true }),
    },
  };
  const ask = (auth) => worker.fetch(new Request('https://example.test/api/stats', { headers: auth ? { Authorization: auth } : {} }), env);
  try {
    assert.equal((await ask()).status, 401);
    assert.equal((await ask('Bearer wrong')).status, 401);
    const body = await (await ask('Bearer secret')).json();
    assert.deepEqual([body.total, body.today, body.active, body.last7, body.last30], [3, 1, 2, 2, 3]);
    assert.equal(body.days.length, 30);
    assert.equal(records.get('trial:b').metadata.startedAt, now - 2 * day);
    assert.ok(!JSON.stringify(body).includes('trial:'));
    assert.equal((await worker.fetch(new Request('https://example.test/api/stats'), { TRIALS: env.TRIALS })).status, 404);
  } finally {
    Date.now = originalNow;
  }
});
