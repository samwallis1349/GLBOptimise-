/**
 * Cloudflare Worker entry for www.assetbench.co.uk.
 *
 * Everything is static assets (./dist) except /api/*, which runs here first
 * (see run_worker_first in wrangler.jsonc): the per-visitor free trial
 * clock and the site-wide tool usage counter.
 *
 * Trial clock: the first time a visitor is seen, their trial start time is
 * stored in KV under a salted SHA-256 of their IP — the raw IP is never
 * stored. The browser also keeps its own copy in localStorage and sends it
 * up; the server keeps whichever start is EARLIEST. So clearing browser
 * storage doesn't reset the trial (the IP remembers), and moving networks
 * doesn't either (the browser remembers). A client can only ever shorten
 * its own trial by sending a value, never extend it.
 *
 * Trial stats: each trial record also carries { startedAt } as KV metadata,
 * so GET /api/stats (owner only: "Authorization: Bearer <STATS_KEY>" secret)
 * can count trials per day from one list() - no IPs or hashes are returned.
 *
 * Usage counter: one KV key per tool (usage:<id>), with the count held in
 * the key's metadata so a single list() call reads every tool at once. The
 * read-modify-write can drop a count under a race, which is fine for a
 * popularity ranking. Reads are edge-cached for a few minutes.
 */

import { TOOLS } from '../src/shared/config/tools.js';

const TOOL_IDS = new Set(TOOLS.map((tool) => tool.id));
const USAGE_PREFIX = 'usage:';
const USAGE_CACHE_SECONDS = 300;
const TRIAL_PREFIX = 'trial:';
const DEVICE_PREFIX = 'device:';
const SITE_SALE_PREFIX = 'site-sale:';
const LICENSE_PRODUCT_ID = 1420844;
const SINGLE_TOOL_PRODUCT_ID = 1420925;
const BACKFILL_PER_CALL = 200; // older trial records without metadata, upgraded a few at a time
const DAY_MS = 86_400_000;

function trialPrefix(env) {
  return env.TRIAL_GENERATION ? `${TRIAL_PREFIX}${env.TRIAL_GENERATION}:` : TRIAL_PREFIX;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

/** IPv6 visitors often rotate the low 64 bits, so key on the /64 prefix. */
function ipKeySource(ip) {
  if (!ip.includes(':')) return ip;
  const [head] = ip.split('::');
  const groups = ip.includes('::') ? head.split(':') : ip.split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
}

async function hashIp(ip, salt) {
  const bytes = new TextEncoder().encode(`${salt}|${ipKeySource(ip)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashDevice(deviceId, salt) {
  const bytes = new TextEncoder().encode(`${salt}|${deviceId}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handleTrial(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const now = Date.now();
  const body = await request.json().catch(() => ({}));
  const clientStart = Number(body?.startedAt);
  const validClientStart = Number.isFinite(clientStart) && clientStart > 0 && clientStart <= now ? clientStart : null;

  // Validate device fingerprint (64-character hex string)
  const rawDeviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim().toLowerCase() : null;
  const validDeviceId = rawDeviceId && /^[a-f0-9]{64}$/.test(rawDeviceId) ? rawDeviceId : null;

  // Read cookie backup if present
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)__ab_trial=([0-9]+)/);
  const cookieStart = cookieMatch ? Number(cookieMatch[1]) : null;
  const validCookieStart = Number.isFinite(cookieStart) && cookieStart > 0 && cookieStart <= now ? cookieStart : null;

  const ip = request.headers.get('CF-Connecting-IP');
  const salt = env.TRIAL_SALT || 'assetbench-trial';

  if (!ip || !env.TRIALS) {
    // No IP (local dev) or KV not bound — fall back to the browser's own clock, cookie, or now.
    const startedAt = Math.min(...[validClientStart, validCookieStart, now].filter(Boolean));
    const res = json({ startedAt, now });
    res.headers.set('Set-Cookie', `__ab_trial=${startedAt}; Path=/; Max-Age=315360000; SameSite=Lax; Secure`);
    return res;
  }

  const ipKey = `${trialPrefix(env)}${await hashIp(ip, salt)}`;
  const storedIpStart = Number(await env.TRIALS.get(ipKey)) || null;

  let storedDevStart = null;
  let devKey = null;
  if (validDeviceId) {
    devKey = `${DEVICE_PREFIX}${await hashDevice(validDeviceId, salt)}`;
    storedDevStart = Number(await env.TRIALS.get(devKey)) || null;
  }

  // Earliest anchor wins: IP store, Device store, Cookie, LocalStorage, or Now
  const startedAt = Math.min(...[storedIpStart, storedDevStart, validCookieStart, validClientStart, now].filter(Boolean));

  if (startedAt !== storedIpStart) {
    // No expiry: one trial per visitor, ever.
    await env.TRIALS.put(ipKey, String(startedAt), { metadata: { startedAt } });
  }

  if (devKey && startedAt !== storedDevStart) {
    await env.TRIALS.put(devKey, String(startedAt), { metadata: { startedAt } });
  }

  const res = json({ startedAt, now });
  res.headers.set('Set-Cookie', `__ab_trial=${startedAt}; Path=/; Max-Age=315360000; SameSite=Lax; Secure`);
  return res;
}

async function handleUsage(request, env, ctx) {
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const tool = body?.tool;
    if (!TOOL_IDS.has(tool)) return json({ error: 'Unknown tool' }, 400);
    if (!env.TRIALS) return json({ ok: true });
    const key = USAGE_PREFIX + tool;
    const { metadata } = await env.TRIALS.getWithMetadata(key);
    const count = (Number(metadata?.count) || 0) + 1;
    await env.TRIALS.put(key, '', { metadata: { count } });
    return json({ ok: true });
  }
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL('/api/usage', request.url));
  const hit = await cache?.match(cacheKey);
  if (hit) return hit;

  const counts = {};
  if (env.TRIALS) {
    let cursor;
    do {
      const page = await env.TRIALS.list({ prefix: USAGE_PREFIX, cursor });
      for (const { name, metadata } of page.keys) {
        const id = name.slice(USAGE_PREFIX.length);
        if (TOOL_IDS.has(id)) counts[id] = Number(metadata?.count) || 0;
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
  }
  const response = new Response(JSON.stringify({ counts }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${USAGE_CACHE_SECONDS}` },
  });
  if (cache) ctx?.waitUntil?.(cache.put(cacheKey, response.clone()));
  return response;
}

async function validWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const expected = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return mismatch === 0;
}

/** Store only order ID, product, amount, currency and date; never customer details. */
async function handleSalesWebhook(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET || !env.TRIALS) return json({ error: 'Sales webhook is not configured' }, 503);
  const rawBody = await request.text();
  if (!await validWebhookSignature(rawBody, request.headers.get('X-Signature'), env.LEMONSQUEEZY_WEBHOOK_SECRET)) return json({ error: 'Invalid signature' }, 401);
  const payload = JSON.parse(rawBody);
  const event = payload.meta?.event_name ?? request.headers.get('X-Event-Name');
  if (event !== 'order_created') return json({ ok: true, ignored: true });
  const order = payload.data;
  const orderProductId = Number(attributes.first_order_item?.product_id);
  if ((orderProductId !== LICENSE_PRODUCT_ID && orderProductId !== SINGLE_TOOL_PRODUCT_ID) || attributes.test_mode || attributes.status !== 'paid') return json({ ok: true, ignored: true });
  const totalCents = Math.round(Number(attributes.total) * 100);
  const currency = String(attributes.currency ?? '').toUpperCase();
  if (!order?.id || !Number.isFinite(totalCents) || totalCents < 0 || !/^[A-Z]{3}$/.test(currency)) return json({ error: 'Invalid order data' }, 400);
  const sale = { productId: orderProductId, cents: totalCents, currency, createdAt: attributes.created_at ?? new Date().toISOString() };
  await env.TRIALS.put(`${SITE_SALE_PREFIX}${order.id}`, JSON.stringify(sale), { metadata: sale });
  return json({ ok: true });
}

/** Owner-only trial counts: total, today, last 7 / 30 days and a per-day series. */
async function handleStats(request, env) {
  if (!env.STATS_KEY) return json({ error: 'Not found' }, 404); // disabled until the secret is set
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('Authorization') !== `Bearer ${env.STATS_KEY}`) return json({ error: 'Unauthorized' }, 401);
  if (!env.TRIALS) return json({ ok: true, total: 0, days: [] });

  const now = Date.now();
  const starts = [];
  let unknown = 0;
  let backfill = BACKFILL_PER_CALL;
  let cursor;
  do {
    const page = await env.TRIALS.list({ prefix: trialPrefix(env), cursor });
    for (const { name, metadata } of page.keys) {
      let startedAt = Number(metadata?.startedAt) || null;
      if (!startedAt && backfill > 0) {
        backfill--;
        startedAt = Number(await env.TRIALS.get(name)) || null;
        if (startedAt) await env.TRIALS.put(name, String(startedAt), { metadata: { startedAt } });
      }
      if (startedAt) starts.push(startedAt);
      else unknown++;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const byDay = new Map();
  for (const s of starts) byDay.set(dayOf(s), (byDay.get(dayOf(s)) ?? 0) + 1);
  const days = Array.from({ length: 30 }, (_, i) => dayOf(now - (29 - i) * DAY_MS)).map((date) => ({ date, trials: byDay.get(date) ?? 0 }));
  const since = (ms) => starts.filter((s) => s >= now - ms).length;
  const sales = new Map();
  let saleCount = 0;
  let saleCursor;
  do {
    const page = await env.TRIALS.list({ prefix: SITE_SALE_PREFIX, cursor: saleCursor });
    for (const { name } of page.keys) {
      const sale = await env.TRIALS.get(name, 'json');
      if (sale?.productId !== LICENSE_PRODUCT_ID && sale?.productId !== SINGLE_TOOL_PRODUCT_ID) continue;
      saleCount++;
      sales.set(sale.currency, (sales.get(sale.currency) ?? 0) + Number(sale.cents ?? 0));
    }
    saleCursor = page.list_complete ? null : page.cursor;
  } while (saleCursor);
  return json({
    ok: true,
    total: starts.length + unknown,
    today: byDay.get(dayOf(now)) ?? 0,
    last7: since(7 * DAY_MS),
    last30: since(30 * DAY_MS),
    active: since(3 * DAY_MS), // trials still running (3-day trial)
    days,
    undated: unknown,
    sales: { count: saleCount, amounts: [...sales].map(([currency, cents]) => ({ currency, cents })) },
    now,
  });
}

async function handleToolBinding(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await request.json().catch(() => ({}));
  const rawKey = String(body?.key ?? '').trim().toLowerCase();
  const toolId = body?.toolId;
  if (!rawKey) return json({ error: 'Missing key' }, 400);
  if (!env.TRIALS) return json({ ok: true, toolId: toolId ?? null });

  const kvKey = `bound-tool:${await hashIp(rawKey, env.TRIAL_SALT || 'assetbench-binding')}`;
  const existing = await env.TRIALS.get(kvKey);
  if (existing) {
    return json({ ok: true, toolId: existing });
  }
  if (toolId && TOOL_IDS.has(toolId)) {
    await env.TRIALS.put(kvKey, toolId);
    return json({ ok: true, toolId });
  }
  return json({ ok: true, toolId: null });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/trial') return handleTrial(request, env);
    if (pathname === '/api/usage') return handleUsage(request, env, ctx);
    if (pathname === '/api/tool-binding') return handleToolBinding(request, env);
    if (pathname === '/api/stats') return handleStats(request, env);
    if (pathname === '/api/sales-webhook') return handleSalesWebhook(request, env);
    if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
