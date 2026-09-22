/**
 * Lemon Squeezy license-key checks. Called directly from the browser —
 * Lemon Squeezy's License API sends `Access-Control-Allow-Origin: *`, so no
 * server-side proxy is needed for a static, client-only app like this one.
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

/** Activates a license key as a new instance of this browser and stores it locally on success. */
export async function activateLicense(licenseKey) {
  const key = licenseKey.trim();
  if (!key) return { ok: false, error: 'Enter a license key.' };

  const instanceName = `assetbench-web-${Math.random().toString(36).slice(2, 8)}`;

  let result;
  try {
    result = await postForm('activate', { license_key: key, instance_name: instanceName });
  } catch {
    return { ok: false, error: 'Could not reach the license server. Check your connection and try again.' };
  }

  if (!result.ok || !result.data?.activated) {
    return { ok: false, error: result.data?.error || 'That license key is not valid.' };
  }

  writeStored({ key, instanceId: result.data.instance?.id ?? null, valid: true, checkedAt: Date.now() });
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
      writeStored({ ...stored, valid: result.data.valid, checkedAt: Date.now() });
    }
  } catch {
    /* offline or API hiccup — trust the last known state */
  }
}
