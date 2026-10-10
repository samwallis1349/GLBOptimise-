/**
 * Bounded-concurrency batch runner. One failure never stops the batch: each
 * task's error is captured on its own item. Cancellation stops new tasks
 * from starting (running ones see the same signal between stages).
 *
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} task
 * @param {{ concurrency?: number, signal?: AbortSignal, onSettled?: (item: T, outcome: {ok: boolean, value?: R, error?: Error}) => void }} [opts]
 * @returns {Promise<{ item: T, ok: boolean, value?: R, error?: Error, skipped?: boolean }[]>}
 */
export async function runBatch(items, task, { concurrency = 2, signal, onSettled } = {}) {
  const results = new Array(items.length);
  let next = 0;
  const limit = Math.max(1, Math.min(8, Math.floor(concurrency) || 1));

  async function lane() {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (signal?.aborted) {
        results[index] = { item, ok: false, skipped: true, error: new Error('Cancelled before it started.') };
        continue;
      }
      try {
        const value = await task(item, index);
        results[index] = { item, ok: true, value };
      } catch (error) {
        results[index] = { item, ok: false, error };
      }
      onSettled?.(item, results[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** Key for duplicate-job protection: the same file (path + size) is never queued twice. */
export const jobKey = (asset) => `${asset.path || asset.name}|${asset.sourceBytes ?? ''}`;
