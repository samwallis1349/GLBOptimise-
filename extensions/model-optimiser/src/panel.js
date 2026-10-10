import { CHECKOUT_URL, PRICE_LABEL } from '../../../src/shared/config/billing.js';
import { SINGLE_TOOL_CHECKOUT_URL, TOOL_PRICE_LABEL, TOOL_PRODUCTS } from '../../../src/shared/config/toolProducts.js';
import { activateKey, isUnlocked, revalidate, SITE_TOOL } from './licensing.js';

// Set at build time from editions.js: which tools this store product has.
const EDITION = __EDITION__;

const $ = (id) => document.getElementById(id);
const LICENSES = 'licenses';
const SETTINGS = 'settings';
const TOOL_NAMES = { check: 'Mobile Ready Check', reduce: 'Reduce Polys', optimise: 'Optimise GLB', compress: 'Compress Textures' };
const RUN_LABELS = { check: 'Check model', reduce: 'Reduce', optimise: 'Optimise', compress: 'Compress textures' };

let licenses = [];
let tool = EDITION.firstTool;
let model = null; // { name, bytes, size }
let busy = false;

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

// ---------------------------------------------------------------- view
function render() {
  document.querySelectorAll('[role=tab]').forEach((tab) => {
    const id = tab.dataset.tool;
    tab.setAttribute('aria-selected', String(id === tool));
    tab.classList.toggle('is-locked', !isUnlocked(id, licenses));
    tab.dataset.price = TOOL_PRICE_LABEL;
  });
  document.querySelectorAll('.tool').forEach((section) => { section.hidden = section.dataset.panel !== tool; });

  const unlocked = isUnlocked(tool, licenses);
  $('lock').hidden = unlocked;
  if (!unlocked) {
    const siteTool = SITE_TOOL[tool];
    $('lockTitle').textContent = `Unlock ${TOOL_NAMES[tool]}`;
    $('buyTool').textContent = `Unlock ${TOOL_NAMES[tool]} for ${TOOL_PRICE_LABEL}`;
    $('buyTool').href = TOOL_PRODUCTS[siteTool]?.checkoutUrl || SINGLE_TOOL_CHECKOUT_URL;
    $('buyAll').textContent = `Every tool with All Access, ${PRICE_LABEL}`;
    $('buyAll').href = CHECKOUT_URL;
  }

  const run = $('run');
  run.hidden = !unlocked;
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
  return { maxSize: Number($('maxSize').value) };
}

async function run() {
  if (!model || busy || !isUnlocked(tool, licenses)) return;
  const toolId = tool;
  busy = true;
  $('result').hidden = true;
  status(toolId === 'compress' ? 'Encoding textures… this can take a minute.' : 'Working…');
  render();
  try {
    const result = await process(toolId, paramsFor(toolId));
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
  if (tool === 'check') return run();
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
  const result = await activateKey(key, tool, { instanceName: 'Chrome extension' });
  $('activate').disabled = false;
  if (!result.ok) return status(result.error, 'bad');
  licenses = [...licenses.filter((l) => l.key !== result.license.key), result.license];
  await chrome.storage.local.set({ [LICENSES]: licenses });
  $('keyInput').value = '';
  const unlockedHere = isUnlocked(tool, licenses);
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
  [SETTINGS]: Object.fromEntries(['keep', 'acrossSeams', 'target', 'maxSize', 'role', 'engine']
    .map((id) => $(id))
    .filter(Boolean)
    .map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value])),
});
document.querySelectorAll('select, input[type=range], input[type=checkbox]').forEach((el) => el.addEventListener('change', remember));
$('keep').addEventListener('input', () => { $('keepLabel').textContent = `${$('keep').value}%`; });

// Edition: only its tabs, its name.
document.querySelectorAll('[role=tab]').forEach((tab) => { tab.hidden = !EDITION.tools.includes(tab.dataset.tool); });
document.querySelectorAll('.tool').forEach((section) => { if (!EDITION.tools.includes(section.dataset.panel)) section.remove(); });
document.querySelector('.tabs').style.setProperty('--tabs', String(EDITION.tools.length));
$('heading').replaceChildren(`${EDITION.heading[0]} `, Object.assign(document.createElement('span'), { textContent: EDITION.heading[1] }));
document.title = EDITION.shortName;

const stored = await chrome.storage.local.get([LICENSES, SETTINGS]);
licenses = stored[LICENSES] || [];
for (const [id, value] of Object.entries(stored[SETTINGS] || {})) {
  const el = $(id);
  if (!el) continue;
  if (el.type === 'checkbox') el.checked = Boolean(value);
  else el.value = value;
}
$('keepLabel').textContent = `${$('keep').value}%`;
render();

// Drop refunded or cancelled keys in the background; offline keeps them.
if (licenses.length) {
  revalidate(licenses).then(async (kept) => {
    if (kept.length === licenses.length) return;
    licenses = kept;
    await chrome.storage.local.set({ [LICENSES]: licenses });
    render();
  });
}
