/**
 * Free runs of the paid tools (editions.js `freeRuns`), counted in this
 * browser. They don't come back: after the last one the tool needs the 99p
 * unlock. One count is shared by every paid tool, and only successful runs
 * use it up.
 *
 * The tools run offline with no account, so the count is kept in every
 * storage area passed (the panel passes chrome.storage.local and .sync) and
 * the highest wins: clearing local data or reinstalling doesn't reset it
 * while the browser's sync remembers it, and it follows the user to their
 * other computers. It's an invitation to buy, not enforcement. Takes the
 * storage areas so tests can pass fakes.
 */
export const QUOTA_KEY = 'freeRunsUsed';

/** Free runs used so far: the highest count in any area. */
export async function runsUsed(...areas) {
  const counts = await Promise.all(areas.map(async (area) => {
    try {
      const { [QUOTA_KEY]: used } = await area.get(QUOTA_KEY);
      return Number(used) || 0;
    } catch {
      return 0; // sync can be unavailable (signed out, quota); local still counts
    }
  }));
  return Math.max(0, ...counts);
}

/** Counts one run in every area and resolves the new total. */
export async function spendRun(...areas) {
  const used = (await runsUsed(...areas)) + 1;
  await Promise.all(areas.map((area) => Promise.resolve(area.set({ [QUOTA_KEY]: used })).catch(() => {})));
  return used;
}
