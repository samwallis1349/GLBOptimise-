/**
 * Collects File objects from a drop, including whole dropped folders.
 * Entries must be grabbed synchronously from the DataTransfer before any
 * await — the browser clears the item list once the event handler yields.
 */
export async function filesFromDrop(dataTransfer) {
  const entries = [...(dataTransfer.items || [])]
    .map((item) => (item.kind === 'file' && item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (!entries.length) return [...(dataTransfer.files || [])];
  const out = [];
  for (const entry of entries) await walk(entry, out);
  return out;
}

async function walk(entry, out) {
  if (entry.isFile) {
    out.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
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
