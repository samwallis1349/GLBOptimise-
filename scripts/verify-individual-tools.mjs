import JSZip from 'jszip';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../src/shared/config/tools.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'Individual Tool Packages');
const files = (await fs.readdir(folder)).filter((name) => name.endsWith('.zip'));
if (files.length !== TOOLS.length) throw new Error(`Expected ${TOOLS.length} ZIPs, found ${files.length}.`);

for (const tool of TOOLS) {
  const name = `AssetBench-${tool.name.replace(/[^A-Za-z0-9]+/g, '-')}.zip`;
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(folder, name)), { checkCRC32: true });
  for (const required of ['index.html', 'thumbnail.webp', 'README.txt', 'THANK-YOU.txt']) {
    if (!zip.file(required)) throw new Error(`${name}: missing ${required}`);
  }
  const html = await zip.file('index.html').async('string');
  const references = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((match) => match[1].slice(2));
  for (const reference of references) {
    if (!zip.file(reference)) throw new Error(`${name}: missing HTML asset ${reference}`);
  }
  const thumbnail = await zip.file('thumbnail.webp').async('nodebuffer');
  if (!thumbnail.subarray(8, 12).equals(Buffer.from('WEBP'))) throw new Error(`${name}: invalid WebP thumbnail`);
  if (tool.id === 'alpha-cutout' && !zip.file('tools/alpha-cutout/index.html')) throw new Error(`${name}: missing embedded tool page`);
  if (tool.id === 'compress-textures' && !zip.file('basis-encoder/basis_encoder.wasm')) throw new Error(`${name}: missing encoder`);
  console.log(`OK ${tool.name}`);
}
console.log(`Verified ${files.length} individual tool packages.`);
