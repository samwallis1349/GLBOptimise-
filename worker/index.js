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
 * Usage counter (23 Oct 2026): opens (a visit to a tool's page) and runs (a
 * file picked or dropped into a tool) per tool, kept by one Durable Object
 * (UsageCounter below, binding USAGE) so every hit is added one at a time and
 * none is lost. On its first use it takes the old KV counts (usage:<id>, which
 * were opens once per browser per day and could drop hits under a race) as its
 * starting opens. Without the USAGE binding it falls back to those KV keys.
 * Reads are edge-cached for a minute.
 */

import { TOOLS, getOrderedTools } from '../src/shared/config/tools.js';
import { TRIPO_URL } from '../src/shared/config/tripo.js';
import { bump } from './api/stats.js';
import { handleApiV1 } from './api/index.js';
import { handleApiBillingEvent, isApiProduct } from './api/billing.js';

const TOOL_IDS = new Set(TOOLS.map((tool) => tool.id));
const USAGE_PREFIX = 'usage:';
const USAGE_CACHE_SECONDS = 60;
const USAGE_KINDS = new Set(['open', 'run']);
const TRIAL_PREFIX = 'trial:';
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
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-banner-key',
};

/** IPv6 visitors often rotate the low 64 bits, so key on the /64 prefix. */
function ipKeySource(ip) {
  if (!ip.includes(':')) return ip;
  const [head] = ip.split('::');
  const groups = ip.includes('::') ? head.split(':') : ip.split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
}

async function sha256Bytes(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text))));
}

async function hashKey(key, salt) {
  const digest = await sha256Bytes(`${salt}|${key}`);
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashIp(ip, salt) {
  return hashKey(ipKeySource(ip), salt);
}

async function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const [da, db] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  let diff = a.length ^ b.length;
  for (let i = 0; i < da.length; i += 1) diff |= da[i] ^ db[i];
  return diff === 0;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const MIN_TRIAL_EPOCH = Date.UTC(2026, 0, 1);
const TRIAL_WINDOW_MS = 4 * DAY_MS;
const MAX_CLIENT_AGE_MS = 365 * DAY_MS;

async function handleTrial(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const now = Date.now();
  const minValid = Math.max(MIN_TRIAL_EPOCH, now - MAX_CLIENT_AGE_MS);
  const body = await request.json().catch(() => ({}));
  const clientStart = Number(body?.startedAt);
  const validClientStart = Number.isFinite(clientStart) && clientStart >= minValid && clientStart <= now ? clientStart : null;

  // Read cookie backup if present
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)__ab_trial=([0-9]+)/);
  const cookieStart = cookieMatch ? Number(cookieMatch[1]) : null;
  const validCookieStart = Number.isFinite(cookieStart) && cookieStart >= minValid && cookieStart <= now ? cookieStart : null;

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

  // Only allow an active (non-expired) client/cookie timestamp to backdate a
  // shared network IP record, preventing an attacker from sending { startedAt: 1 }
  // to expire the trial for everyone on the same office/VPN/carrier subnet.
  const activeClientStart = validClientStart && validClientStart >= now - TRIAL_WINDOW_MS ? validClientStart : null;
  const activeCookieStart = validCookieStart && validCookieStart >= now - TRIAL_WINDOW_MS ? validCookieStart : null;
  const ipStart = Math.min(...[storedIpStart, activeCookieStart, activeClientStart, now].filter(Boolean));

  if (ipStart !== storedIpStart) {
    // No expiry: one trial per visitor, ever.
    await env.TRIALS.put(ipKey, String(ipStart), { metadata: { startedAt: ipStart } });
  }

  // Earliest anchor wins for this visitor: IP store, cookie, localStorage, or now.
  const startedAt = Math.min(...[ipStart, validCookieStart, validClientStart, now].filter(Boolean));

  const res = json({ startedAt, now });
  res.headers.set('Set-Cookie', `__ab_trial=${startedAt}; Path=/; Max-Age=315360000; SameSite=Lax; Secure`);
  return res;
}

async function handleUsage(request, env, ctx) {
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const tool = body?.tool;
    const kind = body?.kind ?? 'open';
    if (!TOOL_IDS.has(tool) || !USAGE_KINDS.has(kind)) return json({ error: 'Unknown tool' }, 400);
    if (env.USAGE) {
      await usageStub(env).fetch('https://usage/hit', { method: 'POST', body: JSON.stringify({ tool, kind }) });
      return json({ ok: true });
    }
    if (!env.TRIALS || kind !== 'open') return json({ ok: true });
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

  // `counts` (= opens) is what the tool grids rank by; `opens` and `runs` are the full picture.
  let data;
  if (env.USAGE) data = await (await usageStub(env).fetch('https://usage/counts')).json();
  else {
    const opens = await kvUsageCounts(env);
    data = { opens, runs: {}, since: null };
  }
  const response = new Response(JSON.stringify({ counts: data.opens, opens: data.opens, runs: data.runs, since: data.since }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${USAGE_CACHE_SECONDS}` },
  });
  if (cache) ctx?.waitUntil?.(cache.put(cacheKey, response.clone()));
  return response;
}

const usageStub = (env) => env.USAGE.get(env.USAGE.idFromName('site'));

/** The old KV counters: { toolId: count }. */
async function kvUsageCounts(env) {
  const counts = {};
  if (!env.TRIALS) return counts;
  let cursor;
  do {
    const page = await env.TRIALS.list({ prefix: USAGE_PREFIX, cursor });
    for (const { name, metadata } of page.keys) {
      const id = name.slice(USAGE_PREFIX.length);
      if (TOOL_IDS.has(id)) counts[id] = Number(metadata?.count) || 0;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return counts;
}

/**
 * The site's one usage counter (Durable Object). Requests reach it one at a time,
 * so read + add + write can't lose a hit. Keys: "open:<tool>", "run:<tool>", "since".
 */
export class UsageCounter {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
  }

  async seed() {
    if (await this.storage.get('since')) return;
    const old = await kvUsageCounts(this.env);
    const entries = Object.fromEntries(Object.entries(old).map(([id, n]) => [`open:${id}`, n]));
    await this.storage.put({ ...entries, since: new Date().toISOString() });
  }

  // Strictly one request after another (a Durable Object already holds other requests while it waits on its
  // storage; the queue makes the read + add + write safe without relying on that).
  fetch(request) {
    const run = (this.queue ?? Promise.resolve()).then(() => this.handle(request));
    this.queue = run.catch(() => {});
    return run;
  }

  async handle(request) {
    await this.seed();
    const { pathname } = new URL(request.url);
    if (pathname === '/hit' && request.method === 'POST') {
      const { tool, kind } = await request.json();
      if (!TOOL_IDS.has(tool) || !USAGE_KINDS.has(kind)) return json({ error: 'Unknown tool' }, 400);
      const key = `${kind}:${tool}`;
      await this.storage.put(key, ((await this.storage.get(key)) ?? 0) + 1);
      return json({ ok: true });
    }
    if (pathname === '/counts') {
      const all = await this.storage.list();
      const opens = {};
      const runs = {};
      for (const [key, n] of all) {
        const [kind, id] = key.split(/:(.+)/);
        if (kind === 'open' && TOOL_IDS.has(id)) opens[id] = n;
        if (kind === 'run' && TOOL_IDS.has(id)) runs[id] = n;
      }
      return json({ opens, runs, since: all.get('since') ?? null });
    }
    return json({ error: 'Not found' }, 404);
  }
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
  // Cloud API subscriptions (license key = API key) are handled separately from site sales.
  const api = await handleApiBillingEvent(env, event, payload);
  if (api.handled) return json({ ok: true, api: api.action });
  if (event !== 'order_created') return json({ ok: true, ignored: true });
  const order = payload.data;
  const attributes = order?.attributes ?? {};
  const orderProductId = Number(attributes.first_order_item?.product_id);
  const isKnownProduct = orderProductId === LICENSE_PRODUCT_ID || orderProductId === SINGLE_TOOL_PRODUCT_ID || isApiProduct(env, orderProductId);
  if (!isKnownProduct || attributes.test_mode || attributes.status !== 'paid') return json({ ok: true, ignored: true });
  const totalCents = Math.round(Number(attributes.total)); // Lemon Squeezy sends totals in the smallest unit already (pence)
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
  if (!(await timingSafeEqual(request.headers.get('Authorization') || '', `Bearer ${env.STATS_KEY}`))) {
    return json({ error: 'Unauthorized' }, 401);
  }
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
      if (sale?.productId !== LICENSE_PRODUCT_ID && sale?.productId !== SINGLE_TOOL_PRODUCT_ID && !isApiProduct(env, sale?.productId)) continue;
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
    active: since(4 * DAY_MS), // trials still running (4-day trial)
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
  if (!rawKey || rawKey.length > 256) return json({ error: 'Missing key' }, 400);
  if (!env.TRIALS) return json({ ok: true, toolId: toolId ?? null });

  const kvKey = `bound-tool:${await hashKey(rawKey, env.TRIAL_SALT || 'assetbench-binding')}`;
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

const BANNER_PREFIX = 'banner:';
const BANNER_ACTIVE_KEY = 'banner_active:current';

function sanitizeBannerUrl(raw) {
  const s = String(raw ?? '').trim().slice(0, 1024);
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') return s;
  } catch { /* reject malformed or dangerous schemes like javascript: */ }
  return '';
}

async function isBannerAuthorized(request, env) {
  const secret = env.BANNER_SECRET || env.API_ADMIN_KEY || env.STATS_KEY;
  if (!secret) return true; // Simple route: open in local dev/test unless an admin secret is configured
  const authHeader = request.headers.get('Authorization');
  if (authHeader && ((await timingSafeEqual(authHeader, `Bearer ${secret}`)) || (await timingSafeEqual(authHeader, secret)))) {
    return true;
  }
  const keyHeader = request.headers.get('x-api-key') || request.headers.get('x-banner-key');
  if (keyHeader && (await timingSafeEqual(keyHeader, secret))) return true;
  const url = new URL(request.url);
  const queryKey = url.searchParams.get('key');
  if (queryKey && (await timingSafeEqual(queryKey, secret))) return true;
  return false;
}

function detectMediaType(url) {
  if (!url) return 'image';
  const clean = url.toLowerCase().split('?')[0];
  if (
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.mov') ||
    clean.endsWith('.m4v') ||
    url.includes('youtube.com') ||
    url.includes('youtu.be') ||
    url.includes('vimeo.com')
  ) {
    return 'video';
  }
  return 'image';
}

// Banner pictures and videos sent as files (the Game's social agent posts local files), kept in KV beside
// the banner: POST /api/banner/media?name=<banner> with the raw bytes and their Content-Type, then use the
// returned mediaUrl in POST /api/banner. GET serves it, with byte ranges so Safari plays videos.
const BANNER_MEDIA_PREFIX = 'banner_media:';
const BANNER_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']);
const BANNER_MEDIA_MAX = 24 * 1024 * 1024; // KV values top out at 25 MiB

async function handleBannerMedia(request, env, url) {
  const name = String(url.searchParams.get('name') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 80);
  if (!name) return json({ error: 'Missing banner name' }, 400);
  if (!env.TRIALS) return json({ error: 'KV unavailable' }, 503);

  if (request.method === 'POST') {
    if (!(await isBannerAuthorized(request, env))) return json({ error: 'Unauthorized' }, 401);
    const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!BANNER_MEDIA_TYPES.has(type)) return json({ error: `Unsupported type '${type}' (JPEG, PNG, WebP, GIF, MP4 or WebM)` }, 415);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return json({ error: 'Empty file' }, 400);
    if (bytes.byteLength > BANNER_MEDIA_MAX) return json({ error: 'File over 24 MB' }, 413);
    const version = Date.now();
    await env.TRIALS.put(`${BANNER_MEDIA_PREFIX}${name}`, bytes, { metadata: { type, version } });
    return json({
      ok: true,
      mediaUrl: `/api/banner/media?name=${encodeURIComponent(name)}&v=${version}`,
      mediaType: type.startsWith('video/') ? 'video' : 'image',
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405);
  const { value, metadata } = await env.TRIALS.getWithMetadata(`${BANNER_MEDIA_PREFIX}${name}`, 'arrayBuffer');
  if (!value) return json({ error: 'Not found' }, 404);
  const size = value.byteLength;
  const headers = {
    'Content-Type': metadata?.type || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    // Each upload gets a new ?v=, so a given address never changes.
    'Cache-Control': url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(request.method === 'HEAD' ? null : value.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(request.method === 'HEAD' ? null : value, { headers: { ...headers, 'Content-Length': String(size) } });
}

/**
 * GET /api/banner/slots - every advert card's reference name, as a shortlist for other programs: the homepage's
 * (advert, advert-2... one every 3 rows of tools, pages/home/HomePage.js) and one per tool page (ad-<tool id>,
 * app/routes.js), each with what's in it now. Public, like GET /api/banner.
 */
async function bannerSlots(env) {
  const home = [];
  for (let k = 0, at = 2; at < getOrderedTools().length - 1; k += 1, at += 9) home.push({ name: k ? `advert-${k + 1}` : 'advert', page: '/', where: k ? `homepage, after ${3 * k + 2} rows of tools` : 'homepage, under the first block of tools' });
  const tools = TOOLS.filter((t) => t.route).map((t) => ({ name: `ad-${t.id}`, page: t.route, where: `bottom of ${t.name}` }));
  const filled = async (slot) => ({ ...slot, filled: !!(env.TRIALS && (await env.TRIALS.get(`${BANNER_PREFIX}${slot.name}`))) });
  return {
    ok: true,
    update: `POST /api/banner (Authorization: Bearer <API_ADMIN_KEY>) { name, active: false, text, title?, badge?, mediaUrl?, mediaType?, linkUrl?, linkText? }`,
    home: await Promise.all(home.map(filled)),
    tools: await Promise.all(tools.map(filled)),
  };
}

async function handleBanner(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname === '/api/banner/slots' && request.method === 'GET') return json(await bannerSlots(env));

  if (pathname === '/api/banner/media' && request.method !== 'OPTIONS') return handleBannerMedia(request, env, url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-banner-key',
      },
    });
  }

  // GET /api/banners — list all stored named banners
  if (pathname === '/api/banners' && request.method === 'GET') {
    if (!env.TRIALS) return json({ ok: true, active: null, count: 0, banners: [] });
    const activeName = (await env.TRIALS.get(BANNER_ACTIVE_KEY)) || null;
    const list = await env.TRIALS.list({ prefix: BANNER_PREFIX });
    const banners = [];
    for (const key of list.keys) {
      const data = await env.TRIALS.get(key.name, 'json');
      if (data) banners.push(data);
    }
    return json({ ok: true, active: activeName, count: banners.length, banners });
  }

  // POST /api/banner/active — switch active banner by name
  if (pathname === '/api/banner/active' && request.method === 'POST') {
    if (!(await isBannerAuthorized(request, env))) return json({ error: 'Unauthorized' }, 401);
    if (!env.TRIALS) return json({ error: 'KV unavailable' }, 503);
    const body = await request.json().catch(() => ({}));
    const targetName = String(body?.name ?? '').trim().toLowerCase();
    if (!targetName) return json({ error: 'Missing banner name' }, 400);

    const exists = await env.TRIALS.get(`${BANNER_PREFIX}${targetName}`);
    if (!exists) return json({ error: `Banner '${targetName}' not found` }, 404);

    await env.TRIALS.put(BANNER_ACTIVE_KEY, targetName);
    return json({ ok: true, message: `Active banner switched to '${targetName}'`, active: targetName });
  }

  // DELETE /api/banner — delete a named banner
  if (pathname === '/api/banner' && request.method === 'DELETE') {
    if (!(await isBannerAuthorized(request, env))) return json({ error: 'Unauthorized' }, 401);
    if (!env.TRIALS) return json({ error: 'KV unavailable' }, 503);
    const body = await request.json().catch(() => ({}));
    const targetName = String(url.searchParams.get('name') || body?.name || '').trim().toLowerCase();
    if (!targetName) return json({ error: 'Missing banner name' }, 400);

    await env.TRIALS.delete(`${BANNER_PREFIX}${targetName}`);
    const active = await env.TRIALS.get(BANNER_ACTIVE_KEY);
    if (active === targetName) {
      await env.TRIALS.delete(BANNER_ACTIVE_KEY);
    }
    return json({ ok: true, message: `Banner '${targetName}' deleted`, deleted: targetName });
  }

  // GET /api/banner — retrieve active banner (or specific banner by ?name=...)
  if (request.method === 'GET') {
    if (!env.TRIALS) return json({ ok: true, active: null, banner: null });
    const requested = url.searchParams.get('name');
    const activeName = (await env.TRIALS.get(BANNER_ACTIVE_KEY)) || null;
    const targetName = requested ? requested.trim().toLowerCase() : activeName;

    if (!targetName) return json({ ok: true, active: null, banner: null });
    const banner = await env.TRIALS.get(`${BANNER_PREFIX}${targetName}`, 'json');
    return json({ ok: true, active: activeName, banner: banner || null });
  }

  // POST /api/banner — create or update a banner post
  if (request.method === 'POST') {
    if (!(await isBannerAuthorized(request, env))) return json({ error: 'Unauthorized' }, 401);
    if (!env.TRIALS) return json({ error: 'KV unavailable' }, 503);
    const body = await request.json().catch(() => ({}));

    const rawName = String(body?.name ?? body?.id ?? 'featured').trim().toLowerCase();
    const cleanName = rawName.replace(/[^a-z0-9_-]/g, '-').slice(0, 80) || 'featured';

    const mediaUrl = sanitizeBannerUrl(body?.mediaUrl || body?.videoUrl || body?.imageUrl || '');
    const mediaType = body?.mediaType === 'video' || body?.mediaType === 'image'
      ? body.mediaType
      : detectMediaType(mediaUrl);

    const record = {
      name: cleanName,
      title: String(body?.title ?? 'Featured Announcement').trim().slice(0, 200),
      text: String(body?.text || body?.description || '').trim().slice(0, 1000),
      badge: String(body?.badge ?? 'UPDATE').trim().slice(0, 40),
      mediaUrl,
      mediaType,
      linkUrl: sanitizeBannerUrl(body?.linkUrl || body?.url || ''),
      linkText: String(body?.linkText || body?.ctaText || 'Learn More →').trim().slice(0, 80),
      updatedAt: Date.now(),
    };

    await env.TRIALS.put(`${BANNER_PREFIX}${cleanName}`, JSON.stringify(record));

    // Make active if requested or if no active banner currently exists
    const makeActive = body?.active !== false;
    const currentActive = await env.TRIALS.get(BANNER_ACTIVE_KEY);
    if (makeActive || !currentActive) {
      await env.TRIALS.put(BANNER_ACTIVE_KEY, cleanName);
    }

    return json({
      ok: true,
      message: `Banner '${cleanName}' saved successfully`,
      active: makeActive || !currentActive,
      banner: record,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}

async function handleIllustrationEnquiry(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: JSON_HEADERS,
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().slice(0, 200);
  const email = String(body?.email ?? '').trim().slice(0, 254);
  const projectType = String(body?.projectType ?? '').trim().slice(0, 120);
  const budget = String(body?.budget ?? '').trim().slice(0, 120);
  const description = String(body?.description ?? '').trim().slice(0, 5000);

  if (!name || !email || !description) {
    return json({ error: 'Missing required fields (name, email, description)' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email address' }, 400);
  }

  const record = {
    name,
    email,
    projectType,
    budget,
    description,
    source: String(body?.source ?? 'illustration.assetbench.co.uk').slice(0, 120),
    ip: request.headers.get('CF-Connecting-IP') || 'unknown',
    submittedAt: new Date().toISOString(),
  };

  if (env.TRIALS) {
    const suffix = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
    const key = `illustration-enquiry:${Date.now()}-${suffix}`;
    await env.TRIALS.put(key, JSON.stringify(record), { metadata: { name, email, projectType, budget, submittedAt: record.submittedAt } });
  }

  return json({
    ok: true,
    message: 'Thank you! Your project enquiry has been received. I will be in touch shortly.',
    enquiry: { name, projectType, budget },
  });
}

/**
 * Email list (homepage free-model download). POST {email, source} saves one
 * record per address in KV (subscriber:<email>); signing up again only
 * refreshes it. GET with the STATS_KEY bearer exports the list as CSV.
 */
const SUBSCRIBER_PREFIX = 'subscriber:';
async function handleSubscribe(request, env) {
  if (request.method === 'GET') {
    if (!env.STATS_KEY) return json({ error: 'Not found' }, 404);
    if (!(await timingSafeEqual(request.headers.get('Authorization') || '', `Bearer ${env.STATS_KEY}`))) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const rows = [['email', 'source', 'subscribed_at']];
    let cursor;
    do {
      const page = env.TRIALS ? await env.TRIALS.list({ prefix: SUBSCRIBER_PREFIX, cursor }) : { keys: [], list_complete: true };
      for (const { name, metadata } of page.keys) rows.push([name.slice(SUBSCRIBER_PREFIX.length), metadata?.source || '', metadata?.at || '']);
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email address' }, 400);
  const record = { email, source: String(body?.source ?? 'site').slice(0, 60), at: new Date().toISOString() };
  if (env.TRIALS) await env.TRIALS.put(`${SUBSCRIBER_PREFIX}${email}`, JSON.stringify(record), { metadata: { source: record.source, at: record.at } });
  return json({ ok: true });
}

// Static files get their security headers from public/_headers, which does not
// cover responses made here, so the API sets the ones that apply to it.
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export default {
  async fetch(request, env, ctx) {
    const res = await route(request, env, ctx);
    const secured = new Response(res.body, res);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
    return secured;
  },
};

async function route(request, env, ctx) {
  const { pathname } = new URL(request.url);
  // /go/tripo: our own short link to the Tripo affiliate link, counted here (tripo_go) whatever the visitor's blocker
  // does next. Compare it with Impact's click count to see how many are lost (services/TripoLinks.js).
  if (pathname === '/go/tripo') {
    ctx.waitUntil(bump(env, 'tripo_go'));
    return new Response(null, { status: 302, headers: { Location: TRIPO_URL, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }
  if (pathname === '/api/trial') return handleTrial(request, env);
  if (pathname === '/api/usage') return handleUsage(request, env, ctx);
  if (pathname === '/api/tool-binding') return handleToolBinding(request, env);
  if (pathname === '/api/stats') return handleStats(request, env);
  if (pathname === '/api/sales-webhook') return handleSalesWebhook(request, env);
  if (pathname === '/api/illustration-enquiry') return handleIllustrationEnquiry(request, env);
  if (pathname === '/api/subscribe') return handleSubscribe(request, env);
  if (pathname === '/api/banner' || pathname === '/api/banners' || pathname === '/api/banner/active' || pathname === '/api/banner/media' || pathname === '/api/banner/slots') {
    return handleBanner(request, env);
  }
  if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) return handleApiV1(request, env, ctx);
  if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
  return env.ASSETS.fetch(request);
}
