/** Packs extensions/chrome into a zip ready for the Chrome Web Store. */
import JSZip from 'jszip';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const SRC = 'extensions/chrome';
const OUT = 'extensions/assetbench-reduce-polys-chrome.zip';
const SKIP = new Set(['README.md']);

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else if (!SKIP.has(entry.name)) out.push(path);
  }
  return out;
}

const zip = new JSZip();
for (const path of await files(SRC)) zip.file(relative(SRC, path).split(sep).join('/'), await readFile(path));
await writeFile(OUT, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
const { version } = JSON.parse(await readFile(join(SRC, 'manifest.json'), 'utf8'));
console.log(`${OUT} (v${version})`);
