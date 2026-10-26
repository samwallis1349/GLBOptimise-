/**
 * GLB from glTF / FBX / OBJ / ZIP, with the Cloud API's converter. Its own
 * module so build.mjs can leave it (and three.js's FBX loader) out of the
 * GLB-only editions: there it resolves to a stub exporting null.
 */
import { convert, detectFormat } from '../../../worker/api/convert.js';

export async function convertModel(bytes, name) {
  if (!detectFormat(bytes, name)) return null;
  return convert(bytes, { to: 'glb' }, name);
}
