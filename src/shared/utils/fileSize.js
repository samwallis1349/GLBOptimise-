const UNITS = ['B', 'KB', 'MB', 'GB'];

/** Formats a byte count as a human-readable string, e.g. 1536 -> "1.5 KB". */
export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 ? 0 : 1;

  return `${value.toFixed(decimals)} ${UNITS[exponent]}`;
}
