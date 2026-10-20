/**
 * Re-renders the GLB Texture Compressor store art into this folder: three
 * 1280x800 screenshots, the 440x280 promo tile and the 1400x560 marquee.
 * Builds the extension, drives its real panel in headless Chrome (with
 * stand-ins for chrome.* APIs) for the panel shots, measures the model's
 * GPU memory before and after KTX2 with the extension's own engine, and saves
 * RGB PNGs (the store rejects transparency). Same approach as
 * ../render-store-art.mjs, which does Reduce Polys.
 *
 *   node extensions/model-optimiser/store/texture-compressor/render.mjs [model.glb]
 *
 * Default model: ~/Downloads/assetbench-wizard-balanced.glb. Needs Chrome
 * or Edge installed.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { TOOL_PRICE_LABEL } from '../../../../src/shared/config/toolProducts.js';
import { analyseGlb } from '../../../../worker/api/glb.js';
import { runTool } from '../../src/engine.js';

const EDITION_ID = 'texture-compressor';
const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '..', '..');
const ROOT = join(EXT, '..', '..');
const MODEL = process.argv[2] || join(homedir(), 'Downloads', 'assetbench-wizard-balanced.glb');
const DEAL = `5 free a day, then ${TOOL_PRICE_LABEL} once`;
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const browserPath = BROWSERS.find((p) => existsSync(p));
if (!browserPath) throw new Error('Chrome or Edge not found.');
if (!existsSync(MODEL)) throw new Error(`Model not found: ${MODEL}`);

// 1. Build the extension, stage it, and measure the KTX2 saving for the headline.
execFileSync(process.execPath, [join(EXT, 'build.mjs'), '--edition', EDITION_ID], { stdio: 'inherit' });
const work = await mkdtemp(join(tmpdir(), 'ab-tc-art-'));
await cp(join(EXT, 'dist', EDITION_ID), work, { recursive: true });
await cp(join(HERE, 'art.html'), join(work, 'art.html'));
const modelBytes = new Uint8Array(await readFile(MODEL));
const panelModel = join(work, basename(MODEL).replace(/-balanced(?=\.glb$)/i, ''));
await writeFile(panelModel, modelBytes);

globalThis.__ASSETBENCH_BASIS_WASM__ = await WebAssembly.compile(await readFile(join(work, 'basis_encoder.wasm')));
const MB = 1048576;
const before = analyseGlb(modelBytes).textureMemoryBytes / MB;
const after = analyseGlb((await runTool('compress', modelBytes, { maxSize: 0 })).output).textureMemoryBytes / MB;
console.log(`GPU memory ${before.toFixed(1)} MB -> ${after.toFixed(1)} MB with KTX2`);

// The panel with chrome.* stand-ins: free (no keys), and paid (keys for both
// paid tabs, with Lemon Squeezy's validate call answered "valid").
const panel = await readFile(join(work, 'panel.html'), 'utf8');
const stub = (stored) => `<script>window.chrome={storage:{local:{get:async()=>(${JSON.stringify(stored)}),set:async()=>{}},onChanged:{addListener(){}}},downloads:{download:async()=>1}};` +
  `const f=window.fetch;window.fetch=(u,o)=>String(u).includes('lemonsqueezy')?Promise.resolve(new Response('{"valid":true}')):f(u,o);</script>`;
const withStub = (stored) => panel.replace('<script type="module" src="panel.js"></script>', `${stub(stored)}<script type="module" src="panel.js"></script>`);
await writeFile(join(work, 'panel-free.html'), withStub({}));
await writeFile(join(work, 'panel-paid.html'), withStub({ licenses: [
  { key: 'K1', instanceId: null, scope: 'compress-textures' },
  { key: 'K2', instanceId: null, scope: 'texture-resizer' },
] }));

// 2. Serve it and start headless Chrome with the DevTools protocol.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const path = join(work, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'ab-tc-chrome-'));
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(browserPath, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let version;
for (let i = 0; i < 40 && !version; i += 1) {
  await sleep(250);
  version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
}
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0;
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++n;
  ws.addEventListener('message', function h(e) {
    const m = JSON.parse(e.data);
    if (m.id !== id) return;
    ws.removeEventListener('message', h);
    m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result);
  });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

async function open(url, width, height, scale) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await s('Page.navigate', { url });
  const js = async (expression) => (await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
  const waitFor = async (expr, ms = 180000) => {
    for (const t = Date.now(); Date.now() - t < ms; await sleep(250)) if (await js(expr)) return;
    throw new Error(`timed out waiting for ${expr}`);
  };
  const shot = async () => Buffer.from((await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } })).data, 'base64');
  const setFile = async (file) => {
    const { root } = await s('DOM.getDocument');
    const { nodeId } = await s('DOM.querySelector', { nodeId: root.nodeId, selector: '#file' });
    await s('DOM.setFileInputFiles', { nodeId, files: [file] });
  };
  await waitFor('document.readyState === "complete"');
  await sleep(500);
  return { js, waitFor, shot, setFile };
}

try {
  // 3. Panel shots, at 2x so they stay sharp when scaled into the screenshots.
  const free = await open(`${base}/panel-free.html`, 400, 760, 2);
  await free.setFile(panelModel);
  await free.waitFor("!document.getElementById('result').hidden");
  await writeFile(join(work, 'tc-textures.png'), await free.shot());

  const paid = await open(`${base}/panel-paid.html`, 400, 760, 2);
  await paid.setFile(panelModel);
  await paid.waitFor("!document.getElementById('result').hidden");
  await paid.js("document.querySelector('[data-tool=compress]').click(); document.getElementById('run').click()");
  await paid.waitFor("document.getElementById('status').className === 'ok'");
  await writeFile(join(work, 'tc-compress.png'), await paid.shot());

  await paid.js("document.querySelector('[data-tool=resize]').click(); document.getElementById('resizeTo').value = '1024'; document.getElementById('run').click()");
  await paid.waitFor("document.getElementById('status').className === 'ok'");
  await writeFile(join(work, 'tc-resize.png'), await paid.shot());

  // 4. Store art, saved as RGB PNGs.
  const query = `before=${before}&after=${after}&deal=${encodeURIComponent(DEAL)}`;
  for (const [shot, file, w, h] of [
    ['s1', 'screenshot-1.png', 1280, 800],
    ['s2', 'screenshot-2.png', 1280, 800],
    ['s3', 'screenshot-3.png', 1280, 800],
    ['tile', 'promo-tile-440x280.png', 440, 280],
    ['marquee', 'marquee-1400x560.png', 1400, 560],
  ]) {
    const page = await open(`${base}/art.html?shot=${shot}&${query}`, w, h, 1);
    await page.waitFor("document.title === 'ready'");
    await sleep(300);
    await sharp(await page.shot()).flatten({ background: '#0b0b0a' }).removeAlpha().png().toFile(join(HERE, file));
    console.log(`saved ${join(HERE, file)}`);
  }
} finally {
  ws.close();
  chrome.kill();
  server.close();
  await sleep(500);
  await rm(work, { recursive: true, force: true }).catch(() => {});
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
