/** Generates a v4-ish unique id without pulling in a dependency. */
export function createId(prefix = '') {
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix ? `${prefix}_${random}` : random;
}
