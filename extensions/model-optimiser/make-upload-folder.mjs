/**
 * Assembles everything the Chrome Web Store asks for into one clearly
 * labelled folder at the project root, numbered in the order the developer
 * dashboard asks for it:
 *
 *   Chrome Web Store Upload - Reduce Polys v<version>/
 *
 * Builds the zip first. Listing text comes from store/STORE_LISTING.md.
 *
 *   npm run upload:extension
 */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EDITION, EDITIONS } from './editions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const STORE = join(HERE, 'store');
const edition = EDITIONS[DEFAULT_EDITION];

execFileSync(process.execPath, [join(HERE, 'build.mjs'), '--edition', DEFAULT_EDITION, '--zip'], { stdio: 'inherit' });
const { version } = JSON.parse(await readFile(join(HERE, 'dist', DEFAULT_EDITION, 'manifest.json'), 'utf8'));

const OUT = join(ROOT, `Chrome Web Store Upload - ${edition.shortName} v${version}`);
await rm(OUT, { recursive: true, force: true });

const put = async (folder, from, name) => {
  await mkdir(join(OUT, folder), { recursive: true });
  await cp(from, join(OUT, folder, name));
};

// The listing markdown, split into its "## " sections.
const listing = await readFile(join(STORE, 'STORE_LISTING.md'), 'utf8');
const section = (title) => {
  const start = listing.indexOf(`## ${title}`);
  if (start === -1) throw new Error(`STORE_LISTING.md has no "## ${title}" section`);
  const next = listing.indexOf('\n## ', start + 3);
  return listing.slice(start, next === -1 ? undefined : next).trim();
};
// The long description is the "> " quoted block in the Store listing section.
const description = section('Store listing tab').split('\n')
  .filter((l) => l.startsWith('>'))
  .map((l) => l.replace(/^> ?/, ''))
  .join('\n')
  .trim();

const zipName = `assetbench-${DEFAULT_EDITION}-${version}.zip`;
await put('1 - Package (upload this zip)', join(ROOT, 'extensions', zipName), zipName);
await put('2 - Store icon 128x128', join(HERE, 'public', 'icons', 'icon-128.png'), 'icon-128.png');
await put('3 - Screenshots 1280x800 (in this order)', join(STORE, 'screenshot-1-before-after.png'), '1 - before and after.png');
await put('3 - Screenshots 1280x800 (in this order)', join(STORE, 'screenshot-2-reduce.png'), '2 - reduce panel.png');
await put('3 - Screenshots 1280x800 (in this order)', join(STORE, 'screenshot-3-free-check.png'), '3 - free check.png');
await put('4 - Small promo tile 440x280', join(STORE, 'promo-tile-440x280.png'), 'promo-tile-440x280.png');

await mkdir(join(OUT, '5 - Text to copy and paste'), { recursive: true });
// Plain text: drop markdown bold and code marks; Windows line endings for Notepad.
const plain = (md) => md.replace(/\*\*/g, '').replace(/`/g, '');
const text = (name, body) => writeFile(join(OUT, '5 - Text to copy and paste', name), `${plain(body).trim()}\r\n`.replace(/\r?\n/g, '\r\n'));
await text('Name.txt', edition.name);
await text('Summary (short description).txt', edition.description);
await text('Description.txt', description);
await text('Privacy practices tab.txt', section('Privacy practices tab').replace(/^## .*\n/, ''));
await text('Distribution tab.txt', section('Distribution tab').replace(/^## .*\n/, ''));

await writeFile(join(OUT, 'START HERE.txt'), `CHROME WEB STORE UPLOAD - ${edition.name} v${version}
=====================================================================

Dashboard: https://chrome.google.com/webstore/devconsole

1. New item -> upload the zip in "1 - Package (upload this zip)".

2. Store listing tab:
   - Description:      paste "5 - Text to copy and paste\\Description.txt"
     (the name and summary come from the zip automatically; they're
     in Name.txt and Summary.txt for reference)
   - Category:         Developer Tools
   - Language:         English (United Kingdom)
   - Store icon:       "2 - Store icon 128x128\\icon-128.png"
   - Screenshots:      the three files in "3 - Screenshots", in order 1, 2, 3
   - Small promo tile: "4 - Small promo tile 440x280\\promo-tile-440x280.png"
   - Website:          https://www.assetbench.co.uk/reduce-polys
   - Support:          https://www.assetbench.co.uk/contact

3. Privacy practices tab: follow "5 - Text to copy and paste\\Privacy practices tab.txt"
   Privacy policy URL: https://www.assetbench.co.uk/privacy

4. Distribution tab: follow "5 - Text to copy and paste\\Distribution tab.txt"
   (free to install, public, all regions)

5. Submit for review.

After approval: paste the store URL into src/shared/config/extensions.js
and deploy, so the Reduce Polys page shows "Add to Chrome".

Rebuild this folder any time with:  npm run upload:extension
Re-render the screenshots and promo tile:  npm run store-art:extension
`.replace(/\n/g, '\r\n'));

console.log(`upload folder: ${relative(ROOT, OUT)}`);
