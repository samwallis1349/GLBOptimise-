import { CHECKOUT_URL, PRICE_LABEL } from '../../../src/shared/config/billing.js';
import { SINGLE_TOOL_CHECKOUT_URL, TOOL_PRICE_LABEL, TOOL_PRODUCTS } from '../../../src/shared/config/toolProducts.js';
import { activateKey, isUnlocked, revalidate, SITE_TOOL } from './licensing.js';
import { fmtCountdown, msUntilReset, QUOTA_KEY, runsUsed, spendRun, utcDay } from './quota.js';

// Set at build time from editions.js: which tools this store product has.
const EDITION = __EDITION__;

const FREE = new Set(EDITION.free);
const PRICE = EDITION.price || TOOL_PRICE_LABEL;
const DAILY_FREE = EDITION.dailyFree || 0;

const $ = (id) => document.getElementById(id);
const LICENSES = 'licenses';
const SETTINGS = 'settings';
const TOOL_NAMES = { check: 'Mobile Ready Check', reduce: 'Reduce Polys', optimise: 'Optimise GLB', compress: 'Compress Textures', textures: 'Texture Check', resize: 'Texture Resizer' };
const RUN_LABELS = { check: 'Check model', reduce: 'Reduce', optimise: 'Optimise', compress: 'Compress textures', textures: 'List textures', resize: 'Resize textures' };
// Free read-only tools run as soon as a model is chosen.
const INSTANT = new Set(['check', 'textures']);

let licenses = [];
let tool = EDITION.firstTool;
let model = null; // { name, bytes, size }
let busy = false;
let used = 0; // free runs used today (src/quota.js)
let usedDay = utcDay();
let countdown = 0;

const fmtBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtInt = (n) => Number(n).toLocaleString('en-GB');

function status(text, kind = '') {
  $('status').textContent = text;
  $('status').className = kind;
}

// ---------------------------------------------------------------- engine
const worker = new Worker('engine-worker.js', { type: 'module' });
let nextId = 0;
const pending = new Map();
worker.onmessage = ({ data }) => {
  const job = pending.get(data.id);
  if (!job) return;
  pending.delete(data.id);
  if (data.ok) job.resolve(data.result);
  else job.reject(new Error(data.error));
};
function process(toolId, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    const copy = model.bytes.slice().buffer; // the original stays usable for the next run
    worker.postMessage({ id, tool: toolId, bytes: copy, params, name: model.name }, [copy]);
  });
}

// ---------------------------------------------------------------- quota
// A paid tool this browser hasn't unlocked still runs DAILY_FREE times a day.
const owned = (id) => isUnlocked(id, licenses, FREE);

function freeLeft() {
  if (usedDay !== utcDay()) {
    used = 0;
    usedDay = utcDay();
  }
  return Math.max(0, DAILY_FREE - used);
}

async function loadQuota() {
  used = await runsUsed(chrome.storage.local);
  usedDay = utcDay();
}

function tick() {
  if (freeLeft()) return render(); // midnight UTC passed
  $('resetIn').textContent = `Resets in ${fmtCountdown(msUntilReset())}`;
}

// ---------------------------------------------------------------- view
function render() {
  document.querySelectorAll('[role=tab]').forEach((tab) => {
    const id = tab.dataset.tool;
    tab.setAttribute('aria-selected', String(id === tool));
    tab.classList.toggle('is-locked', !isUnlocked(id, licenses, FREE));
    tab.dataset.price = PRICE;
  });
  document.querySelectorAll('.tool').forEach((section) => { section.hidden = section.dataset.panel !== tool; });

  const unlocked = owned(tool);
  const left = freeLeft();
  const runnable = unlocked || left > 0;
  $('credits').hidden = unlocked || !DAILY_FREE;
  $('credits').textContent = `${left}/${DAILY_FREE} free today`;
  $('credits').classList.toggle('is-empty', !left);

  $('lock').hidden = unlocked;
  $('resetIn').hidden = runnable;
  clearInterval(countdown);
  if (!runnable && DAILY_FREE) {
    tick();
    countdown = setInterval(tick, 1000);
  }
  if (!unlocked) {
    const siteTool = SITE_TOOL[tool];
    $('lockTitle').textContent = !DAILY_FREE ? `Unlock ${TOOL_NAMES[tool]}`
      : left ? `Unlimited ${TOOL_NAMES[tool]}` : `You've used your ${DAILY_FREE} free runs for today`;
    $('buyTool').textContent = `Unlock ${TOOL_NAMES[tool]} for ${PRICE}`;
    $('buyTool').href = EDITION.checkoutUrl || TOOL_PRODUCTS[siteTool]?.checkoutUrl || SINGLE_TOOL_CHECKOUT_URL;
    $('buyAll').textContent = `Every tool with All Access, ${PRICE_LABEL}`;
    $('buyAll').href = CHECKOUT_URL;
  }

  const run = $('run');
  run.hidden = !runnable;
  run.disabled = busy || !model;
  run.textContent = busy ? 'Working…' : model ? RUN_LABELS[tool] : 'Choose a model first';

  const paid = licenses.filter((l) => l.scope !== 'all').length;
  const all = licenses.some((l) => l.scope === 'all');
  $('keysInfo').textContent = all ? 'All Access active' : paid ? `${paid} tool${paid === 1 ? '' : 's'} unlocked` : '';
}

function list(rows) {
  const dl = document.createElement('dl');
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
  return dl;
}

function warnings(items) {
  const ul = document.createElement('ul');
  for (const w of items) {
    const li = document.createElement('li');
    li.textContent = w;
    ul.append(li);
  }
  return ul;
}

function showResult(toolId, result) {
  const box = $('result');
  box.replaceChildren();
  const r = result.report;
  if (toolId === 'check') {
    const s = r.stats;
    box.append(list([
      ['Triangles', fmtInt(s.triangles)],
      ['Draw calls', fmtInt(s.drawCalls)],
      ['Texture memory', fmtBytes(s.textureMemoryBytes)],
      ['File size', fmtBytes(s.fileBytes)],
    ]));
    const table = document.createElement('table');
    for (const d of r.devices) {
      const tr = table.insertRow();
      tr.insertCell().textContent = d.name;
      const score = tr.insertCell();
      score.textContent = `${d.score}/100 · ${d.verdict.replace('-', ' ')}`;
      score.className = `v-${d.verdict}`;
    }
    box.append(table);
  } else if (toolId === 'textures') {
    box.append(list([
      ['Textures', fmtInt(r.textures.length)],
      ['GPU memory', fmtBytes(r.textureMemoryBytes)],
      ['File size', fmtBytes(r.fileBytes)],
    ]));
    if (r.textures.length) {
      const table = document.createElement('table');
      for (const t of r.textures) {
        const tr = table.insertRow();
        tr.insertCell().textContent = t.name;
        tr.insertCell().textContent = `${t.width}×${t.height} ${String(t.mimeType || '').replace('image/', '')}`;
        tr.insertCell().textContent = fmtBytes(t.gpuMemoryBytes);
      }
      box.append(table);
    }
  } else if (toolId === 'resize') {
    box.append(list([
      ['Textures resized', fmtInt(r.textures.length)],
      ['GPU memory', `${fmtBytes(r.memoryBefore)} → ${fmtBytes(r.memoryAfter)}`],
      ['File size', `${fmtBytes(r.bytesBefore)} → ${fmtBytes(r.bytesAfter)}`],
    ]));
  } else if (toolId === 'compress') {
    box.append(list([
      ['Textures converted', fmtInt(r.textures.length)],
      ['File size', `${fmtBytes(r.bytesBefore)} → ${fmtBytes(r.bytesAfter)}`],
    ]));
  } else {
    const before = r.before.stats ?? r.before;
    const after = r.after.stats ?? r.after;
    box.append(list([
      ['Triangles', `${fmtInt(before.triangles)} → ${fmtInt(after.triangles)}`],
      ['File size', `${fmtBytes(before.fileBytes)} → ${fmtBytes(after.fileBytes)}`],
      ...(r.after.evaluation ? [['Score', `${r.before.evaluation.score} → ${r.after.evaluation.score}/100`]] : []),
    ]));
  }
  if (r.warnings?.length) box.append(warnings(r.warnings));
  if (result.output) {
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn primary';
    save.textContent = `Download ${result.name}`;
    save.addEventListener('click', () => download(result.output, result.name));
    box.append(save);
  }
  box.hidden = false;
}

async function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
  await chrome.downloads.download({ url, filename: name, saveAs: false });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  status(`Saved ${name} to your downloads.`, 'ok');
}

// ---------------------------------------------------------------- actions
function paramsFor(toolId) {
  if (toolId === 'check') return { role: $('role').value, engine: $('engine').value };
  if (toolId === 'reduce') return { keep: Number($('keep').value) / 100, acrossSeams: $('acrossSeams').checked };
  if (toolId === 'optimise') return { target: $('target').value };
  if (toolId === 'resize') return { maxSize: Number($('resizeTo').value) };
  if (toolId === 'textures') return {};
  return { maxSize: Number($('maxSize').value) };
}

async function run() {
  if (!model || busy || !(owned(tool) || freeLeft())) return;
  const toolId = tool;
  const metered = !owned(toolId);
  busy = true;
  $('result').hidden = true;
  status(toolId === 'compress' ? 'Encoding textures… this can take a minute.' : 'Working…');
  render();
  try {
    const result = await process(toolId, paramsFor(toolId));
    if (metered) {
      used = await spendRun(chrome.storage.local);
      usedDay = utcDay();
    }
    showResult(toolId, result);
    status(result.output ? 'Done. Download it below.' : 'Done.', 'ok');
  } catch (err) {
    status(err.message, 'bad');
  } finally {
    busy = false;
    render();
  }
}

async function choose(file) {
  if (!file) return;
  if (!/\.glb$/i.test(file.name)) return status('Choose a .glb file (binary glTF).', 'bad');
  model = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), size: file.size };
  $('fileName').textContent = file.name;
  $('fileHint').textContent = fmtBytes(file.size);
  $('result').hidden = true;
  status('');
  render();
  if (INSTANT.has(tool)) return run();
  // Elsewhere, show the triangle count straight away (the free check, run quietly).
  const current = model;
  process('check', {}).then((r) => {
    if (model === current) $('fileHint').textContent = `${fmtInt(r.report.stats.triangles)} triangles · ${fmtBytes(file.size)}`;
  }).catch(() => {});
}

async function activate() {
  const key = $('keyInput').value;
  $('activate').disabled = true;
  status('Checking key…');
  const result = await activateKey(key, tool, { instanceName: `${EDITION.store} extension`, products: EDITION.products || {} });
  $('activate').disabled = false;
  if (!result.ok) return status(result.error, 'bad');
  licenses = [...licenses.filter((l) => l.key !== result.license.key), result.license];
  await chrome.storage.local.set({ [LICENSES]: licenses });
  $('keyInput').value = '';
  const unlockedHere = owned(tool);
  status(
    result.license.scope === 'all' ? 'All Access active: every tool is unlocked.'
      : unlockedHere ? `${TOOL_NAMES[tool]} unlocked.` : 'That key unlocks a different tool, so it was saved for that one.',
    unlockedHere ? 'ok' : 'bad',
  );
  render();
}

// ---------------------------------------------------------------- wiring
document.querySelectorAll('[role=tab]').forEach((tab) => tab.addEventListener('click', () => {
  tool = tab.dataset.tool;
  $('result').hidden = true;
  status('');
  render();
}));
$('run').addEventListener('click', run);
$('activate').addEventListener('click', activate);
$('keyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') activate(); });

const drop = $('drop');
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('file').click();
  }
});
$('file').addEventListener('change', (e) => choose(e.target.files[0]));
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('is-over');
  choose(e.dataTransfer.files[0]);
});

// Only controls in this edition's tabs exist, so save whichever are present.
const remember = () => chrome.storage.local.set({
  [SETTINGS]: Object.fromEntries(['keep', 'acrossSeams', 'target', 'maxSize', 'resizeTo', 'role', 'engine']
    .map((id) => $(id))
    .filter(Boolean)
    .map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value])),
});
document.querySelectorAll('select, input[type=range], input[type=checkbox]').forEach((el) => el.addEventListener('change', remember));
const showKeep = () => { if ($('keep')) $('keepLabel').textContent = `${$('keep').value}%`; };
$('keep').addEventListener('input', showKeep);

// Edition: only its tabs, its name.
document.querySelectorAll('[role=tab]').forEach((tab) => { tab.hidden = !EDITION.tools.includes(tab.dataset.tool); });
document.querySelectorAll('.tool').forEach((section) => { if (!EDITION.tools.includes(section.dataset.panel)) section.remove(); });
// Tabs in the edition's own order, so its free check can come first.
for (const id of EDITION.tools) document.querySelector('.tabs').append(document.querySelector(`[role=tab][data-tool="${id}"]`));
document.querySelector('.tabs').style.setProperty('--tabs', String(EDITION.tools.length));
$('heading').replaceChildren(`${EDITION.heading[0]} `, Object.assign(document.createElement('span'), { textContent: EDITION.heading[1] }));
document.title = EDITION.shortName;

const stored = await chrome.storage.local.get([LICENSES, SETTINGS]);
licenses = stored[LICENSES] || [];
await loadQuota();
for (const [id, value] of Object.entries(stored[SETTINGS] || {})) {
  const el = $(id);
  if (!el) continue;
  if (el.type === 'checkbox') el.checked = Boolean(value);
  else el.value = value;
}
showKeep();
render();

// Free runs spent in another window's panel (or reset from DevTools).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[QUOTA_KEY]) loadQuota().then(render);
});

// Drop refunded or cancelled keys in the background; offline keeps them.
if (licenses.length) {
  revalidate(licenses).then(async (kept) => {
    if (kept.length === licenses.length) return;
    licenses = kept;
    await chrome.storage.local.set({ [LICENSES]: licenses });
    render();
  });
}
