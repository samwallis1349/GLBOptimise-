import { writeGlb } from './createIO.js';

/** Writes the (possibly transformed) Document to a GLB ArrayBuffer. */
export async function exportGlb(document) {
  return writeGlb(document);
}
