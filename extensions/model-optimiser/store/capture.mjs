/**
 * Shared by the per-edition store art renderers (store/<edition>/render.mjs):
 * stages a built edition in a temp folder, serves it, and drives headless
 * Chrome over the DevTools protocol to capture the real panel and the art
 * pages. ../render-store-art.mjs (Reduce Polys) predates this and keeps its
 * own copy.
 *
 *   const studio = await openStudio('inspector', { 'art.html': join(HERE, 'art.html') });
 *   const page = await studio.open('panel-free.html', 400, 760, 2);
 *   ...
 *   await studio.save('art.html?shot=s1', 1280, 800, join(HERE, 'screenshot-1.png'));
 *   await studio.close();
 */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The panel with stand-ins for chrome.* APIs and `stored` as its storage;
 * Lemon Squeezy's validate call is answered "valid" so stored keys stick.
 */
export function stubbedPanel(panelHtml, stored = {}) {
  const stub = `<script>window.chrome={storage:{local:{get:async()=>(${JSON.stringify(stored)}),set:async()=>{}},onChanged:{addListener(){}}},downloads:{download:async()=>1}};` +
    `const f=window.fetch;window.fetch=(u,o)=>String(u).includes('lemonsqueezy')?Promise.resolve(new Response('{"valid":true}')):f(u,o);</script>`;
  return panelHtml.replace('<script type="module" src="panel.js"></script>', `${stub}<script type="module" src="panel.js"></script>`);
}

/** Builds `editionId`, stages it plus `extraFiles` ({ name: sourcePath }), and starts headless Chrome. */
export async function openStudio(editionId, extraFiles = {}) {
  const browserPath = BROWSERS.find((p) => existsSync(p));
  if (!browserPath) throw new Error('Chrome or Edge not found.');
  execFileSync(process.execPath, [join(EXT, 'build.mjs'), '--edition', editionId], { stdio: 'inherit' });
  const work = await mkdtemp(join(tmpdir(), `ab-${editionId}-art-`));
  await cp(join(EXT, 'dist', editionId), work, { recursive: true });
  for (const [name, from] of Object.entries(extraFiles)) await cp(from, join(work, name));

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
  const profile = await mkdtemp(join(tmpdir(), 'ab-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 400);
  const chrome = spawn(browserPath, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
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

  /** Opens `path` (relative to the staged folder) at width x height. */
  async function open(path, width, height, scale = 1) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    await s('Page.navigate', { url: `${base}/${path}` });
    const js = async (expression) => (await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
    const waitFor = async (expr, ms = 180000) => {
      for (const t = Date.now(); Date.now() - t < ms; await sleep(250)) if (await js(expr)) return;
      throw new Error(`timed out waiting for ${expr}`);
    };
    const shot = async () => Buffer.from((await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } })).data, 'base64');
    /** Sets a file input (by CSS selector) to a file in the staged folder. */
    const setFile = async (selector, name) => {
      const { root } = await s('DOM.getDocument');
      const { nodeId } = await s('DOM.querySelector', { nodeId: root.nodeId, selector });
      await s('DOM.setFileInputFiles', { nodeId, files: [join(work, name)] });
    };
    await waitFor('document.readyState === "complete"');
    await sleep(500);
    return { js, waitFor, shot, setFile };
  }

  return {
    work,
    open,
    /** Writes a file into the staged folder (models, stubbed panels, panel shots). */
    put: (name, data) => writeFile(join(work, name), data),
    /** Captures an art page once it sets its title to 'ready', as an RGB PNG (the store rejects transparency). */
    async save(path, width, height, out) {
      const page = await open(path, width, height, 1);
      await page.waitFor("document.title === 'ready'");
      await sleep(300);
      await sharp(await page.shot()).flatten({ background: '#0b0b0a' }).removeAlpha().png().toFile(out);
      console.log(`saved ${out}`);
    },
    async close() {
      ws.close();
      chrome.kill();
      server.close();
      await sleep(500);
      await rm(work, { recursive: true, force: true }).catch(() => {});
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}
