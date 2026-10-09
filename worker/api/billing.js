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
 * {"123456":"studio2d","123457":"studio3d","123458":"all"}.
 */

const KEY_PREFIX = 'apikey:';
const ORDER_PREFIX = 'apiorder:';
const OFF_STATUSES = new Set(['expired', 'unpaid', 'paused']);

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

  return { handled: true, action: `ignored ${event}` };
}
