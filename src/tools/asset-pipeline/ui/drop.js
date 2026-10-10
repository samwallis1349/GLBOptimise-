import { fileEntry } from '../engine/sources.js';

/**
 * Collects entries from a drop, keeping each file's folder path so the
 * export can mirror the source structure. Entries must be taken from the
 * DataTransfer synchronously — the browser clears it once the handler yields.
 */
export async function entriesFromDrop(dataTransfer) {
  const roots = [...(dataTransfer.items || [])].map((item) => (item.kind === 'file' && item.webkitGetAsEntry ? item.webkitGetAsEntry() : null)).filter(Boolean);
  if (!roots.length) return [...(dataTransfer.files || [])].map(fileEntry);
  const out = [];
  for (const root of roots) await walk(root, out);
  return out;
}

async function walk(entry, out) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    const path = (entry.fullPath || file.name).replace(/^\/+/, '');
    out.push({ path, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  // readEntries returns results in chunks (~100); keep reading until empty.
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const child of batch) await walk(child, out);
  }
}
