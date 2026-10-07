const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createLicense } = require('./license.cjs');

// Written by desktop/build.mjs: { id, name, storeId, productId, buyUrl }.
const tool = require('./tool.json');

const TOOL_URL = 'app://tool/index.html';
const GATE_URL = 'app://gate/activate.html';
const roots = { tool: path.join(__dirname, 'tool'), gate: path.join(__dirname, 'gate') };

/** Stable per-PC ID: the Windows MachineGuid, hashed so the raw value never leaves the PC. */
function machineId() {
  let raw = os.hostname();
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true });
    raw = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1] ?? raw;
  } catch {
    /* not Windows or registry unreadable — fall back to the hostname */
  }
  return crypto.createHash('sha256').update(`assetbench:${raw}`).digest('hex');
}

// Module scripts, wasm and fetch() all need a real origin, not file://.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let license;
let win;

function serve(request) {
  const { host, pathname } = new URL(request.url);
  const base = roots[host];
  // The lock: the tool's files are only served once this PC holds a valid key.
  if (!base || (host === 'tool' && !license.isUnlocked())) return new Response('Locked', { status: 403 });
  const file = path.normalize(path.join(base, decodeURIComponent(pathname)));
  if (!file.startsWith(base + path.sep)) return new Response('Not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    {
      label: 'Licence',
      submenu: [
        { label: `Buy ${tool.name}…`, click: () => shell.openExternal(tool.buyUrl) },
        {
          label: 'Remove licence from this PC…',
          enabled: license.isUnlocked(),
          click: removeLicence,
        },
      ],
    },
  ]));
}

async function removeLicence() {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Remove licence', 'Cancel'],
    defaultId: 1,
    message: 'Remove the licence from this PC?',
    detail: 'This frees your key so you can activate it on a different PC. This app will lock until a key is entered again.',
  });
  if (response !== 0) return;
  const result = await license.deactivate();
  if (!result.ok) {
    dialog.showErrorBox('Could not remove licence', result.error);
    return;
  }
  buildMenu();
  win.loadURL(GATE_URL);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0d0b',
    title: `Asset Bench ${tool.name}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  // Links to the website, Lemon Squeezy, docs etc. open in the buyer's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.loadURL(license.isUnlocked() ? TOOL_URL : GATE_URL);
}

app.whenReady().then(() => {
  license = createLicense({
    storeId: tool.storeId,
    productId: tool.productId,
    productName: `Asset Bench ${tool.name}`,
    file: path.join(app.getPath('userData'), 'licence.json'),
    machineId: machineId(),
    instanceName: `${tool.name} on ${os.hostname()}`,
  });

  protocol.handle('app', serve);

  ipcMain.handle('licence:info', () => ({ name: tool.name, buyUrl: tool.buyUrl }));
  ipcMain.handle('licence:buy', () => shell.openExternal(tool.buyUrl));
  ipcMain.handle('licence:activate', async (_event, key) => {
    const result = await license.activate(key);
    if (result.ok) {
      buildMenu();
      win.loadURL(TOOL_URL);
    }
    return result;
  });

  buildMenu();
  createWindow();

  // A refunded or disabled key locks on the next online launch.
  license.revalidate().then((unlocked) => {
    buildMenu();
    if (!unlocked && win && !win.webContents.getURL().startsWith(GATE_URL)) win.loadURL(GATE_URL);
  });
});

app.on('window-all-closed', () => app.quit());
