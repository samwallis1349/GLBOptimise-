/**
 * Per-visitor free-trial clock. The start time lives across multiple layers:
 *  - Browser localStorage (`assetbench_trial_v2`)
 *  - Browser IndexedDB (`assetbench_meta` store)
 *  - Worker IP-keyed KV record (`trial:<hash>`)
 *  - Worker Hardware/Device-fingerprint KV record (`device:<hash>`)
 *
 * The earliest anchor wins, so neither clearing storage, using Incognito,
 * nor switching networks/VPNs alone can restart the trial.
 *
 * initTrial() runs once at startup; everything else reads the cached value
 * synchronously afterwards.
 */

import { getDeviceFingerprint } from './DeviceFingerprint.js';

const STORAGE_KEY = 'assetbench_trial_v2';
const TRIAL_API = '/api/trial';

let startedAt = null;
let startedThisVisit = false;
let readyPromise = null;

function readLocalStart() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLocalStart(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* storage disabled — server and IDB records still hold the trial */
  }
}

function readIdbStart() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open('assetbench_meta', 1);
      req.onupgradeneeded = () => {
        try { req.result.createObjectStore('kv'); } catch {}
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction('kv', 'readonly');
          const getReq = tx.objectStore('kv').get('trial_start');
          getReq.onsuccess = () => {
            const val = Number(getReq.result);
            resolve(Number.isFinite(val) && val > 0 ? val : null);
          };
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeIdbStart(value) {
  try {
    if (typeof indexedDB === 'undefined') return;
    const req = indexedDB.open('assetbench_meta', 1);
    req.onupgradeneeded = () => {
      try { req.result.createObjectStore('kv'); } catch {}
    };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, 'trial_start');
      } catch {}
    };
  } catch {}
}

async function fetchServerStart(localStart) {
  try {
    const deviceId = await getDeviceFingerprint().catch(() => null);
    const body = { startedAt: localStart };
    if (deviceId) body.deviceId = deviceId;

    const response = await fetch(TRIAL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Number.isFinite(data?.startedAt)) return null;
    // The Worker stamps a brand-new visitor with its own `now`.
    return { startedAt: data.startedAt, isNew: data.startedAt === data.now };
  } catch {
    return null; // offline, or `vite dev` with no Worker — use the local clock
  }
}

/** Starts (or resumes) this visitor's trial. Safe to call repeatedly. */
export function initTrial() {
  readyPromise ??= (async () => {
    let localStart = readLocalStart();
    if (!localStart) {
      localStart = await readIdbStart().catch(() => null);
    }
    const server = await fetchServerStart(localStart);
    startedAt = Math.min(...[localStart, server?.startedAt, Date.now()].filter(Boolean));
    startedThisVisit = !localStart && (server ? server.isNew : true);
    writeLocalStart(startedAt);
    writeIdbStart(startedAt);
  })();
  return readyPromise;
}

/** True if this page load began the trial — no earlier start in this browser or on the server. */
export function trialStartedThisVisit() {
  return startedThisVisit;
}

/** Trial start time in ms, or null before initTrial() has resolved. */
export function trialStartedAt() {
  return startedAt;
}
