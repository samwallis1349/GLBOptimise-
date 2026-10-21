/**
 * Builds every extension the site offers as a manual download (EXTENSIONS
 * entries with `download: true` in src/shared/config/extensions.js) and zips
 * each into public/extensions/assetbench-<id>.zip, for the "Install manually"
 * part of the homepage Web extensions popup. Runs before every site deploy.
 *
 *   node extensions/model-optimiser/build-site-downloads.mjs
 */
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTENSIONS } from '../../src/shared/config/extensions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'public', 'extensions');

const files = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push(path);
  }
  return out;
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const { id } of EXTENSIONS.filter((e) => e.download)) {
  execFileSync(process.execPath, [join(HERE, 'build.mjs'), '--edition', id], { stdio: 'inherit' });
  const dist = join(HERE, 'dist', id);
  const zip = new JSZip();
  for (const path of await files(dist)) zip.file(relative(dist, path).split(sep).join('/'), await readFile(path));
  const out = join(OUT, `assetbench-${id}.zip`);
  await writeFile(out, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  console.log(`site download ${relative(ROOT, out)}`);
}
