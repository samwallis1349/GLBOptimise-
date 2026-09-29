/**
 * Cloudflare Worker entry for www.assetbench.co.uk.
 *
 * Everything is static assets (./dist) except /api/*, which runs here first
 * (see run_worker_first in wrangler.jsonc). The only API today is the
 * per-visitor free trial clock.
 *
 * Trial clock: the first time a visitor is seen, their trial start time is
 * stored in KV under a salted SHA-256 of their IP — the raw IP is never
 * stored. The browser also keeps its own copy in localStorage and sends it
 * up; the server keeps whichever start is EARLIEST. So clearing browser
 * storage doesn't reset the trial (the IP remembers), and moving networks
 * doesn't either (the browser remembers). A client can only ever shorten
 * its own trial by sending a value, never extend it.
 */

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handleTrial(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const now = Date.now();
  const body = await request.json().catch(() => ({}));
  const clientStart = Number(body?.startedAt);
  const validClientStart = Number.isFinite(clientStart) && clientStart > 0 && clientStart <= now ? clientStart : null;

  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !env.TRIALS) {
    // No IP (local dev) or KV not bound — fall back to the browser's own clock.
    return json({ startedAt: validClientStart ?? now, now });
  }

  const key = `trial:${await hashIp(ip, env.TRIAL_SALT || 'assetbench-trial')}`;
  const storedStart = Number(await env.TRIALS.get(key)) || null;

  const startedAt = Math.min(...[storedStart, validClientStart, now].filter(Boolean));
  if (startedAt !== storedStart) {
    // No expiry: one trial per visitor, ever.
    await env.TRIALS.put(key, String(startedAt));
  }

  return json({ startedAt, now });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/trial') return handleTrial(request, env);
    if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
