/**
 * GLB -> FBX from the command line, with the same writer the site uses
 * (src/shared/fbx). Used to check exports by importing them into Blender
 * (scripts/fbx/check-in-blender.py).
 *
 *   node scripts/fbx/glb-to-fbx.mjs in.glb out.fbx
 */
import { readFile, writeFile } from 'node:fs/promises';
import { readDocument } from '../../worker/api/glb.js';
import sharp from 'sharp';
import { documentToFbx } from '../../src/shared/fbx/glbToFbx.js';

const [input, output] = process.argv.slice(2);
const doc = await readDocument(new Uint8Array(await readFile(input)));
const toPng = async (bytes) => new Uint8Array(await sharp(bytes).png().toBuffer());
const { bytes, notes, stats } = await documentToFbx(doc, { toPng });
await writeFile(output, bytes);
console.log(JSON.stringify({ output, bytes: bytes.length, ...stats, notes }));
