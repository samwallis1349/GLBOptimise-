/**
 * Per-visitor free-trial clock. The start time lives in two places — this
 * browser's localStorage and the Worker's IP-keyed KV record (see
 * worker/index.js) — and the earliest of the two wins, so neither clearing
 * storage nor switching networks alone restarts the trial.
 *
 * initTrial() runs once at startup; everything else reads the cached value
 * synchronously afterwards.
 */

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
    /* storage disabled — the server-side record still holds the trial */
  }
}

async function fetchServerStart(localStart) {
  try {
    const response = await fetch(TRIAL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startedAt: localStart }),
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
    const localStart = readLocalStart();
    const server = await fetchServerStart(localStart);
    startedAt = Math.min(...[localStart, server?.startedAt, Date.now()].filter(Boolean));
    startedThisVisit = !localStart && (server ? server.isNew : true);
    writeLocalStart(startedAt);
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
