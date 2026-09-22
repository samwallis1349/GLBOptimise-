/**
 * Minimal global app state (not tool state — each tool owns its own).
 * Kept intentionally tiny: Asset Bench does not need a state-management
 * library at this stage.
 */

const state = {
  theme: 'dark',
};

const listeners = new Set();

export function getState() {
  return { ...state };
}

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((listener) => listener(getState()));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
