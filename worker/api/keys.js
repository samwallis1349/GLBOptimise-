import { PLANS } from './plans.js';
import { CONTACT_EMAIL } from '../../src/shared/config/app.js';
import { ApiError, sha256Hex } from './http.js';
import { LICENSE_KEY_PATTERN } from './billing.js';

/**
 * API keys and quotas, stored in the TRIALS KV namespace.
 *
 *   apikey:<sha256(key)>             -> { plan, label, createdAt, revoked }
 *   apiuse:<sha256(key)>:<period>    -> '' with metadata { count }
 *   apitrial:<sha256(salt|ip/64)>    -> key hash of the trial key issued to that network
 *
 * Only the hash of a key is ever stored, so a key is shown once at creation.
 * KV is eventually consistent, so quota counts can lag by a request or two
 * under concurrent calls; fine for metering, not for hard billing.
 */

const KEY_PREFIX = 'apikey:';
const USE_PREFIX = 'apiuse:';
const TRIAL_PREFIX = 'apitrial:';

function requireKv(env) {
  if (!env.TRIALS) throw new ApiError(503, 'storage_unavailable', 'Key storage is not configured on this deployment.');
  return env.TRIALS;
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `abk_live_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function periodFor(plan, now = Date.now()) {
  return plan.period === 'lifetime' ? 'lifetime' : new Date(now).toISOString().slice(0, 7);
}

function periodResetsAt(plan, now = Date.now()) {
  if (plan.period === 'lifetime') return null;
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

function ipKeySource(ip) {
  if (!ip.includes(':')) return ip;
  const [head] = ip.split('::');
  const groups = ip.includes('::') ? head.split(':') : ip.split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
}

// Short owner keys can be brute-forced over HTTP, so they never unlock owner actions.
const MIN_ADMIN_KEY_LENGTH = 24;

export async function isAdmin(request, env) {
  if (!env.API_ADMIN_KEY || env.API_ADMIN_KEY.length < MIN_ADMIN_KEY_LENGTH) return false;
  const header = request.headers.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!given) return false;
  return (await sha256Hex(given)) === (await sha256Hex(env.API_ADMIN_KEY));
}

/** Owner mints any plan; anyone else gets one trial key per network. */
export async function mintKey(request, env, body) {
  const kv = requireKv(env);
  const admin = await isAdmin(request, env);
  const planId = admin ? String(body?.plan ?? 'trial') : 'trial';
  const plan = PLANS[planId];
  if (!plan) throw new ApiError(400, 'unknown_plan', `Unknown plan '${planId}'.`, { plans: Object.keys(PLANS) });

  let trialKey = null;
  if (!admin) {
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) throw new ApiError(400, 'no_client_ip', 'Cannot issue a trial key without a client address.');
    trialKey = `${TRIAL_PREFIX}${await sha256Hex(`${env.TRIAL_SALT || 'assetbench-api'}|${ipKeySource(ip)}`)}`;
    if (await kv.get(trialKey)) {
      throw new ApiError(409, 'trial_already_issued', `A free API key has already been issued to this network. Email ${CONTACT_EMAIL} if you lost it.`);
    }
  }

  const key = newKey();
  const hash = await sha256Hex(key);
  const record = {
    plan: plan.id,
    label: String(body?.label ?? '').slice(0, 80) || null,
    createdAt: new Date().toISOString(),
    revoked: false,
  };
  await kv.put(`${KEY_PREFIX}${hash}`, JSON.stringify(record));
  if (trialKey) await kv.put(trialKey, hash);
  return { key, plan: plan.id, label: record.label, createdAt: record.createdAt };
}

export async function revokeKey(env, rawKeyOrHash) {
  const kv = requireKv(env);
  const value = String(rawKeyOrHash ?? '').trim();
  if (!value) throw new ApiError(400, 'missing_key', 'Pass the key (or its sha256 hash) to revoke.');
  const hash = /^[a-f0-9]{64}$/.test(value) ? value : await sha256Hex(value);
  const record = await kv.get(`${KEY_PREFIX}${hash}`, 'json');
  if (!record) throw new ApiError(404, 'key_not_found', 'No such key.');
  record.revoked = true;
  await kv.put(`${KEY_PREFIX}${hash}`, JSON.stringify(record));
  return { revoked: true };
}

function keyFromRequest(request) {
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return (request.headers.get('x-api-key') || '').trim();
}

async function readUsage(kv, hash, period) {
  const { metadata } = await kv.getWithMetadata(`${USE_PREFIX}${hash}:${period}`);
  return Number(metadata?.count) || 0;
}

/** Resolves the caller's key, or throws 401/403. */
export async function authenticate(request, env) {
  const kv = requireKv(env);
  let key = keyFromRequest(request);
  if (!key) throw new ApiError(401, 'missing_api_key', 'Send your key as "Authorization: Bearer abk_live_..." or "x-api-key". Get one at /docs.');
  // Lemon Squeezy license keys (paid plans) are matched upper-case; abk_live_ keys are trial/owner-minted.
  if (LICENSE_KEY_PATTERN.test(key)) key = key.toUpperCase();
  else if (!/^abk_live_[a-f0-9]{48}$/.test(key)) throw new ApiError(401, 'invalid_api_key', 'That API key is not valid.');
  const hash = await sha256Hex(key);
  const record = await kv.get(`${KEY_PREFIX}${hash}`, 'json');
  if (!record) throw new ApiError(401, 'invalid_api_key', 'That API key is not valid.');
  if (record.revoked) {
    throw record.source === 'lemonsqueezy'
      ? new ApiError(403, 'subscription_inactive', `Your subscription is ${record.subscriptionStatus || 'not active'}. Renew it in your Lemon Squeezy account to use this key again.`)
      : new ApiError(403, 'key_revoked', 'This API key has been revoked.');
  }
  const plan = PLANS[record.plan];
  if (!plan) throw new ApiError(403, 'unknown_plan', 'This key is attached to a plan that no longer exists.');
  return { hash, record, plan };
}

export async function quotaStatus(env, account) {
  const period = periodFor(account.plan);
  const used = await readUsage(env.TRIALS, account.hash, period);
  return {
    limit: account.plan.quota,
    used,
    remaining: Math.max(0, account.plan.quota - used),
    period,
    resetsAt: periodResetsAt(account.plan),
  };
}

/** Checks engine access and remaining quota before any work is done. */
export async function assertCanRun(env, account, engine) {
  if (engine !== 'any' && !account.plan.engines.includes(engine)) {
    throw new ApiError(403, 'engine_not_in_plan', `Your ${account.plan.name} plan does not include the ${engine.toUpperCase()} engine.`, { plan: account.plan.id, engines: account.plan.engines });
  }
  const quota = await quotaStatus(env, account);
  if (quota.remaining <= 0) {
    throw new ApiError(429, 'quota_exhausted', `You have used all ${quota.limit} operations for this ${account.plan.period === 'lifetime' ? 'trial' : 'month'}.`, quota);
  }
  return quota;
}

/** Charges `count` operations after a successful run. */
export async function chargeOperation(env, account, count = 1) {
  const period = periodFor(account.plan);
  const key = `${USE_PREFIX}${account.hash}:${period}`;
  const used = (await readUsage(env.TRIALS, account.hash, period)) + count;
  await env.TRIALS.put(key, '', { metadata: { count: used } });
  return { limit: account.plan.quota, used, remaining: Math.max(0, account.plan.quota - used), period };
}
