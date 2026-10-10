/** Small display helpers shared by the Asset Pipeline UI. */

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function bytes(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(n >= 104857600 ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export const int = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-GB'));

/** Signed reduction, e.g. "−42%"; positive growth shows as "+5%". */
export function reduction(before, after) {
  if (!before || after == null) return '—';
  const p = ((before - after) / before) * 100;
  if (Math.abs(p) < 0.05) return '0%';
  return p > 0 ? `−${p.toFixed(p >= 10 ? 0 : 1)}%` : `+${(-p).toFixed(-p >= 10 ? 0 : 1)}%`;
}

export const ms = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
