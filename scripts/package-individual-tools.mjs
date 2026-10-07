import JSZip from 'jszip';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { TOOLS } from '../src/shared/config/tools.js';
import { buildToolBundle, root } from './lib/tool-bundle.mjs';

const output = path.join(root, 'Individual Tool Packages');
const staging = path.join(root, '.tmp-individual-tool-builds');

async function addTree(zip, directory, prefix = '') {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await addTree(zip, absolute, name);
    else zip.file(name, await fs.readFile(absolute));
  }
}

function readme(tool) {
  return `ASSET BENCH - ${tool.name.toUpperCase()}\n\n${tool.description}\n\nCONTENTS\nindex.html and assets/ - the ready-to-host browser application\nthumbnail.webp - the product thumbnail\nTHANK-YOU.txt - a note for your customer\n\nHOW TO RUN\n1. Extract all files from this ZIP into one folder.\n2. Serve that folder with any static web server or static hosting service.\n3. Open its index.html URL in a modern browser.\n\nFor local use with Node.js, run "npx serve ." from the extracted folder, then open the local URL it prints. Do not open index.html with a file:// URL because browser security blocks module and asset loading.\n\nSome model formats in Convert Files and Model Splitter load libraries from a CDN and need an internet connection. Other tools process uploaded files in the browser.\n\nThis package contains one tool. Buttons that refer to other Asset Bench tools require those tools separately.\n`;
}

function thanks(tool) {
  return `Thank you for choosing Asset Bench ${tool.name}!\n\nWe hope it makes preparing your assets quicker and easier. Start with README.txt, then open the tool from a local web server or your hosting service.\n\nEnjoy creating!\nThe Asset Bench team\n`;
}

await fs.mkdir(output, { recursive: true });
await fs.mkdir(staging, { recursive: true });
const index = ['ASSET BENCH - INDIVIDUAL TOOL PACKAGES', '', `${TOOLS.length} individually packaged tools`, ''];

try {
  for (const [i, tool] of TOOLS.entries()) {
    const project = path.join(staging, tool.id);
    console.log(`[${i + 1}/${TOOLS.length}] Building ${tool.name}`);
    const dist = await buildToolBundle(tool, project);

    const zip = new JSZip();
    await addTree(zip, dist);
    zip.file('thumbnail.webp', await fs.readFile(path.join(root, 'public', tool.thumbnail.slice(1))));
    zip.file('README.txt', readme(tool));
    zip.file('THANK-YOU.txt', thanks(tool));
    const fileName = `AssetBench-${tool.name.replace(/[^A-Za-z0-9]+/g, '-')}.zip`;
    await fs.writeFile(path.join(output, fileName), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
    index.push(`${String(i + 1).padStart(2, '0')}. ${tool.name} - ${fileName}`);
    await fs.rm(project, { recursive: true, force: true });
  }
  index.push('', 'Each ZIP includes its own thumbnail.webp, README.txt, and THANK-YOU.txt.');
  await fs.writeFile(path.join(output, 'TOOLS-INDEX.txt'), index.join('\n') + '\n');
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}
