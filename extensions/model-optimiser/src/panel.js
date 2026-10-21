import { CHECKOUT_URL, PRICE_LABEL } from '../../../src/shared/config/billing.js';
import { SINGLE_TOOL_CHECKOUT_URL, TOOL_PRICE_LABEL } from '../../../src/shared/config/toolProducts.js';
import { activateKey, isUnlocked, revalidate } from './licensing.js';
import { QUOTA_KEY, runsUsed, spendRun } from './quota.js';

// Set at build time from editions.js: which tools this store product has.
const EDITION = __EDITION__;

const FREE = new Set(EDITION.free);
const PRICE = TOOL_PRICE_LABEL;
const FREE_RUNS = EDITION.freeRuns || 0;
// New 99p keys are bound to this site tool; any of the edition's tools' keys unlock it all.
const BIND_TOOL = EDITION.tools.find((t) => !FREE.has(t)) || EDITION.firstTool;

const $ = (id) => document.getElementById(id);
const LICENSES = 'licenses';
const SETTINGS = 'settings';
const TOOL_NAMES = { check: 'Mobile Ready Check', reduce: 'Reduce Polys', optimise: 'Optimise GLB', compress: 'Compress Textures', textures: 'Texture Check', resize: 'Texture Resizer',
  inspect: 'Inspect GLB', rig: 'Rig Inspector', animations: 'Animation Inspector', compare: 'Asset Compare' };
const RUN_LABELS = { check: 'Check model', reduce: 'Reduce', optimise: 'Optimise', compress: 'Compress textures', textures: 'List textures', resize: 'Resize textures',
  inspect: 'Inspect model', rig: 'Inspect rig', animations: 'Inspect animations', compare: 'Compare A with B' };
// Free read-only tools run as soon as a model is chosen.
const INSTANT = new Set(['check', 'textures', 'inspect']);

let licenses = [];
let tool = EDITION.firstTool;
let model = null; // { name, bytes, size }
let other = null; // Compare's model B, same shape
let busy = false;
let used = 0; // free runs used (src/quota.js)

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
// Paid tools this browser hasn't unlocked still run FREE_RUNS times in all.
const owned = (id) => isUnlocked(id, licenses, FREE, EDITION.tools);
// The free-run count lives in both, so a reinstall doesn't reset it (src/quota.js).
const QUOTA_AREAS = [chrome.storage.local, chrome.storage.sync].filter(Boolean);

const freeLeft = () => Math.max(0, FREE_RUNS - used);

async function loadQuota() {
  used = await runsUsed(...QUOTA_AREAS);
}

// ---------------------------------------------------------------- view
function render() {
  document.querySelectorAll('[role=tab]').forEach((tab) => {
    const id = tab.dataset.tool;
    tab.setAttribute('aria-selected', String(id === tool));
    tab.classList.toggle('is-locked', !owned(id));
    tab.dataset.price = PRICE;
  });
  document.querySelectorAll('.tool').forEach((section) => { section.hidden = section.dataset.panel !== tool; });

  const unlocked = owned(tool);
  const left = freeLeft();
  const runnable = unlocked || left > 0;
  $('credits').hidden = unlocked || !FREE_RUNS;
  $('credits').textContent = `${left}/${FREE_RUNS} free uses left`;
  $('credits').classList.toggle('is-empty', !left);

  $('lock').hidden = unlocked;
  if (!unlocked) {
    $('lockTitle').textContent = !FREE_RUNS ? `Unlock ${EDITION.shortName}`
      : left ? `Unlimited ${EDITION.shortName}` : `You've used your ${FREE_RUNS} free uses`;
    $('buyTool').textContent = `Unlock ${EDITION.shortName} for ${PRICE}, one payment`;
    $('buyTool').href = SINGLE_TOOL_CHECKOUT_URL;
    $('buyAll').textContent = `Every tool with All Access, ${PRICE_LABEL}`;
    $('buyAll').href = CHECKOUT_URL;
  }

  const run = $('run');
  run.hidden = !runnable;
  const needsOther = tool === 'compare' && !other;
  run.disabled = busy || !model || needsOther;
  run.textContent = busy ? 'Working…' : !model ? 'Choose a model first' : needsOther ? 'Choose model B' : RUN_LABELS[tool];

  const all = licenses.some((l) => l.scope === 'all');
  const paidTool = EDITION.tools.find((t) => !FREE.has(t));
  $('keysInfo').textContent = all ? 'All Access active' : paidTool && owned(paidTool) ? `${EDITION.shortName} unlocked` : '';
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

/** The site analysers' own check lists: { level|severity, text|title }. */
function checks(items) {
  const ul = document.createElement('ul');
  ul.className = 'checks';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = item.level || item.severity || '';
    li.textContent = item.text || item.title;
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
  } else if (toolId === 'inspect') {
    const t = r.totals;
    box.append(list([
      ['Health', `${r.health.score}/100 · ${r.health.grade} · ${r.health.summary}`],
      ['Triangles', fmtInt(t.triangles)],
      ['Draw calls', fmtInt(t.drawCalls)],
      ['Materials · textures', `${fmtInt(t.materials)} · ${fmtInt(t.textures)}`],
      ['Animations · joints', `${fmtInt(t.animations)} · ${fmtInt(t.joints)}`],
      ['File size', fmtBytes(r.fileBytes)],
      ['GPU memory (est.)', fmtBytes(r.gpuBytes)],
    ]));
    box.append(checks(r.issues.length ? r.issues : [{ level: 'ok', text: 'No issues found.' }]));
  } else if (toolId === 'rig') {
    if (r.hasRig) {
      box.append(list([
        ['Joints', fmtInt(r.joints)],
        ['Skins', fmtInt(r.skins)],
        ['Hierarchy depth', fmtInt(r.maxDepth)],
        ['Skinned vertices', fmtInt(r.skinnedVertices)],
        ['Root', r.roots.join(', ')],
      ]));
    }
    box.append(checks(r.checks));
  } else if (toolId === 'animations') {
    if (r.hasAnimation) {
      box.append(list([
        ['Clips', fmtInt(r.clips.length)],
        ['Tracks', fmtInt(r.tracks)],
        ['Keyframes', fmtInt(r.keyframes)],
      ]));
      const table = document.createElement('table');
      for (const c of r.clips) {
        const tr = table.insertRow();
        tr.insertCell().textContent = c.name;
        tr.insertCell().textContent = `${c.duration.toFixed(2)} s · ${Math.round(c.frameRate)} fps`;
        const loop = tr.insertCell();
        loop.textContent = c.loops === null ? '' : c.loops ? 'loops' : 'pops';
        loop.className = c.loops === false ? 'v-needs-work' : 'v-mobile-ready';
      }
      box.append(table);
    }
    box.append(checks(r.checks));
  } else if (toolId === 'compare') {
    const verdict = document.createElement('p');
    verdict.className = `verdict ${r.verdict.tone}`;
    verdict.textContent = r.verdict.headline;
    const text = document.createElement('p');
    text.className = 'small';
    text.textContent = r.verdict.text;
    box.append(verdict, text);
    if (r.changes.length) box.append(list(r.changes.map((c) => [c.label, `${c.a} → ${c.b}`])));
    if (r.regressions.length) box.append(checks(r.regressions));
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
  if (['textures', 'inspect', 'rig', 'animations'].includes(toolId)) return {};
  if (toolId === 'compare') return { other: other.bytes.slice().buffer, otherName: other.name };
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
    if (metered) used = await spendRun(...QUOTA_AREAS);
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

async function chooseOther(file) {
  if (!file) return;
  if (!/\.glb$/i.test(file.name)) return status('Choose a .glb file (binary glTF).', 'bad');
  other = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), size: file.size };
  $('otherName').textContent = `B: ${file.name}`;
  $('result').hidden = true;
  status('');
  render();
}

async function activate() {
  const key = $('keyInput').value;
  $('activate').disabled = true;
  status('Checking key…');
  const result = await activateKey(key, BIND_TOOL, { products: EDITION.products || {} });
  $('activate').disabled = false;
  if (!result.ok) return status(result.error, 'bad');
  licenses = [...licenses.filter((l) => l.key !== result.license.key), result.license];
  await chrome.storage.local.set({ [LICENSES]: licenses });
  $('keyInput').value = '';
  const unlockedHere = owned(tool);
  status(
    result.license.scope === 'all' ? 'All Access active: every tool is unlocked.'
      : unlockedHere ? `${EDITION.shortName} unlocked: every tool here is yours.` : 'That key unlocks a different tool, so it was saved for that one.',
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

// Compare's second model (B), picked or dropped the same way.
const otherDrop = $('otherDrop');
otherDrop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('otherFile').click();
  }
});
$('otherFile').addEventListener('change', (e) => chooseOther(e.target.files[0]));
otherDrop.addEventListener('dragover', (e) => { e.preventDefault(); otherDrop.classList.add('is-over'); });
otherDrop.addEventListener('dragleave', () => otherDrop.classList.remove('is-over'));
otherDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  otherDrop.classList.remove('is-over');
  chooseOther(e.dataTransfer.files[0]);
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
  if ((area === 'local' || area === 'sync') && changes[QUOTA_KEY]) loadQuota().then(render);
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
