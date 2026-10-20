/**
 * Re-renders the GLB Inspector store art into this folder: three 1280x800
 * screenshots, the 440x280 promo tile and the 1400x560 marquee. Drives the
 * real panel in headless Chrome (../capture.mjs). Compare's model B is the
 * same model reduced to 30% by the extension's own engine.
 *
 *   node extensions/model-optimiser/store/inspector/render.mjs [rigged-animated.glb]
 *
 * Default model: ~/Downloads/little-robot-rigged.glb (one skin, three clips).
 * Needs Chrome or Edge installed.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_PRICE_LABEL } from '../../../../src/shared/config/toolProducts.js';
import { runTool } from '../../src/engine.js';
import { openStudio, stubbedPanel } from '../capture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = process.argv[2] || join(homedir(), 'Downloads', 'little-robot-rigged.glb');
const DEAL = `5 free a day, then ${TOOL_PRICE_LABEL} once`;
if (!existsSync(MODEL)) throw new Error(`Model not found: ${MODEL}`);

const studio = await openStudio('inspector', { 'art.html': join(HERE, 'art.html') });
try {
  const modelBytes = new Uint8Array(await readFile(MODEL));
  const modelName = basename(MODEL);
  const lighterName = modelName.replace(/\.glb$/i, '-optimised.glb');
  await studio.put(modelName, modelBytes);
  await studio.put(lighterName, (await runTool('reduce', modelBytes, { keep: 0.3 }, modelName)).output);
  const score = (await runTool('inspect', modelBytes, {}, modelName)).report.health.score;

  const panel = await readFile(join(studio.work, 'panel.html'), 'utf8');
  await studio.put('panel-free.html', stubbedPanel(panel));
  await studio.put('panel-paid.html', stubbedPanel(panel, { licenses: [
    { key: 'K1', instanceId: null, scope: 'rig-inspector' },
    { key: 'K2', instanceId: null, scope: 'animation-inspector' },
    { key: 'K3', instanceId: null, scope: 'asset-compare' },
  ] }));

  // Panel shots, at 2x so they stay sharp when scaled into the screenshots.
  const free = await studio.open('panel-free.html', 400, 760, 2);
  await free.setFile('#file', modelName);
  await free.waitFor("!document.getElementById('result').hidden");
  await studio.put('gi-inspect.png', await free.shot());

  const paid = await studio.open('panel-paid.html', 400, 760, 2);
  await paid.setFile('#file', modelName);
  await paid.waitFor("!document.getElementById('result').hidden");
  for (const [tab, file] of [['rig', 'gi-rig.png'], ['animations', 'gi-anims.png']]) {
    await paid.js(`document.querySelector('[data-tool=${tab}]').click(); document.getElementById('run').click()`);
    await paid.waitFor("document.getElementById('status').className === 'ok'");
    await studio.put(file, await paid.shot());
  }
  await paid.js("document.querySelector('[data-tool=compare]').click()");
  await paid.setFile('#otherFile', lighterName);
  await paid.waitFor("!document.getElementById('run').disabled");
  await paid.js("document.getElementById('run').click()");
  await paid.waitFor("document.getElementById('status').className === 'ok'");
  await studio.put('gi-compare.png', await paid.shot());

  const query = `score=${score}&deal=${encodeURIComponent(DEAL)}`;
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
