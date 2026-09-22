export function formatBytes(bytes, decimals = 1) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  const formatted = i === 0 ? String(value) : value.toFixed(decimals);
  return `${formatted} ${units[i]}`;
}

export function formatNumber(n) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}

export function formatPercent(n, decimals = 0) {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

export function truncateMiddle(str, max = 28) {
  if (str.length <= max) return str;
  const half = Math.floor((max - 1) / 2);
  return `${str.slice(0, half)}…${str.slice(str.length - half)}`;
}
