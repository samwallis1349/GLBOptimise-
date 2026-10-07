const fs = require('node:fs');
const path = require('node:path');

/**
 * Lemon Squeezy licence lock for one desktop tool. Mirrors the website's
 * src/services/LicenseService.js, with three differences:
 *  - a key only unlocks the one product this app was built for;
 *  - the saved licence is bound to this PC's machine ID, so copying the
 *    app folder or licence file to another PC locks it again;
 *  - it runs in Electron's main process, out of reach of the page.
 *
 * Buyers need to be online once to activate. After that the app works
 * offline, and a refund or disabled key locks it on the next online launch.
 */

const LICENSE_API = 'https://api.lemonsqueezy.com/v1/licenses';

function friendlyError(message) {
  if (/activation limit/i.test(message || '')) {
    return 'This key is already active on another PC. Open the app there and choose Licence → Remove licence from this PC, then try again.';
  }
  if (/not found/i.test(message || '')) {
    return "That key wasn't recognised. Copy it exactly as it appears in your receipt email.";
  }
  return message || 'That licence key is not valid.';
}

/**
 * @param {{ storeId: number, productId: number, productName: string, file: string,
 *           machineId: string, instanceName: string, fetch?: typeof fetch }} options
 */
function createLicense({ storeId, productId, productName, file, machineId, instanceName, fetch = globalThis.fetch }) {
  function read() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  function clear() {
    fs.rmSync(file, { force: true });
  }

  async function post(action, params) {
    const response = await fetch(`${LICENSE_API}/${action}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams(params),
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, data };
  }

  const isThisProduct = (meta) => meta?.store_id === storeId && meta?.product_id === productId;

  function isUnlocked() {
    const stored = read();
    return Boolean(stored?.key && stored.valid && stored.productId === productId && stored.machineId === machineId);
  }

  async function activate(licenseKey) {
    const key = String(licenseKey || '').trim();
    if (!key) return { ok: false, error: 'Enter a licence key.' };
    if (isUnlocked() && read().key === key) return { ok: true };

    let result;
    try {
      result = await post('activate', { license_key: key, instance_name: instanceName });
    } catch {
      return { ok: false, error: 'Could not reach the licence server. Check your internet connection and try again.' };
    }
    if (!result.ok || !result.data?.activated) {
      return { ok: false, error: friendlyError(result.data?.error) };
    }

    const instanceId = result.data.instance?.id ?? null;
    if (!isThisProduct(result.data.meta)) {
      // Valid key for some other product — hand the activation straight back.
      if (instanceId) post('deactivate', { license_key: key, instance_id: instanceId }).catch(() => {});
      return { ok: false, error: `That key is for a different product. Use the key from your ${productName} receipt.` };
    }

    write({ key, instanceId, productId, machineId, valid: true, checkedAt: Date.now() });
    return { ok: true };
  }

  /** Re-checks the saved key; never locks a paying buyer out over a network failure. */
  async function revalidate() {
    const stored = read();
    if (!stored?.key || stored.machineId !== machineId) return isUnlocked();
    try {
      const params = { license_key: stored.key };
      if (stored.instanceId) params.instance_id = stored.instanceId;
      const result = await post('validate', params);
      if (typeof result.data?.valid === 'boolean') {
        write({ ...stored, valid: result.data.valid && isThisProduct(result.data.meta), checkedAt: Date.now() });
      }
    } catch {
      /* offline — trust the last known state */
    }
    return isUnlocked();
  }

  /** Frees this PC's activation so the key can move to another PC. */
  async function deactivate() {
    const stored = read();
    if (!stored?.key) return { ok: true };
    if (!stored.instanceId || stored.machineId !== machineId) {
      clear();
      return { ok: true };
    }
    let result;
    try {
      result = await post('deactivate', { license_key: stored.key, instance_id: stored.instanceId });
    } catch {
      return { ok: false, error: 'Could not reach the licence server. Check your internet connection and try again.' };
    }
    if (!result.data?.deactivated && !/not found/i.test(result.data?.error || '')) {
      return { ok: false, error: result.data?.error || 'Could not remove the licence from this PC. Try again.' };
    }
    clear();
    return { ok: true };
  }

  return { isUnlocked, activate, revalidate, deactivate };
}

module.exports = { createLicense };
