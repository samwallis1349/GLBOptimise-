/**
 * What the tools accept. Model tools take GLB, glTF, FBX or OBJ (or a ZIP
 * holding one with its textures/.bin/.mtl): anything that isn't GLB is
 * converted to GLB first with the Cloud API's converter, so every tool after
 * it works on one format. Image tools take PNG, JPEG or WebP. DOM-free.
 */
import { convertModel } from './convert-input.js';
import { decodeImage, sniffImage } from '../../../worker/api/images.js';

export const MAX_INPUT_BYTES = 200 * 1048576;
export const MODEL_EXTENSIONS = ['glb', 'gltf', 'fbx', 'obj', 'zip'];
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

export const isGlb = (bytes) => bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;

export const stem = (name) => String(name || 'model').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'model';

const FORMAT_NAMES = { glb: 'GLB', gltf: 'glTF', fbx: 'FBX', obj: 'OBJ', zip: 'ZIP' };

/**
 * Any supported model as GLB bytes. Resolves { bytes, from, notes } where
 * `from` is the source format and `notes` are the converter's warnings.
 */
export async function modelToGlb(bytes, name = 'model.glb') {
  if (bytes.length > MAX_INPUT_BYTES) throw new Error('Models up to 200 MB only.');
  if (isGlb(bytes)) return { bytes, from: 'glb', notes: [] };
  if (!convertModel) throw new Error('That is not a binary glTF (.glb) file.');
  let result;
  try {
    result = await convertModel(bytes, name);
  } catch (err) {
    throw new Error(err?.message || 'The model could not be read.');
  }
  if (!result) throw new Error('That is not a binary glTF (.glb), glTF, FBX or OBJ file.');
  const notes = (result.warnings || []).map((w) => w.replace(' Pass scale=0.01 to convert to metres.', ' If it comes out 100 times too big, rescale it by 0.01.'));
  return { bytes: result.output, from: result.from, notes: [`Converted from ${FORMAT_NAMES[result.from] || result.from} to GLB first.`, ...notes] };
}

/** Decodes a PNG, JPEG or WebP to RGBA8, with a plain-English error otherwise. */
export async function readImage(bytes) {
  const info = sniffImage(bytes);
  if (!info || !['image/png', 'image/jpeg', 'image/webp'].includes(info.mime)) throw new Error('Choose a PNG, JPEG or WebP image.');
  try {
    return await decodeImage(bytes);
  } catch (err) {
    throw new Error(err?.message || 'The image could not be read.');
  }
}
