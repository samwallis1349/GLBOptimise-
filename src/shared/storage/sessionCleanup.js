import { SESSION_EXPIRY_MS } from '../config/limits.js';
import { getModels, removeModel } from './ModelSessionStore.js';

/**
 * Removes model session records older than SESSION_EXPIRY_MS. Intended to
 * be called on app startup so IndexedDB doesn't accumulate abandoned
 * sessions from previous visits.
 *
 * @returns {Promise<number>} number of records removed
 */
export async function cleanupStaleSessions() {
  const all = await getModels();
  const cutoff = Date.now() - SESSION_EXPIRY_MS;
  const stale = all.filter((model) => model.updatedAt < cutoff);

  await Promise.all(stale.map((model) => removeModel(model.id)));
  return stale.length;
}
