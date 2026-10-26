/**
 * Re-renders the store art for a Reduce Polys edition: three 1280x800
 * screenshots, the 440x280 promo tile and the 1400x560 marquee (plus a 300x300 store logo for
 * Edge), into this folder (Chrome) or store/edge/ (Edge). Builds the
 * extension, drives its real panel in headless Chrome (with stand-ins for
 * chrome.* APIs) to capture the panel shots, renders the model before and
 * after with three.js, and saves RGB PNGs (the store rejects transparency).
 *
 *   node extensions/model-optimiser/store/render-store-art.mjs [--edition reduce-polys|reduce-polys-edge] [model.glb]
 *
 * Default model: ~/Downloads/assetbench-wizard-balanced.glb. Needs Chrome
 * or Edge installed.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { TOOL_PRICE_LABEL } from '../../../src/shared/config/toolProducts.js';
import { runTool } from '../src/engine.js';
import { allFree, EDITIONS } from '../editions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '..');
const ROOT = join(EXT, '..', '..');
const args = process.argv.slice(2);
const editionAt = args.indexOf('--edition');
const EDITION_ID = editionAt === -1 ? 'reduce-polys' : args[editionAt + 1];
const EDITION = EDITIONS[EDITION_ID];
if (!EDITION) throw new Error(`Unknown edition '${EDITION_ID}'.`);
const OUT = EDITION_ID === 'reduce-polys' ? HERE : join(HERE, 'edge');
const MODEL = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--edition') || join(homedir(), 'Downloads', 'assetbench-wizard-balanced.glb');
const DEAL = allFree(EDITION) ? 'Free. No account, no limits.' : `${EDITION.price || TOOL_PRICE_LABEL} once. No subscription.`;
const KEEP = 0.25;
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const browserPath = BROWSERS.find((p) => existsSync(p));
if (!browserPath) throw new Error('Chrome or Edge not found.');
if (!existsSync(MODEL)) throw new Error(`Model not found: ${MODEL}`);

// 1. Build the extension and stage everything in a temp folder.
execFileSync(process.execPath, [join(EXT, 'build.mjs'), '--edition', EDITION_ID], { stdio: 'inherit' });
const work = await mkdtemp(join(tmpdir(), 'ab-store-art-'));
await cp(join(EXT, 'dist', EDITION_ID), work, { recursive: true });
await mkdir(OUT, { recursive: true });
await cp(join(ROOT, 'node_modules/three/build'), join(work, 'build'), { recursive: true });
await cp(join(ROOT, 'node_modules/three/examples/jsm'), join(work, 'jsm'), { recursive: true });
await cp(join(HERE, 'store-art.html'), join(work, 'store-art.html'));
const modelBytes = new Uint8Array(await readFile(MODEL));
await writeFile(join(work, 'before.glb'), modelBytes);
// The panel shows the dropped file's name, so give it a friendly one.
const panelModel = join(work, basename(MODEL).replace(/-balanced(?=\.glb$)/i, ''));
await writeFile(panelModel, modelBytes);
await writeFile(join(work, 'after.glb'), (await runTool('reduce', modelBytes, { keep: KEEP }, 'model.glb')).output);

// The panel with chrome.* stand-ins: free (no keys), and paid (a Reduce key,
// with Lemon Squeezy's validate call answered "valid").
const panel = await readFile(join(work, 'panel.html'), 'utf8');
const stub = (stored) => `<script>window.chrome={storage:{local:{get:async()=>(${JSON.stringify(stored)}),set:async()=>{}}},downloads:{download:async()=>1}};` +
  `const f=window.fetch;window.fetch=(u,o)=>String(u).includes('lemonsqueezy')?Promise.resolve(new Response('{"valid":true}')):f(u,o);</script>`;
const withStub = (stored) => panel.replace('<script type="module" src="panel.js"></script>', `${stub(stored)}<script type="module" src="panel.js"></script>`);
await writeFile(join(work, 'panel-free.html'), withStub({}));
// A free edition needs no key, so its "paid" shot is just the free panel.
await writeFile(join(work, 'panel-paid.html'), withStub(allFree(EDITION) ? {} : { licenses: [{ key: 'K', instanceId: null, scope: 'reduce-polys' }] }));

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
const profile = await mkdtemp(join(tmpdir(), 'ab-store-chrome-'));
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
  const waitFor = async (expr, ms = 60000) => {
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
  // 3. Panel shots (at 2x so they stay sharp when scaled into the screenshots).
  const modelFile = panelModel;
  const free = await open(`${base}/panel-free.html`, 400, 760, 2);
  await free.setFile(modelFile);
  await free.waitFor("/triangles/.test(document.getElementById('fileHint').textContent)");
  // Check tab with its results; the locked Reduce tab beside it shows the price.
  await free.js("document.querySelector('[data-tool=check]').click(); document.getElementById('run').click()");
  await free.waitFor("!document.getElementById('result').hidden");
  await writeFile(join(work, 'rp-check.png'), await free.shot());

  const paid = await open(`${base}/panel-paid.html`, 400, 760, 2);
  await paid.setFile(modelFile);
  await paid.waitFor("/triangles/.test(document.getElementById('fileHint').textContent)");
  await paid.js(`document.getElementById('keep').value = ${KEEP * 100}; document.getElementById('keep').dispatchEvent(new Event('input'))`);
  await paid.js("document.getElementById('run').click()");
  await paid.waitFor("document.getElementById('status').className === 'ok'");
  await writeFile(join(work, 'rp-reduced.png'), await paid.shot());

  // 4. Store art, saved as RGB PNGs.
  const deal = encodeURIComponent(DEAL);
  for (const [shot, file, w, h] of [
    ['s1', 'screenshot-1-before-after.png', 1280, 800],
    ['s2', 'screenshot-2-reduce.png', 1280, 800],
    ['s3', 'screenshot-3-free-check.png', 1280, 800],
    ['tile', 'promo-tile-440x280.png', 440, 280],
    ['marquee', 'marquee-1400x560.png', 1400, 560],
  ]) {
    const page = await open(`${base}/store-art.html?shot=${shot}&deal=${deal}`, w, h, 1);
    await page.waitFor("document.title === 'ready'");
    await sleep(400);
    await sharp(await page.shot()).flatten({ background: '#0b0b0a' }).removeAlpha().png().toFile(join(OUT, file));
    console.log(`saved ${join(OUT, file)}`);
  }
  // Edge's store logo: the site logo at 300x300.
  if (OUT !== HERE) {
    await sharp(join(HERE, '..', '..', '..', 'public', 'branding', 'asset-bench-logo-1024.png')).resize(300, 300).png().toFile(join(OUT, 'store-logo-300x300.png'));
    console.log(`saved ${join(OUT, 'store-logo-300x300.png')}`);
  }
} finally {
  ws.close();
  chrome.kill();
  server.close();
  await sleep(500);
  await rm(work, { recursive: true, force: true }).catch(() => {});
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
