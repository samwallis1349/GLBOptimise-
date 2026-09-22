/**
 * Triggers a browser download for a JSON-serialisable value. Rig Inspector
 * never produces a GLB (it only reads one), so this replaces the
 * downloadArrayBuffer() helper the processing tools use — the one thing
 * worth exporting here is the inspection report itself.
 */
export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
