const MB = 1024 * 1024;

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} B`;
  if (abs < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export const fmtCount = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-GB') : '—');

/** "4K", "2K", "512 px" — how artists talk about texture sizes. */
export function pxLabel(px) {
  if (!px) return 'none';
  return px >= 1024 && px % 1024 === 0 ? `${px / 1024}K` : `${px} px`;
}

export function fmtValue(value, kind) {
  if (value == null || !Number.isFinite(value)) return '—';
  switch (kind) {
    case 'bytes':
      return fmtBytes(value);
    case 'px':
      return value ? `${fmtCount(value)} px` : '—';
    case 'units':
      return `${Number(value.toFixed(3)).toLocaleString('en-GB')} m`;
    case 'score':
      return `${Math.round(value)}`;
    default:
      return fmtCount(value);
  }
}

export function fmtDelta(delta, kind) {
  if (delta == null || !Number.isFinite(delta)) return '—';
  if (delta === 0) return '±0';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${fmtValue(Math.abs(delta), kind)}`;
}

export function fmtPct(pct) {
  if (pct == null || Number.isNaN(pct)) return '—';
  if (!Number.isFinite(pct)) return 'new';
  if (Math.abs(pct) < 0.05) return '0%';
  const sign = pct > 0 ? '+' : '−';
  const abs = Math.abs(pct);
  return `${sign}${abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)}%`;
}
