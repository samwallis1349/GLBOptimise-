/**
 * Unlocks, using the site's own Lemon Squeezy products (src/shared/config):
 *   - an All Access key (the £10/month subscription, or an old lifetime key)
 *     unlocks every tool;
 *   - a 99p single-tool key unlocks one tool. Keys from the shared 99p product
 *     are bound to a tool on first use via /api/tool-binding, the same
 *     binding the website uses, so a key bought on the site works here for
 *     that tool and vice versa.
 * Lemon Squeezy's License API allows any origin, so no proxy is needed.
 * DOM-free and storage-free: the panel persists what these return.
 */
import { LICENSE_PRODUCT_ID, LICENSE_STORE_ID } from '../../../src/shared/config/billing.js';
import { SINGLE_TOOL_PRODUCT_ID, TOOL_PRODUCTS } from '../../../src/shared/config/toolProducts.js';

const LICENSE_API = 'https://api.lemonsqueezy.com/v1/licenses';
const SITE = 'https://www.assetbench.co.uk';

/** Extension tool -> the site tool whose 99p product unlocks it. */
export const SITE_TOOL = {
  check: 'mobile-ready-checker',
  reduce: 'reduce-polys',
  optimise: 'optimise-glb',
  compress: 'compress-textures',
  textures: 'compress-textures',
  resize: 'texture-resizer',
};
export const FREE_TOOLS = new Set(['check']);

async function post(fetchImpl, action, params) {
  const res = await fetchImpl(`${LICENSE_API}/${action}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  return { ok: res.ok, data: await res.json().catch(() => null) };
}

function friendly(message) {
  if (/activation limit/i.test(message || '')) return 'This key is already active on as many devices as it allows. Remove it from one of them first.';
  if (/not found/i.test(message || '')) return "That key wasn't recognised. Copy it exactly as it appears in your receipt email.";
  return message || 'That key is not valid.';
}

/** Which site tool a single-tool key belongs to, binding it to `wanted` if it's new. */
async function boundTool(fetchImpl, key, wanted) {
  try {
    const res = await fetchImpl(`${SITE}/api/tool-binding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, toolId: wanted }),
    });
    return (await res.json())?.toolId ?? wanted;
  } catch {
    return wanted;
  }
}

/**
 * Activates `key` for this browser. `tool` is the extension tab it was
 * entered on. Resolves { ok, license } where license is
 * { key, instanceId, scope: 'all' | <siteToolId> }, or { ok: false, error }.
 */
export async function activateKey(key, tool, { fetchImpl = fetch, instanceName = 'AssetBench Model Optimiser', products = {} } = {}) {
  key = key.trim();
  if (!key) return { ok: false, error: 'Enter a licence key.' };
  let result;
  try {
    result = await post(fetchImpl, 'activate', { license_key: key, instance_name: instanceName });
  } catch {
    return { ok: false, error: 'Could not reach the licence server. Check your connection.' };
  }
  if (!result.ok || !result.data?.activated) return { ok: false, error: friendly(result.data?.error) };

  const meta = result.data.meta || {};
  const instanceId = result.data.instance?.id ?? null;
  const deactivate = () => post(fetchImpl, 'deactivate', { license_key: key, instance_id: instanceId }).catch(() => {});
  if (meta.store_id !== LICENSE_STORE_ID) {
    await deactivate();
    return { ok: false, error: 'That key is for a different store.' };
  }
  if (meta.product_id === LICENSE_PRODUCT_ID) return { ok: true, license: { key, instanceId, scope: 'all' } };

  // An edition's own products (e.g. the £3 Edge product), then the site's per-tool products.
  const specific = products[meta.product_id]
    || Object.keys(TOOL_PRODUCTS).find((id) => TOOL_PRODUCTS[id].productId && TOOL_PRODUCTS[id].productId === meta.product_id);
  const scope = specific || (meta.product_id === SINGLE_TOOL_PRODUCT_ID ? await boundTool(fetchImpl, key, SITE_TOOL[tool]) : null);
  if (!scope) {
    await deactivate();
    return { ok: false, error: 'That key is not for an AssetBench tool.' };
  }
  return { ok: true, license: { key, instanceId, scope } };
}

/** Re-checks stored licences; refunded, expired or cancelled keys drop out. Offline keeps them. */
export async function revalidate(licenses, { fetchImpl = fetch } = {}) {
  const kept = [];
  for (const license of licenses) {
    try {
      const params = { license_key: license.key };
      if (license.instanceId) params.instance_id = license.instanceId;
      const result = await post(fetchImpl, 'validate', params);
      if (result.data?.valid === false) continue;
      kept.push(license);
    } catch {
      kept.push(license);
    }
  }
  return kept;
}

/** `free`: tools that need no licence in this edition (see editions.js). */
export function isUnlocked(tool, licenses, free = FREE_TOOLS) {
  if (free.has(tool)) return true;
  return licenses.some((l) => l.scope === 'all' || l.scope === SITE_TOOL[tool]);
}
