import { LICENSE_MACHINE_LIMIT, LICENSE_PRODUCT_ID, LICENSE_STORE_ID } from '../shared/config/billing.js';
import { SINGLE_TOOL_PRODUCT_ID, TOOL_PRODUCTS } from '../shared/config/toolProducts.js';
import { TOOLS, getToolById, getToolByRoute } from '../shared/config/tools.js';

/**
 * Lemon Squeezy license-key checks. Called directly from the browser —
 * Lemon Squeezy's License API sends `Access-Control-Allow-Origin: *`, so no
 * server-side proxy is needed for a static, client-only app like this one.
 *
 * Buying generates a key automatically and emails it to the buyer. Each
 * activation registers this browser as one "instance" against the key's
 * activation limit (LICENSE_MACHINE_LIMIT); deactivateLicense() frees it
 * again so the buyer can move to a new machine.
 *
 * Single-tool £3 keys (shared/config/toolProducts.js) unlock just that tool
 * in this browser. They're stored separately, per tool, and never count as
 * the lifetime license.
 */

const LICENSE_API = 'https://api.lemonsqueezy.com/v1/licenses';
const STORAGE_KEY = 'assetbench_license_v1';
const TOOL_STORAGE_KEY = 'assetbench_tool_licenses_v1';

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* private browsing / storage disabled — license just won't persist locally */
  }
}

function readToolLicenses() {
  try {
    return JSON.parse(localStorage.getItem(TOOL_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeToolLicenses(data) {
  try {
    localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* private browsing / storage disabled — license just won't persist locally */
  }
}

/** True if this browser holds a valid single-tool key for `toolId`. */
export function hasToolLicense(toolId) {
  return Boolean(readToolLicenses()[toolId]?.valid);
}

/** Single-tool keys on this browser, as [{ toolId, key }]. */
export function getToolLicenses() {
  return Object.entries(readToolLicenses())
    .filter(([, license]) => license?.valid)
    .map(([toolId, license]) => ({ toolId, key: license.key }));
}

export function hasStoredLicense() {
  const stored = readStored();
  return Boolean(stored?.key && stored?.valid);
}

/** The stored license for display, e.g. { key, usage, limit }, or null. */
export function getStoredLicense() {
  const stored = readStored();
  return stored?.key && stored?.valid ? stored : null;
}

export function clearStoredLicense() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

async function postForm(action, params) {
  const body = new URLSearchParams(params);
  const response = await fetch(`${LICENSE_API}/${action}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body,
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
}

/** True if the key was issued for the Asset Bench lifetime product, not some other Lemon Squeezy store. */
function isOurProduct(meta) {
  return meta?.store_id === LICENSE_STORE_ID && meta?.product_id === LICENSE_PRODUCT_ID;
}

function isSingleToolProduct(meta) {
  return meta?.store_id === LICENSE_STORE_ID && meta?.product_id === SINGLE_TOOL_PRODUCT_ID;
}

/** The tool a single-tool key belongs to, or null if it isn't one of ours. */
function toolForProduct(meta, requestedToolId = null) {
  if (meta?.store_id !== LICENSE_STORE_ID) return null;
  const specific = Object.keys(TOOL_PRODUCTS).find((id) => {
    const p = TOOL_PRODUCTS[id];
    return (p.productId && p.productId === meta.product_id) || (p.variantId && p.variantId === meta.variant_id);
  });
  if (specific) return specific;
  if (SINGLE_TOOL_PRODUCT_ID && meta.product_id === SINGLE_TOOL_PRODUCT_ID) {
    return requestedToolId ?? null;
  }
  return null;
}

async function syncToolBinding(key, toolId) {
  try {
    const res = await fetch('/api/tool-binding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, toolId }),
    });
    const data = await res.json().catch(() => null);
    if (data?.toolId) return data.toolId;
  } catch {
    /* fallback to local binding */
  }
  return toolId ?? null;
}

/** A name the buyer can recognise in Lemon Squeezy's order portal, e.g. "Chrome on Windows". */
function instanceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`;
}

function friendlyError(message) {
  if (/activation limit/i.test(message || '')) {
    return 'This key is already active on as many devices as it allows. Remove it from one of them (Pricing page → Remove) and try again.';
  }
  if (/not found/i.test(message || '')) {
    return "That key wasn't recognised. Copy it exactly as it appears in your receipt email.";
  }
  return message || 'That license key is not valid.';
}

/**
 * Activates a license key as a new instance of this browser and stores it
 * locally on success. Resolves { ok, toolId? } — toolId is set when the key
 * only unlocks one tool.
 */
export async function activateLicense(licenseKey, requestedToolId = null) {
  const key = licenseKey.trim();
  if (!key) return { ok: false, error: 'Enter a license key.' };

  const stored = readStored();
  if (stored?.key === key && stored.valid) return { ok: true };
  const existingTool = getToolLicenses().find((license) => license.key === key);
  if (existingTool) return { ok: true, toolId: existingTool.toolId };

  let result;
  try {
    result = await postForm('activate', { license_key: key, instance_name: instanceName() });
  } catch {
    return { ok: false, error: 'Could not reach the license server. Check your connection and try again.' };
  }

  if (!result.ok || !result.data?.activated) {
    return { ok: false, error: friendlyError(result.data?.error) };
  }

  const instanceId = result.data.instance?.id ?? null;
  const meta = result.data.meta;

  if (isOurProduct(meta)) {
    writeStored({
      key,
      instanceId,
      valid: true,
      usage: result.data.license_key?.activation_usage ?? null,
      limit: result.data.license_key?.activation_limit ?? LICENSE_MACHINE_LIMIT,
      checkedAt: Date.now(),
    });
    return { ok: true };
  }

  const currentPathTool = typeof location !== 'undefined' ? getToolByRoute(location.pathname)?.id : null;
  const targetTool = requestedToolId || currentPathTool;
  let toolId = null;

  if (isSingleToolProduct(meta)) {
    toolId = await syncToolBinding(key, targetTool);
  } else {
    toolId = toolForProduct(meta, targetTool);
  }

  if (toolId) {
    if (targetTool && toolId !== targetTool) {
      if (instanceId) postForm('deactivate', { license_key: key, instance_id: instanceId }).catch(() => {});
      const boundName = getToolById(toolId)?.name ?? toolId;
      const targetName = getToolById(targetTool)?.name ?? targetTool;
      return { ok: false, error: `That key unlocks ${boundName}, not ${targetName}.` };
    }

    writeToolLicenses({ ...readToolLicenses(), [toolId]: { key, instanceId, valid: true, checkedAt: Date.now() } });
    return { ok: true, toolId };
  }

  if (instanceId) postForm('deactivate', { license_key: key, instance_id: instanceId }).catch(() => {});
  return { ok: false, error: 'That key is not an Asset Bench license.' };
}

/**
 * Releases this machine's activation so the key can be used elsewhere, and
 * locks this browser again. Keeps the local license if the server can't be
 * reached, so a flaky connection never silently burns an activation.
 */
export async function deactivateLicense() {
  const stored = readStored();
  if (!stored?.key) return { ok: true };
  if (!stored.instanceId) {
    clearStoredLicense();
    return { ok: true };
  }

  let result;
  try {
    result = await postForm('deactivate', { license_key: stored.key, instance_id: stored.instanceId });
  } catch {
    return { ok: false, error: 'Could not reach the license server. Check your connection and try again.' };
  }

  // "not found" means the instance is already gone (e.g. removed in the Lemon Squeezy portal).
  if (!result.data?.deactivated && !/not found/i.test(result.data?.error || '')) {
    return { ok: false, error: result.data?.error || 'Could not remove this machine. Try again.' };
  }

  clearStoredLicense();
  return { ok: true };
}

/** Releases this browser's activation of a single-tool key. */
export async function deactivateToolLicense(toolId) {
  const all = readToolLicenses();
  const license = all[toolId];
  if (!license) return { ok: true };
  if (license.instanceId) {
    let result;
    try {
      result = await postForm('deactivate', { license_key: license.key, instance_id: license.instanceId });
    } catch {
      return { ok: false, error: 'Could not reach the license server. Check your connection and try again.' };
    }
    if (!result.data?.deactivated && !/not found/i.test(result.data?.error || '')) {
      return { ok: false, error: result.data?.error || 'Could not remove this key. Try again.' };
    }
  }
  delete all[toolId];
  writeToolLicenses(all);
  return { ok: true };
}

/**
 * Silently re-checks a previously activated license (e.g. on app start) so a
 * refunded/expired key eventually stops granting access. Never throws and
 * never clears a stored license on a network failure — a paying user
 * offline shouldn't get locked out.
 */
export async function revalidateStoredLicense() {
  await revalidateToolLicenses();
  const stored = readStored();
  if (!stored?.key) return;

  try {
    const params = { license_key: stored.key };
    if (stored.instanceId) params.instance_id = stored.instanceId;
    const result = await postForm('validate', params);
    if (result.ok && typeof result.data?.valid === 'boolean') {
      writeStored({
        ...stored,
        valid: result.data.valid && isOurProduct(result.data.meta),
        usage: result.data.license_key?.activation_usage ?? stored.usage,
        limit: result.data.license_key?.activation_limit ?? stored.limit,
        checkedAt: Date.now(),
      });
    }
  } catch {
    /* offline or API hiccup — trust the last known state */
  }
}

/** Same as revalidateStoredLicense(), for each single-tool key. */
async function revalidateToolLicenses() {
  const all = readToolLicenses();
  if (!Object.keys(all).length) return;
  for (const [toolId, license] of Object.entries(all)) {
    try {
      const params = { license_key: license.key };
      if (license.instanceId) params.instance_id = license.instanceId;
      const result = await postForm('validate', params);
      if (result.ok && typeof result.data?.valid === 'boolean') {
        all[toolId] = {
          ...license,
          valid: result.data.valid && (toolForProduct(result.data.meta, toolId) === toolId || isSingleToolProduct(result.data.meta)),
          checkedAt: Date.now(),
        };
      }
    } catch {
      /* offline or API hiccup — trust the last known state */
    }
  }
  writeToolLicenses(all);
}
