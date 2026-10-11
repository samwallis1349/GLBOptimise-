import { PLANS } from './plans.js';
import { sha256Hex } from './http.js';

/**
 * Lemon Squeezy -> API keys. Each paid plan is its own LS subscription
 * product with license keys enabled; the license key LS emails the buyer is
 * their API key. Webhook events (already signature-checked by the caller)
 * keep the key's plan and status in step with the subscription:
 *
 *   license_key_created            -> key becomes valid for the product's plan
 *   subscription_created / updated -> plan follows the product; key is off
 *                                     while expired, unpaid or paused
 *   subscription_expired           -> key off
 *
 * Events can arrive in any order, so subscription state is kept per order
 * (apiorder:<order_id>) and applied whenever the key record exists.
 * Only order id, plan and status are stored: never names or emails.
 *
 * Product -> plan mapping comes from the API_LS_PRODUCTS var, e.g.
 * {"1420844":"allaccess","1430376":"all"}. The site's All Access product is
 * mapped too, so the API comes included with that subscription.
 *
 * Keys sold before their product was mapped have no record yet: the first
 * time one is used, activateFromLicense() checks it with Lemon Squeezy and
 * creates the record (see keys.js authenticate).
 */

const KEY_PREFIX = 'apikey:';
const ORDER_PREFIX = 'apiorder:';
const MISS_PREFIX = 'apikeymiss:';
const OFF_STATUSES = new Set(['expired', 'unpaid', 'paused']);
const LS_STORE_ID = 480634;
const LS_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const MISS_TTL_SECONDS = 600;

export const LICENSE_KEY_PATTERN = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/i;

function productPlans(env) {
  try {
    const map = typeof env.API_LS_PRODUCTS === 'string' ? JSON.parse(env.API_LS_PRODUCTS) : env.API_LS_PRODUCTS || {};
    return Object.fromEntries(Object.entries(map).filter(([, plan]) => PLANS[plan]));
  } catch {
    return {};
  }
}

export function isApiProduct(env, productId) {
  return Boolean(productPlans(env)[String(productId)]);
}

async function applyOrderState(env, orderId) {
  const state = await env.TRIALS.get(`${ORDER_PREFIX}${orderId}`, 'json');
  if (!state?.keyHash) return;
  const record = await env.TRIALS.get(`${KEY_PREFIX}${state.keyHash}`, 'json');
  if (!record) return;
  const next = {
    ...record,
    plan: state.plan || record.plan,
    revoked: OFF_STATUSES.has(state.status),
    subscriptionStatus: state.status || record.subscriptionStatus || null,
  };
  await env.TRIALS.put(`${KEY_PREFIX}${state.keyHash}`, JSON.stringify(next));
}

async function mergeOrderState(env, orderId, patch) {
  const key = `${ORDER_PREFIX}${orderId}`;
  const current = (await env.TRIALS.get(key, 'json')) || {};
  await env.TRIALS.put(key, JSON.stringify({ ...current, ...patch, updatedAt: new Date().toISOString() }));
}

/** @returns {Promise<{handled: boolean, action?: string}>} */
export async function handleApiBillingEvent(env, event, payload) {
  const attributes = payload?.data?.attributes ?? {};
  const plans = productPlans(env);
  const plan = plans[String(attributes.product_id)];
  if (!plan) return { handled: false };
  if (attributes.test_mode && !env.API_LS_ALLOW_TEST) return { handled: true, action: 'ignored test mode' };
  const orderId = String(attributes.order_id ?? '');
  if (!orderId) return { handled: true, action: 'ignored: no order id' };

  if (event === 'license_key_created') {
    const licenseKey = String(attributes.key ?? '').trim().toUpperCase();
    if (!LICENSE_KEY_PATTERN.test(licenseKey)) return { handled: true, action: 'ignored: unexpected license key format' };
    const keyHash = await sha256Hex(licenseKey);
    await env.TRIALS.put(`${KEY_PREFIX}${keyHash}`, JSON.stringify({
      plan,
      label: `Lemon Squeezy order ${orderId}`,
      createdAt: new Date().toISOString(),
      revoked: false,
      source: 'lemonsqueezy',
      orderId,
    }));
    await mergeOrderState(env, orderId, { keyHash });
    await applyOrderState(env, orderId);
    return { handled: true, action: `key issued (${plan})` };
  }

  if (event === 'subscription_created' || event === 'subscription_updated' || event === 'subscription_expired' || event === 'subscription_resumed' || event === 'subscription_cancelled') {
    const status = event === 'subscription_expired' ? 'expired' : String(attributes.status ?? 'active');
    await mergeOrderState(env, orderId, { plan, status });
    await applyOrderState(env, orderId);
    return { handled: true, action: `subscription ${status} (${plan})` };
  }

  // Anything else (order_created…) belongs to the site's own sales handling.
  return { handled: false };
}

/**
 * First use of a licence key that has no API record: asks Lemon Squeezy
 * whether it is a live key for a product that includes the API, and if so
 * creates the record and links it to its order, so later subscription
 * webhooks keep it in step. Misses are cached briefly so a wrong key cannot
 * hammer Lemon Squeezy. Returns the new record, or null.
 */
export async function activateFromLicense(env, licenseKey, keyHash) {
  const plans = productPlans(env);
  if (!Object.keys(plans).length) return null;
  const missKey = `${MISS_PREFIX}${keyHash}`;
  if (await env.TRIALS.get(missKey)) return null;
  const miss = async () => { await env.TRIALS.put(missKey, '1', { expirationTtl: MISS_TTL_SECONDS }); return null; };

  let body;
  try {
    const res = await fetch(LS_VALIDATE_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ license_key: licenseKey }),
    });
    body = await res.json();
  } catch {
    return null; // Lemon Squeezy unreachable: not cached, so the next call retries.
  }
  const meta = body?.meta ?? {};
  const plan = plans[String(meta.product_id)];
  const status = String(body?.license_key?.status ?? '');
  if (!body?.valid || Number(meta.store_id) !== LS_STORE_ID || !plan || !['active', 'inactive'].includes(status)) return miss();

  const orderId = String(meta.order_id ?? '');
  const record = {
    plan,
    label: `Lemon Squeezy order ${orderId}`,
    createdAt: new Date().toISOString(),
    revoked: false,
    source: 'lemonsqueezy',
    orderId,
  };
  await env.TRIALS.put(`${KEY_PREFIX}${keyHash}`, JSON.stringify(record));
  if (orderId) {
    await mergeOrderState(env, orderId, { keyHash });
    await applyOrderState(env, orderId);
  }
  return (await env.TRIALS.get(`${KEY_PREFIX}${keyHash}`, 'json')) || record;
}
