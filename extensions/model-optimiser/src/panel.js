import { CHECKOUT_URL, PRICE_LABEL } from '../../../src/shared/config/billing.js';
import { SINGLE_TOOL_CHECKOUT_URL, TOOL_PRICE_LABEL } from '../../../src/shared/config/toolProducts.js';
import { activateKey, isUnlocked, revalidate } from './licensing.js';
import { QUOTA_KEY, runsUsed, spendRun } from './quota.js';
import { IMAGE_ACCEPT, IMAGE_TOOLS, MODEL_ACCEPT } from './kinds.js';

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
const RUN_LABELS = { check: 'Check model', reduce: 'Reduce', optimise: 'Optimise', compress: 'Compress textures', textures: 'List textures', resize: 'Resize textures',
  inspect: 'Inspect model', rig: 'Inspect rig', animations: 'Inspect animations', compare: 'Compare A with B',
  clips: 'List clips', strip: 'Keep ticked clips', 'anim-optimise': 'Optimise animation',
  formats: 'Show file info', convert: 'Convert', split: 'Split into parts', merge: 'Merge models', lods: 'Make LODs',
  'icon-check': 'Check icon', icons: 'Make icon sets', xcassets: 'Make image sets', screenshots: 'Make screenshots',
  'sheet-check': 'Check image', cutout: 'Remove background', lines: 'Clean line art', iso: 'Make iso sprites' };
// Free read-only tools run as soon as a file is chosen.
const INSTANT = new Set(['check', 'textures', 'inspect', 'clips', 'formats', 'icon-check', 'sheet-check']);
// Picker formats: the GLB-only listings keep .glb; the newer editions take FBX, OBJ, glTF and ZIPs too.
const MODELS = MODEL_ACCEPT[EDITION.accepts || 'glb'];
const kindOf = (toolId) => (IMAGE_TOOLS.has(toolId) ? 'image' : 'model');
const EDITION_KINDS = new Set(EDITION.tools.map(kindOf));
const MODEL_RE = EDITION.accepts === 'any' ? /\.(glb|gltf|fbx|obj|zip)$/i : /\.glb$/i;
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
// Tools that take more files than the one at the top: tool -> [{ name, bytes }].
const extras = {};

let licenses = [];
let tool = EDITION.firstTool;
let model = null; // the chosen file: { name, bytes, size, kind: 'model' | 'image' }
let clipNames = []; // the model's animation clips, for Strip and Iso
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
function work(toolId, params, file = model) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    const copy = file.bytes.slice().buffer; // the original stays usable for the next run
    worker.postMessage({ id, tool: toolId, bytes: copy, params, name: file.name }, [copy]);
  });
}

/** Iso sprites need WebGL, so they draw here; the worker first makes any model a plain GLB. */
async function process(toolId, params) {
  if (toolId !== 'iso') return work(toolId, params);
  const prep = await work('iso-prep', {});
  // A computed path, so esbuild leaves three.js out of panel.js; iso-runner.js is its own bundle (build.mjs).
  const runner = './iso-runner.js';
  const { runIso } = await import(runner);
  return runIso(prep.output, params, model.name, (p, text) => status(`${text}…`));
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
  const needsOther = (tool === 'compare' && !other) || (tool === 'merge' && !(extras.merge || []).length);
  const wrongKind = model && model.kind !== kindOf(tool);
  const noun = kindOf(tool) === 'image' ? 'an image' : 'a model';
  run.disabled = busy || !model || needsOther || wrongKind;
  run.textContent = busy ? 'Working…' : !model ? `Choose ${noun} first` : wrongKind ? `This tool needs ${noun}` : needsOther ? (tool === 'merge' ? 'Add models to merge' : 'Choose model B') : RUN_LABELS[tool];
  $('file').accept = EDITION_KINDS.size > 1 ? `${MODELS},${IMAGE_ACCEPT}` : kindOf(tool) === 'image' ? IMAGE_ACCEPT : MODELS;

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

function table(rows) {
  const t = document.createElement('table');
  for (const cells of rows) {
    const tr = t.insertRow();
    for (const c of cells) tr.insertCell().textContent = c;
  }
  return t;
}
const sizes = (a, b) => `${fmtBytes(a)} → ${fmtBytes(b)}`;
const plural = (n, word) => `${fmtInt(n)} ${word}${n === 1 ? '' : 's'}`;

/** Result views for the Animation, Converter, App Assets and Image editions. */
const RENDER = {
  clips(r, box) {
    box.append(list([['Clips', fmtInt(r.clips.length)], ['Keyframes', fmtInt(r.totalKeyframes)], ['Bones', fmtInt(r.bones)], ['File size', fmtBytes(r.fileBytes)]]));
    if (r.clips.length) box.append(table(r.clips.map((c) => [c.name, `${c.duration.toFixed(2)} s`, `${fmtInt(c.keyframes)} keys`])));
  },
  strip(r, box) {
    box.append(list([['Kept', r.kept.join(', ') || 'none'], ['Removed', r.removed.join(', ')], ['Keyframes', `${fmtInt(r.keyframesBefore)} → ${fmtInt(r.keyframesAfter)}`], ['File size', sizes(r.bytesBefore, r.bytesAfter)]]));
  },
  'anim-optimise'(r, box) {
    const cut = r.keyframesBefore ? Math.round((1 - r.keyframesAfter / r.keyframesBefore) * 100) : 0;
    box.append(list([['Keyframes', `${fmtInt(r.keyframesBefore)} → ${fmtInt(r.keyframesAfter)} (−${cut}%)`], ['File size', sizes(r.bytesBefore, r.bytesAfter)], ['Strength', `${r.preset}${r.fps ? ` · ${r.fps} fps` : ''}`]]));
    if (r.clips.length > 1) box.append(table(r.clips.map((c) => [c.name, `${fmtInt(c.before)} → ${fmtInt(c.after)}`])));
  },
  formats(r, box) {
    box.append(list([['Format', r.format], ['File size', fmtBytes(r.inputBytes)], ['Triangles', fmtInt(r.triangles)], ['Meshes · materials', `${fmtInt(r.meshes)} · ${fmtInt(r.materials)}`],
      ['Textures', fmtInt(r.textures)], ['Animations · skins', `${fmtInt(r.animations)} · ${fmtInt(r.skins)}`], ['Can become', r.canBecome.join(', ')]]));
  },
  convert(r, box) {
    box.append(list([['Converted', `${r.from.toUpperCase()} → ${r.to.toUpperCase()}`], ['Triangles', fmtInt(r.triangles)], ['Materials · textures', `${fmtInt(r.materials)} · ${fmtInt(r.textures)}`],
      ['Animations', fmtInt(r.animations)], ['File size', fmtBytes(r.bytesOut)]]));
  },
  split(r, box) {
    box.append(list([['Parts', fmtInt(r.parts.length)]]));
    box.append(table(r.parts.map((p) => [p.name, plural(p.triangles, 'triangle'), fmtBytes(p.fileBytes)])));
  },
  merge(r, box) {
    box.append(table(r.models.map((m) => [m.name, plural(m.triangles, 'triangle')])));
    box.append(list([['Merged', `${plural(r.merged.triangles, 'triangle')} · ${plural(r.merged.meshes, 'mesh')}`], ['File size', fmtBytes(r.merged.fileBytes)]]));
  },
  lods(r, box) {
    box.append(table(r.levels.map((l, i) => [`LOD${i}`, `${Math.round(l.keep * 100)}%`, plural(l.triangles, 'triangle'), fmtBytes(l.fileBytes)])));
  },
  'icon-check'(r, box) {
    box.append(list([['Size', `${r.width}×${r.height} ${r.format}`], ['Transparent', r.transparent ? 'yes' : 'no']]));
    box.append(checks(r.checks));
  },
  icons(r, box) {
    box.append(list([['Platforms', r.platforms.join(', ')], ['Files', fmtInt(r.files)], ['iOS background', r.background]]));
  },
  xcassets(r, box) {
    box.append(table(r.sets.map((x) => [`${x.name}.imageset`, `@3x ${x.size3x}`, `@1x ${x.size1x}`])));
  },
  screenshots(r, box) {
    box.append(list([['Screenshots', fmtInt(r.files)], ['Fit', r.fit === 'cover' ? 'fill (cropped)' : 'fit (bars)']]));
    box.append(table(r.devices.map((d) => [d])));
  },
  'sheet-check'(r, box) {
    box.append(list([['Size', `${r.width}×${r.height} ${r.format}`], ['Background', r.background], ['Sprites found', fmtInt(r.sprites)], ['Artwork covers', `${r.coverage}%`]]));
  },
  cutout(r, box) {
    box.append(list([['Background', r.background], ['Sprites', fmtInt(r.sprites.length)], ['Size', `${r.width}×${r.height}`]]));
  },
  lines(r, box) {
    box.append(list([['Size', `${r.width}×${r.height}`], ['Lines', r.enhanced ? `redrawn at ${r.weight} px` : 'kept as drawn'], ...(r.breaksJoined ? [['Breaks joined', fmtInt(r.breaksJoined)]] : []), ...(r.paths != null ? [['SVG shapes', fmtInt(r.paths)]] : [])]));
  },
  iso(r, box) {
    box.append(list([['Frames', `${fmtInt(r.frames)} · ${r.directions} direction${r.directions === 1 ? '' : 's'}`], ['Clips', r.clips.join(', ') || 'still pose'], ['Sheet', `${r.sheet} · ${r.cell} px cells`], ['Model height', `${r.heightM} m`]]));
    box.append(checks(r.checks));
  },
};

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
  } else if (RENDER[toolId]) {
    RENDER[toolId](r, box);
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

const MIME = { glb: 'model/gltf-binary', zip: 'application/zip', png: 'image/png', fbx: 'application/octet-stream', svg: 'image/svg+xml' };

async function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME[name.split('.').pop()] || 'application/octet-stream' }));
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
  if (['textures', 'inspect', 'rig', 'animations', 'clips', 'formats', 'icon-check', 'sheet-check'].includes(toolId)) return {};
  if (toolId === 'compare') return { other: other.bytes.slice().buffer, otherName: other.name };
  const files = (id) => (extras[id] || []).map((f) => ({ name: f.name, bytes: f.bytes.slice().buffer }));
  const ticked = (cls) => [...document.querySelectorAll(`.${cls}:checked`)].map((el) => el.value).join(',');
  if (toolId === 'strip') return { keep: [...document.querySelectorAll('#clipList input:checked')].map((el) => Number(el.value)) };
  if (toolId === 'anim-optimise') return { preset: $('animPreset').value, fps: Number($('animFps').value) };
  if (toolId === 'convert') return { to: $('convertTo').value, scale: Number($('convertScale').value) };
  if (toolId === 'split') return { by: $('splitBy').value };
  if (toolId === 'merge') return { others: files('merge'), layout: $('mergeLayout').value };
  if (toolId === 'lods') return { levels: $('lodLevels').value };
  if (toolId === 'icons') return { platforms: ticked('platform') || 'ios', background: $('iconBg').value };
  if (toolId === 'xcassets') return { others: files('xcassets') };
  if (toolId === 'screenshots') return { others: files('screenshots'), devices: ticked('device') || 'iphone-6.9', fit: $('shotFit').value };
  if (toolId === 'cutout') return { tolerance: Number($('cutTol').value), split: $('cutSplit').checked };
  if (toolId === 'lines') return { enhance: $('lineEnhance').checked, weight: Number($('lineWeight').value), svg: $('lineSvg').checked };
  if (toolId === 'iso') return { tile: $('isoTile').value, dirs: Number($('isoDirs').value), clip: $('isoClip').value, fps: Number($('isoFps').value), style: $('isoStyle').value, height: Number($('isoHeight').value) || 0 };
  return { maxSize: Number($('maxSize').value) };
}

async function run() {
  if (!model || busy || !(owned(tool) || freeLeft())) return;
  const toolId = tool;
  const metered = !owned(toolId);
  busy = true;
  $('result').hidden = true;
  status(toolId === 'compress' ? 'Encoding textures… this can take a minute.' : toolId === 'iso' ? 'Drawing sprites…' : 'Working…');
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

const wantedFiles = () => [EDITION_KINDS.has('model') && (EDITION.accepts === 'any' ? 'GLB, FBX, OBJ or glTF' : 'a .glb file (binary glTF)'), EDITION_KINDS.has('image') && 'a PNG, JPEG or WebP image'].filter(Boolean).join(' or ');

async function choose(file) {
  if (!file) return;
  const kind = EDITION_KINDS.has('model') && MODEL_RE.test(file.name) ? 'model' : EDITION_KINDS.has('image') && IMAGE_RE.test(file.name) ? 'image' : null;
  if (!kind) return status(`Choose ${wantedFiles()}.`, 'bad');
  model = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), size: file.size, kind };
  clipNames = [];
  renderClips();
  $('fileName').textContent = file.name;
  $('fileHint').textContent = fmtBytes(file.size);
  $('result').hidden = true;
  status('');
  // Mixed editions: jump to a tool that takes this kind of file.
  if (kindOf(tool) !== kind) tool = EDITION.tools.find((t) => kindOf(t) === kind) || tool;
  render();
  if (INSTANT.has(tool) && kindOf(tool) === kind) run();
  const current = model;
  if (kind === 'image') {
    createImageBitmap(file).then((bmp) => { if (model === current) $('fileHint').textContent = `${bmp.width}×${bmp.height} · ${fmtBytes(file.size)}`; bmp.close?.(); }).catch(() => {});
    return;
  }
  // Show the triangle count straight away (the free check, run quietly), and the clips for Strip / Iso.
  work('check', {}).then((r) => {
    if (model === current) $('fileHint').textContent = `${fmtInt(r.report.stats.triangles)} triangles · ${fmtBytes(file.size)}`;
  }).catch(() => {});
  if (EDITION.tools.some((t) => t === 'strip' || t === 'iso')) {
    work('clips', {}).then((r) => {
      if (model !== current) return;
      clipNames = r.report.clips.map((c) => ({ index: c.index, name: c.name, duration: c.duration }));
      renderClips();
    }).catch(() => {});
  }
}

/** Strip's tick list and Iso's clip menu, from the model's clips. */
function renderClips() {
  const box = $('clipList');
  if (box) {
    box.replaceChildren();
    if (!model) box.append(Object.assign(document.createElement('small'), { textContent: 'Choose a model to list its clips.' }));
    else if (!clipNames.length) box.append(Object.assign(document.createElement('small'), { textContent: 'Reading clips…' }));
    for (const c of clipNames) {
      const label = document.createElement('label');
      const cb = Object.assign(document.createElement('input'), { type: 'checkbox', value: String(c.index), checked: true });
      label.append(cb, Object.assign(document.createElement('span'), { textContent: c.name, title: c.name }), Object.assign(document.createElement('small'), { textContent: `${c.duration.toFixed(2)} s` }));
      box.append(label);
    }
    if (clipNames.length > 1) {
      const tools = document.createElement('div');
      tools.className = 'clip-tools';
      for (const [text, on] of [['Tick all', true], ['Untick all', false]]) {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text });
        b.addEventListener('click', () => box.querySelectorAll('input').forEach((cb) => { cb.checked = on; }));
        tools.append(b);
      }
      box.prepend(tools);
    }
  }
  const menu = $('isoClip');
  if (menu) {
    // The first clip by default: every clip in 8 directions can outgrow what a browser can draw.
    menu.replaceChildren(...clipNames.map((c) => new Option(c.name, String(c.index))), new Option('All clips (up to 6)', 'all'), new Option('Still pose', 'none'));
  }
}

/** Extra files for Merge, Xcode image sets and Screenshots. */
function wireExtras(el) {
  const id = el.dataset.extras;
  const input = el.querySelector('input');
  const kind = el.dataset.kind || 'model';
  if (kind === 'model') input.accept = MODELS;
  const add = async (files) => {
    const ok = [...files].filter((f) => (kind === 'image' ? IMAGE_RE : MODEL_RE).test(f.name));
    if (ok.length < files.length) status(`Only ${kind === 'image' ? 'PNG, JPEG and WebP images' : 'GLB, FBX, OBJ and glTF models'} can be added here.`, 'bad');
    extras[id] = [...(extras[id] || []), ...(await Promise.all(ok.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))))];
    el.querySelector('.extras-list').textContent = extras[id].map((f) => f.name).join(', ') || 'None yet';
    render();
  };
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', (e) => { add(e.target.files); e.target.value = ''; });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('is-over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-over'); add(e.dataTransfer.files); });
}

async function chooseOther(file) {
  if (!file) return;
  if (!MODEL_RE.test(file.name)) return status(`Choose ${wantedFiles()}.`, 'bad');
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
if (otherDrop) otherDrop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('otherFile').click();
  }
});
$('otherFile')?.addEventListener('change', (e) => chooseOther(e.target.files[0]));
otherDrop?.addEventListener('dragover', (e) => { e.preventDefault(); otherDrop.classList.add('is-over'); });
otherDrop?.addEventListener('dragleave', () => otherDrop.classList.remove('is-over'));
otherDrop?.addEventListener('drop', (e) => {
  e.preventDefault();
  otherDrop.classList.remove('is-over');
  chooseOther(e.dataTransfer.files[0]);
});

// Only controls in this edition's tabs exist, so save whichever are present.
const remember = () => chrome.storage.local.set({
  [SETTINGS]: Object.fromEntries(['keep', 'acrossSeams', 'target', 'maxSize', 'resizeTo', 'role', 'engine', 'animPreset', 'animFps', 'convertTo', 'convertScale', 'splitBy', 'mergeLayout', 'lodLevels',
    'iconBg', 'shotFit', 'cutTol', 'cutSplit', 'lineEnhance', 'lineWeight', 'lineSvg', 'isoTile', 'isoDirs', 'isoFps', 'isoStyle']
    .map((id) => $(id))
    .filter(Boolean)
    .map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value])),
});
document.querySelectorAll('select, input[type=range], input[type=checkbox]').forEach((el) => el.addEventListener('change', remember));
const showKeep = () => {
  if ($('keep')) $('keepLabel').textContent = `${$('keep').value}%`;
  if ($('cutTol')) $('cutTolLabel').textContent = $('cutTol').value;
  if ($('lineWeight')) $('lineWeightLabel').textContent = `${$('lineWeight').value} px`;
};
document.querySelectorAll('input[type=range]').forEach((el) => el.addEventListener('input', showKeep));

// Edition: only its tabs, its name.
document.querySelectorAll('[role=tab]').forEach((tab) => { tab.hidden = !EDITION.tools.includes(tab.dataset.tool); });
document.querySelectorAll('.tool').forEach((section) => { if (!EDITION.tools.includes(section.dataset.panel)) section.remove(); });
document.querySelectorAll('[data-extras]').forEach(wireExtras);
renderClips();
$('fileName').textContent = `Drop ${EDITION_KINDS.size > 1 ? 'a model or an image' : EDITION_KINDS.has('image') ? 'an image' : EDITION.accepts === 'any' ? 'a 3D model' : 'a .glb'} here`;
if (EDITION.accepts === 'any' && EDITION_KINDS.has('model')) $('fileHint').textContent = `${EDITION_KINDS.has('image') ? 'GLB, FBX, OBJ, glTF, PNG, JPEG or WebP' : 'GLB, FBX, OBJ or glTF'} · runs on your computer, nothing is uploaded`;
else if (EDITION_KINDS.has('image')) $('fileHint').textContent = 'PNG, JPEG or WebP · runs on your computer, nothing is uploaded';
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
