/**
 * Assembles everything a store asks for into one clearly labelled folder at
 * the project root, numbered in the order its dashboard asks for it:
 *
 *   Chrome Web Store Upload - Reduce Polys v<version>/    (npm run upload:extension)
 *   Edge Add-ons Upload - Reduce Polys v<version>/        (npm run upload:extension:edge)
 *   Chrome Web Store Upload - <edition> v<version>/       (--edition <id>)
 *
 * Builds the zip first. Listing text comes from store/STORE_LISTING.md
 * (Reduce Polys), store/edge/EDGE_LISTING.md (Edge) or
 * store/<edition>/STORE_LISTING.md (every other Chrome edition); images from
 * the same folders (re-render with npm run store-art:extension[:edge]).
 * Images a new edition doesn't have yet are listed as still to make.
 *
 *   node extensions/model-optimiser/make-upload-folder.mjs [--edition <id>]
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDITIONS } from './editions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const editionAt = process.argv.indexOf('--edition');
const EDITION_ID = editionAt === -1 ? 'reduce-polys' : process.argv[editionAt + 1];
const edition = EDITIONS[EDITION_ID];
const EDGE = EDITION_ID === 'reduce-polys-edge';
if (!edition || EDITION_ID === 'model-optimiser') throw new Error(`No upload folder for edition '${EDITION_ID}'.`);
const STORE = EDGE ? join(HERE, 'store', 'edge') : EDITION_ID === 'reduce-polys' ? join(HERE, 'store') : join(HERE, 'store', EDITION_ID);
const WEBSITE = `https://www.assetbench.co.uk${edition.website || '/reduce-polys'}`;
const LISTING = EDGE ? 'EDGE_LISTING.md' : 'STORE_LISTING.md';

execFileSync(process.execPath, [join(HERE, 'build.mjs'), '--edition', EDITION_ID, '--zip'], { stdio: 'inherit' });
const { version } = JSON.parse(await readFile(join(HERE, 'dist', EDITION_ID, 'manifest.json'), 'utf8'));

const OUT = join(ROOT, `${EDGE ? 'Edge Add-ons Upload' : 'Chrome Web Store Upload'} - ${edition.shortName} v${version}`);
await rm(OUT, { recursive: true, force: true });

const missing = [];
const put = async (folder, from, name) => {
  if (!existsSync(from)) return missing.push(`${folder}\\${name}`);
  await mkdir(join(OUT, folder), { recursive: true });
  await cp(from, join(OUT, folder, name));
};

// The listing markdown, split into its "## " sections.
const listing = await readFile(join(STORE, LISTING), 'utf8');
const section = (title) => {
  const start = listing.indexOf(`## ${title}`);
  if (start === -1) throw new Error(`${LISTING} has no "## ${title}" section`);
  const next = listing.indexOf('\n## ', start + 3);
  return listing.slice(start, next === -1 ? undefined : next).replace(/^## .*\n/, '').trim();
};
// The long description is the "> " quoted block in the listing section.
const description = section(EDGE ? 'Store listing' : 'Store listing tab').split('\n')
  .filter((l) => l.startsWith('>'))
  .map((l) => l.replace(/^> ?/, ''))
  .join('\n')
  .trim();
// Plain text: drop markdown bold and code marks; Windows line endings for Notepad.
const plain = (md) => md.replace(/\*\*/g, '').replace(/`/g, '');
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
const TEXT = '5 - Text to copy and paste';
const text = async (name, body) => {
  await mkdir(join(OUT, TEXT), { recursive: true });
  await writeFile(join(OUT, TEXT, name), crlf(`${plain(body).trim()}\n`));
};

const zipName = `assetbench-${EDITION_ID}-${version}.zip`;
const SHOTS = '3 - Screenshots 1280x800 (in this order)';
await put('1 - Package (upload this zip)', join(ROOT, 'extensions', zipName), zipName);
if (EDGE) await put('2 - Store logo 300x300', join(STORE, 'store-logo-300x300.png'), 'store-logo-300x300.png');
else await put('2 - Store icon 128x128', join(HERE, 'public', 'icons', 'icon-128.png'), 'icon-128.png');
if (EDITION_ID.startsWith('reduce-polys')) {
  await put(SHOTS, join(STORE, 'screenshot-1-before-after.png'), '1 - before and after.png');
  await put(SHOTS, join(STORE, 'screenshot-2-reduce.png'), '2 - reduce panel.png');
  await put(SHOTS, join(STORE, 'screenshot-3-free-check.png'), '3 - free check.png');
} else {
  for (const n of [1, 2, 3]) await put(SHOTS, join(STORE, `screenshot-${n}.png`), `${n}.png`);
}
await put('4 - Small promo tile 440x280', join(STORE, 'promo-tile-440x280.png'), 'promo-tile-440x280.png');
if (!EDGE) await put('6 - Marquee promo tile 1400x560', join(STORE, 'marquee-1400x560.png'), 'marquee-1400x560.png');

await text('Name.txt', edition.name);
await text('Short description.txt', edition.description);
await text('Description.txt', description);
if (EDGE) {
  const searchTerms = section('Store listing').split('**Search terms**')[1].split('**Images**')[0].replace(/\(.*?\)/, '');
  await text('Search terms.txt', searchTerms.split(',').map((t) => t.trim()).filter(Boolean).join('\n'));
  await text('Properties.txt', section('Properties'));
  await text('Availability.txt', section('Availability'));
  await text('Notes for certification.txt', section('Notes for certification'));
} else {
  await text('Privacy practices tab.txt', section('Privacy practices tab'));
  await text('Distribution tab.txt', section('Distribution tab'));
}

const steps = EDGE ? `EDGE ADD-ONS UPLOAD - ${edition.name} v${version}
=====================================================================

Dashboard: https://partner.microsoft.com/dashboard/microsoftedge/overview
(registering as an Edge extension developer is free)

1. Create new extension -> upload the zip in "1 - Package (upload this zip)".

2. Availability: follow "${TEXT}\\Availability.txt" (public, all markets).

3. Properties: follow "${TEXT}\\Properties.txt"
   - Category: Developer tools
   - Personal information: No
   - Privacy policy URL: https://www.assetbench.co.uk/privacy
   - Website: ${WEBSITE}
   - Support contact: https://www.assetbench.co.uk/contact

4. Store listings (English):
   - Description:       paste "${TEXT}\\Description.txt"
   - Extension logo:    "2 - Store logo 300x300\\store-logo-300x300.png"
   - Small promo tile:  "4 - Small promo tile 440x280\\promo-tile-440x280.png"
   - Screenshots:       the three files in "3 - Screenshots", in order 1, 2, 3
   - Search terms:      "${TEXT}\\Search terms.txt" (one per box)
   (the name and short description come from the zip automatically)

5. Submit: paste "${TEXT}\\Notes for certification.txt" into the
   notes for certification, then Publish.

Rebuild this folder any time with:  npm run upload:extension:edge
Re-render the screenshots, tile and logo:  npm run store-art:extension:edge
` : `CHROME WEB STORE UPLOAD - ${edition.name} v${version}
=====================================================================

Dashboard: https://chrome.google.com/webstore/devconsole

1. New item -> upload the zip in "1 - Package (upload this zip)".

2. Store listing tab:
   - Description:      paste "${TEXT}\\Description.txt"
     (the name and short description come from the zip automatically;
     they're in Name.txt and Short description.txt for reference)
   - Category:         Developer Tools
   - Language:         English (United Kingdom)
   - Store icon:       "2 - Store icon 128x128\\icon-128.png"
   - Screenshots:      the three files in "3 - Screenshots", in order 1, 2, 3
   - Small promo tile: "4 - Small promo tile 440x280\\promo-tile-440x280.png"
   - Marquee tile:     "6 - Marquee promo tile 1400x560\\marquee-1400x560.png"
   - Website:         ${WEBSITE}
   - Support:          https://www.assetbench.co.uk/contact

3. Privacy practices tab: follow "${TEXT}\\Privacy practices tab.txt"
   Privacy policy URL: https://www.assetbench.co.uk/privacy

4. Distribution tab: follow "${TEXT}\\Distribution tab.txt"
   (contains in-app purchases, public, all regions)

5. Submit for review.

After approval: paste the store URL into src/shared/config/extensions.js
and deploy, so the tool's page shows "Add to Chrome".

Rebuild this folder any time with:  npm run upload:extension
Re-render the screenshots and promo tile:  npm run store-art:extension
`;
const todo = missing.length ? `\nSTILL TO MAKE before submitting (not in this folder yet):\n${missing.map((m) => `   - ${m}`).join('\n')}\n` : '';
await writeFile(join(OUT, 'START HERE.txt'), crlf(steps + todo));
if (missing.length) console.warn(`still to make: ${missing.join(', ')}`);

console.log(`upload folder: ${relative(ROOT, OUT)}`);
