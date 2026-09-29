import { LICENSE_MACHINE_LIMIT, LICENSE_PRODUCT_ID, LICENSE_STORE_ID } from '../shared/config/billing.js';

/**
 * Lemon Squeezy license-key checks. Called directly from the browser —
 * Lemon Squeezy's License API sends `Access-Control-Allow-Origin: *`, so no
 * server-side proxy is needed for a static, client-only app like this one.
 *
 * Buying generates a key automatically and emails it to the buyer. Each
 * activation registers this browser as one "instance" against the key's
 * activation limit (LICENSE_MACHINE_LIMIT); deactivateLicense() frees it
 * again so the buyer can move to a new machine.
 */

const LICENSE_API = 'https://api.lemonsqueezy.com/v1/licenses';
const STORAGE_KEY = 'assetbench_license_v1';

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

/** A name the buyer can recognise in Lemon Squeezy's order portal, e.g. "Chrome on Windows". */
function instanceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`;
}

function friendlyError(message) {
  if (/activation limit/i.test(message || '')) {
    return `This key is already active on ${LICENSE_MACHINE_LIMIT} machines. Remove it from one of them (Pricing page → Remove this machine) and try again.`;
  }
  if (/not found/i.test(message || '')) {
    return "That key wasn't recognised. Copy it exactly as it appears in your receipt email.";
  }
  return message || 'That license key is not valid.';
}

/** Activates a license key as a new instance of this browser and stores it locally on success. */
export async function activateLicense(licenseKey) {
  const key = licenseKey.trim();
  if (!key) return { ok: false, error: 'Enter a license key.' };

  const stored = readStored();
  if (stored?.key === key && stored.valid) return { ok: true };

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
  if (!isOurProduct(result.data.meta)) {
    // Valid key, wrong product — give the activation slot straight back.
    if (instanceId) postForm('deactivate', { license_key: key, instance_id: instanceId }).catch(() => {});
    return { ok: false, error: 'That key is not an Asset Bench license.' };
  }

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

/**
 * Silently re-checks a previously activated license (e.g. on app start) so a
 * refunded/expired key eventually stops granting access. Never throws and
 * never clears a stored license on a network failure — a paying user
 * offline shouldn't get locked out.
 */
export async function revalidateStoredLicense() {
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
