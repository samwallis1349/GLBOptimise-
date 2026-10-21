import { readGlb } from '../glb/createIO.js';
import { documentToFbx } from './glbToFbx.js';

/**
 * GLB bytes in, FBX bytes out, in the browser: the site's glTF reader
 * (Draco and Meshopt included) then the static-mesh FBX writer.
 *
 * @param {ArrayBuffer|Uint8Array} glb
 * @returns {Promise<{ bytes: Uint8Array, notes: string[], stats: object }>}
 */
export async function glbBytesToFbx(glb) {
  const buffer = glb instanceof Uint8Array ? glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) : glb;
  return documentToFbx(await readGlb(buffer));
}
