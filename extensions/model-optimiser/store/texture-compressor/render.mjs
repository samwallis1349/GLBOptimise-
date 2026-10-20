/**
 * Re-renders the GLB Texture Compressor store art into this folder: three
 * 1280x800 screenshots, the 440x280 promo tile and the 1400x560 marquee.
 * Drives the real panel in headless Chrome (../capture.mjs) for the panel
 * shots, and measures the model's GPU memory before and after KTX2 with the
 * extension's own engine for the headline.
 *
 *   node extensions/model-optimiser/store/texture-compressor/render.mjs [model.glb]
 *
 * Default model: ~/Downloads/assetbench-wizard-balanced.glb. Needs Chrome
 * or Edge installed.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_PRICE_LABEL } from '../../../../src/shared/config/toolProducts.js';
import { analyseGlb } from '../../../../worker/api/glb.js';
import { runTool } from '../../src/engine.js';
import { openStudio, stubbedPanel } from '../capture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = process.argv[2] || join(homedir(), 'Downloads', 'assetbench-wizard-balanced.glb');
const DEAL = `5 free a day, then ${TOOL_PRICE_LABEL} once`;
if (!existsSync(MODEL)) throw new Error(`Model not found: ${MODEL}`);

const studio = await openStudio('texture-compressor', { 'art.html': join(HERE, 'art.html') });
try {
  // The KTX2 saving for the headline, from the extension's own engine.
  globalThis.__ASSETBENCH_BASIS_WASM__ = await WebAssembly.compile(await readFile(join(studio.work, 'basis_encoder.wasm')));
  const modelBytes = new Uint8Array(await readFile(MODEL));
  const MB = 1048576;
  const before = analyseGlb(modelBytes).textureMemoryBytes / MB;
  const after = analyseGlb((await runTool('compress', modelBytes, { maxSize: 0 })).output).textureMemoryBytes / MB;
  console.log(`GPU memory ${before.toFixed(1)} MB -> ${after.toFixed(1)} MB with KTX2`);

  // The panel shows the dropped file's name, so give it a friendly one.
  const modelName = basename(MODEL).replace(/-balanced(?=\.glb$)/i, '');
  await studio.put(modelName, modelBytes);
  const panel = await readFile(join(studio.work, 'panel.html'), 'utf8');
  await studio.put('panel-free.html', stubbedPanel(panel));
  await studio.put('panel-paid.html', stubbedPanel(panel, { licenses: [
    { key: 'K1', instanceId: null, scope: 'compress-textures' },
    { key: 'K2', instanceId: null, scope: 'texture-resizer' },
  ] }));

  // Panel shots, at 2x so they stay sharp when scaled into the screenshots.
  const free = await studio.open('panel-free.html', 400, 760, 2);
  await free.setFile('#file', modelName);
  await free.waitFor("!document.getElementById('result').hidden");
  await studio.put('tc-textures.png', await free.shot());

  const paid = await studio.open('panel-paid.html', 400, 760, 2);
  await paid.setFile('#file', modelName);
  await paid.waitFor("!document.getElementById('result').hidden");
  await paid.js("document.querySelector('[data-tool=compress]').click(); document.getElementById('run').click()");
  await paid.waitFor("document.getElementById('status').className === 'ok'");
  await studio.put('tc-compress.png', await paid.shot());

  await paid.js("document.querySelector('[data-tool=resize]').click(); document.getElementById('resizeTo').value = '1024'; document.getElementById('run').click()");
  await paid.waitFor("document.getElementById('status').className === 'ok'");
  await studio.put('tc-resize.png', await paid.shot());

  const query = `before=${before}&after=${after}&deal=${encodeURIComponent(DEAL)}`;
  for (const [shot, file, w, h] of [
    ['s1', 'screenshot-1.png', 1280, 800],
    ['s2', 'screenshot-2.png', 1280, 800],
    ['s3', 'screenshot-3.png', 1280, 800],
    ['tile', 'promo-tile-440x280.png', 440, 280],
    ['marquee', 'marquee-1400x560.png', 1400, 560],
  ]) await studio.save(`art.html?shot=${shot}&${query}`, w, h, join(HERE, file));
} finally {
  await studio.close();
}
