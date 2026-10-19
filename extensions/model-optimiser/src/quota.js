/**
 * Free daily runs of the paid tools (editions.js `dailyFree`), counted in
 * this browser and reset at midnight UTC. One count is shared by every paid
 * tool, and only successful runs use it up.
 *
 * The tools run offline with no account, so this lives in chrome.storage.local
 * and clearing it (or reinstalling) starts the day again: it's an invitation
 * to buy, not enforcement. Takes the storage area so tests can pass a fake.
 */
export const QUOTA_KEY = 'quota';
const DAY_MS = 86_400_000;

/** '2026-10-13': the UTC day `now` falls in. */
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Runs used so far today; a count from an earlier day reads as 0. */
export async function runsUsed(storage, now = Date.now()) {
  const { [QUOTA_KEY]: quota } = await storage.get(QUOTA_KEY);
  return quota?.lastResetDay === utcDay(now) ? quota.dailyRunsCount : 0;
}

/** Counts one run against today and resolves the new total. */
export async function spendRun(storage, now = Date.now()) {
  const used = (await runsUsed(storage, now)) + 1;
  await storage.set({ [QUOTA_KEY]: { dailyRunsCount: used, lastResetDay: utcDay(now) } });
  return used;
}

/** Milliseconds until the count resets (the next midnight UTC). */
export const msUntilReset = (now = Date.now()) => DAY_MS - (now % DAY_MS);

/** 'HH:MM:SS' */
export function fmtCountdown(ms) {
  const s = Math.ceil(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}
