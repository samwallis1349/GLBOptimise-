/**
 * localStorage-backed persistence for layout overrides, keyed by stable
 * data-layout-id. Never serialises application HTML — only position/size
 * (and, for editor-created assets, enough to recreate them).
 */

const STORAGE_KEY = 'assetbench:layout-editor:v1';

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, elements: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.elements !== 'object') {
      return { version: 1, elements: {} };
    }
    return parsed;
  } catch {
    return { version: 1, elements: {} };
  }
}

function writeRaw(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable/full — layout editing still works, just won't persist */
  }
}

export function load() {
  return readRaw();
}

export function getEntry(id) {
  return readRaw().elements[id] || null;
}

export function setEntry(id, patch) {
  const data = readRaw();
  data.elements[id] = { ...(data.elements[id] || {}), ...patch };
  writeRaw(data);
}

export function removeEntry(id) {
  const data = readRaw();
  if (id in data.elements) {
    delete data.elements[id];
    writeRaw(data);
  }
}

export function getAllEntries() {
  return readRaw().elements;
}

export function clearAll() {
  writeRaw({ version: 1, elements: {} });
}
