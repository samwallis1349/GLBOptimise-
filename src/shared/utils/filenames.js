/** Returns the filename without its extension. */
export function stripExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

/** Returns the file extension including the leading dot, lowercased. */
export function getExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
}

/** Builds an output filename by inserting a suffix before the extension. */
export function withSuffix(filename, suffix) {
  return `${stripExtension(filename)}${suffix}${getExtension(filename)}`;
}
