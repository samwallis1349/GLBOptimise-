/**
 * Model to Iso Sprites: wires the page to the stage, the live preview, the sprite
 * renderer and the exporter. One state object; `refresh()` derives the rest.
 */
import { Stage } from './stage.js';
import { Preview } from './preview.js';
import { SpriteRenderer } from './sprites.js';
import { makeSprites } from './export.js';
import { planFrames, countFrames, layoutSheet, sampleTimes, frameName, slug } from './frames.js';
import { TILE_PRESETS, tilePreset, pxPerMetre, DIRECTION_SETS, STYLE_PRESETS, autoCell } from './presets.js';
import { loadFiles, ACCEPT, UserError } from '../../character-workshop/js/formats.js';
import { suggestCategories } from '../../character-workshop/js/animation.js';
import { disposeObject } from '../../character-workshop/js/dispose.js';

const SAMPLE = { url: new URL('../../character-workshop/samples/robot-expressive.glb', import.meta.url).href, name: 'RobotExpressive.glb', height: 1.5 };
const $ = (id) => document.getElementById(id);
const DIR_LABEL = { n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SW', w: 'W', nw: 'NW' };

const state = {
  loaded: null, modelName: '', clips: [], selected: new Set(), travel: new Map(),
  units: 'auto', heightM: 1.75, facing: 0,
  tile: 'standard', cellMode: 'auto', base: null, baseManual: false, fit: null,
  dirCount: 8, dir: 'se',
  fps: 12, loopSafe: true, inPlace: true,
  stylePreset: 'clean', style: { ...STYLE_PRESETS.clean },
  maxWidth: 4096, wantZip: true, pattern: '{model}_{anim}_{dir}_{frame}',
  previewClip: null, frame: 0, playing: true, busy: false, result: null,
};

const stage = new Stage();
const preview = new Preview($('previewCanvas'), stage);
const sprites = new SpriteRenderer(stage);

// ---------------------------------------------------------------- helpers
function toast(text, detail = '', kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  if (detail) { const s = document.createElement('small'); s.textContent = detail; el.append(s); }
  $('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 9000 : 4000);
}
function setPressed(group, value) {
  group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(value))));
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const selectedClips = () => state.clips.filter((c) => state.selected.has(c));
const pixelK = () => (state.style.pixel ? state.style.pixelScale : 1);

function unitScale() {
  const raw = stage.rawHeight || 1;
  if (state.units === 'm') return 1;
  if (state.units === 'cm') return 0.01;
  if (state.units === 'height') return state.heightM / raw;
  return raw > 20 ? 0.01 : 1;
}

/** Cell size and base point for the current settings. */
function geometry() {
  const { tileW } = tilePreset(state.tile);
  const ppm = pxPerMetre(tileW);
  const fit = state.fit ?? stage.metrics();
  const auto = autoCell({ height: fit.height, reach: fit.reach, tileW, margin: 1.08 });
  const k = pixelK();
  let cell = auto.cell;
  let anchor = { ...auto.anchor };
  if (state.cellMode !== 'auto') {
    cell = Number(state.cellMode);
    anchor = { x: cell / 2, y: Math.max(1, cell - (auto.cell - auto.anchor.y)) };
  }
  cell = Math.ceil(cell / k) * k;
  if (state.baseManual && state.base) anchor = { x: state.base.x, y: state.base.y };
  anchor = { x: Math.round(anchor.x / k) * k, y: Math.round(anchor.y / k) * k };
  anchor.x = Math.min(Math.max(0, anchor.x), cell); anchor.y = Math.min(Math.max(0, anchor.y), cell);
  return { tileW, ppm, cell, anchor, autoCell: auto.cell };
}

function rows() {
  return planFrames({ model: state.modelName || 'model', clips: selectedClips(), dirs: DIRECTION_SETS[state.dirCount], fps: state.fps, loopSafe: state.loopSafe, pattern: state.pattern });
}

// ---------------------------------------------------------------- model loading
async function openFiles(files, opts = {}) {
  if (!files?.length || state.busy) return;
  state.busy = true;
  $('emptyMsg').textContent = 'Loading…'; $('emptyMsg').hidden = false;
  try {
    const loaded = await loadFiles(files);
    if (state.loaded) { stage.clearModel(); disposeObject(state.loaded.root); state.loaded.dispose?.(); }
    state.loaded = loaded;
    state.modelName = loaded.source.fileName.replace(/\.[^.]+$/, '');
    state.clips = (loaded.clips || []).filter((c) => c.duration > 0 && c.tracks.length);
    stage.setModel(loaded.root);
    state.units = opts.height ? 'height' : 'auto';
    if (opts.height) state.heightM = opts.height;
    $('units').value = state.units; $('heightM').value = state.heightM;
    state.facing = 0; $('facing').value = '0';
    state.baseManual = false;
    stage.setUnits(unitScale(), state.facing);
    pickDefaultClips();
    state.frame = 0;
    showModel(loaded);
    remeasure();
    toast(`Loaded ${loaded.source.fileName}`, `${state.clips.length} animation${state.clips.length === 1 ? '' : 's'}`);
  } catch (error) {
    console.error(error);
    if (!state.loaded) $('emptyMsg').textContent = 'Drop a model, or try the sample robot.';
    toast(error instanceof UserError ? error.message : 'Could not open that file.', error.detail || error.message, 'error');
  } finally {
    state.busy = false;
    $('emptyMsg').hidden = !!state.loaded;
    refresh();
  }
}

async function loadSample() {
  try {
    const res = await fetch(SAMPLE.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const file = new File([await res.blob()], SAMPLE.name, { type: 'model/gltf-binary' });
    await openFiles([file], { height: SAMPLE.height });
  } catch (error) {
    toast('The sample robot could not be loaded', error.message, 'error');
  }
}

function pickDefaultClips() {
  state.selected.clear();
  state.travel.clear();
  for (const c of state.clips) state.travel.set(c, stage.rootTravel(c));
  const s = suggestCategories(state.clips);
  for (const id of ['idle', 'walk', 'run']) if (s[id]) state.selected.add(s[id].clip);
  if (!state.selected.size && state.clips[0]) state.selected.add(state.clips[0]);
  state.previewClip = [...state.selected][0] ?? null;
}

function showModel(loaded) {
  $('dropEmpty').hidden = true; $('modelRow').hidden = false;
  $('modelName').textContent = loaded.source.fileName;
  let skinned = false;
  loaded.root.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  $('modelInfo').textContent = `${skinned ? 'Rigged' : 'Not rigged'} · ${state.clips.length} clip${state.clips.length === 1 ? '' : 's'} · ${(loaded.source.fileSize / 1048576).toFixed(1)} MB`;
  renderClipList();
}

// ---------------------------------------------------------------- measuring (debounced: it skins every vertex)
const remeasure = debounce(() => {
  if (!stage.model) { state.fit = null; refresh(); return; }
  state.fit = stage.measure(selectedClips(), state.inPlace);
  refresh();
}, 120);

// ---------------------------------------------------------------- UI rendering
function renderClipList() {
  const box = $('clipList');
  box.textContent = '';
  if (!state.clips.length) {
    const p = document.createElement('p'); p.className = 'note';
    p.textContent = state.loaded ? 'This model has no animations, so you get one still frame per direction.' : 'No animations yet. A model without clips makes one still frame per direction.';
    box.append(p); return;
  }
  if (state.clips.length > 3) {
    const tools = document.createElement('div'); tools.className = 'clips-tools';
    for (const [label, fn] of [['Select all', () => state.clips.forEach((c) => state.selected.add(c))], ['None', () => state.selected.clear()]]) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.onclick = () => { fn(); onClipsChanged(); };
      tools.append(b);
    }
    box.append(tools);
  }
  for (const clip of state.clips) {
    const l = document.createElement('label');
    l.className = 'clip' + ((state.travel.get(clip) ?? 0) > 0.05 ? ' moves' : '');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = state.selected.has(clip);
    cb.onchange = () => { cb.checked ? state.selected.add(clip) : state.selected.delete(clip); if (cb.checked) state.previewClip = clip; onClipsChanged(); };
    const n = document.createElement('span'); n.className = 'name'; n.textContent = clip.name || 'Unnamed'; n.title = clip.name;
    const f = document.createElement('span'); f.className = 'n'; f.dataset.clipFrames = '';
    f.textContent = `${sampleTimes(clip.duration, state.fps, state.loopSafe).length} frames`;
    l.append(cb, n, f);
    box.append(l);
  }
}

function onClipsChanged() {
  if (!state.selected.has(state.previewClip)) state.previewClip = selectedClips()[0] ?? null;
  state.frame = 0;
  renderClipList();
  remeasure();
  refresh();
}

function renderPreviewClipSelect() {
  const sel = $('previewClip');
  const clips = selectedClips();
  sel.textContent = '';
  if (!clips.length) { const o = new Option('Still pose', ''); sel.append(o); sel.disabled = true; return; }
  sel.disabled = false;
  clips.forEach((c, i) => { const o = new Option(c.name || `Clip ${i + 1}`, String(state.clips.indexOf(c))); o.selected = c === state.previewClip; sel.append(o); });
}

function previewTimes() {
  return state.previewClip ? sampleTimes(state.previewClip.duration, state.fps, state.loopSafe) : [0];
}

function renderFrameStrip() {
  const strip = $('frameStrip');
  const times = previewTimes();
  if (strip.childElementCount !== times.length) {
    strip.textContent = '';
    times.forEach((_, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `Frame ${i + 1}`);
      b.onclick = () => { state.playing = false; state.frame = i; syncPlay(); drawPreview(true); };
      strip.append(b);
    });
  }
  [...strip.children].forEach((b, i) => b.classList.toggle('on', i === state.frame));
}

function syncPlay() {
  $('playBtn').classList.toggle('playing', state.playing);
  $('playBtn').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
}

let lastGeom = null;
function refresh() {
  const g = geometry();
  lastGeom = g;
  const has = !!stage.model;
  const k = pixelK();
  stage.setStyle({ outline: state.style.outline, ppm: g.ppm / k, lighting: state.style.lighting, shadow: state.style.shadow });

  // steps
  const now = state.result ? 'export' : has ? 'setup' : 'model';
  const order = ['model', 'setup', 'export'];
  document.querySelectorAll('.step').forEach((s) => {
    const i = order.indexOf(s.dataset.step), j = order.indexOf(now);
    s.classList.toggle('done', i < j); s.classList.toggle('now', i === j);
  });

  // units note
  const scale = unitScale();
  const h = stage.rawHeight * scale;
  $('heightWrap').hidden = state.units !== 'height';
  const note = $('unitsNote');
  note.classList.remove('warn');
  if (!has) note.textContent = '';
  else {
    note.textContent = `Stands ${h.toFixed(2)} m tall in the game world.`;
    if (state.units === 'auto' && (h > 4 || h < 0.2)) { note.textContent += ' That looks off: use "Set height…" to fix it.'; note.classList.add('warn'); }
  }

  // camera & scale
  $('ppmOut').textContent = `${g.ppm.toFixed(1)} px`;
  $('cellOut').textContent = `${g.cell} px`;
  $('tileTag').textContent = `tile ${g.tileW} × ${g.tileW / 2}`;

  // base point
  if (document.activeElement !== $('baseX')) $('baseX').value = g.anchor.x;
  if (document.activeElement !== $('baseY')) $('baseY').value = g.anchor.y;
  $('baseX').max = $('baseY').max = g.cell;
  $('baseState').textContent = state.baseManual ? 'Manual' : has ? 'Feet found' : 'Auto';
  $('baseState').classList.toggle('manual', state.baseManual);
  $('baseNote').textContent = `The pixel in each ${g.cell} px cell that lands on the tile centre.`;
  $('baseTag').textContent = `base ${g.anchor.x}, ${g.anchor.y}`;

  // directions
  const dirs = DIRECTION_SETS[state.dirCount];
  if (!dirs.includes(state.dir)) state.dir = dirs.includes('se') ? 'se' : dirs[0];
  document.querySelectorAll('#compass button').forEach((b) => {
    b.classList.toggle('on', dirs.includes(b.dataset.dir));
    b.disabled = !dirs.includes(b.dataset.dir);
    b.setAttribute('aria-pressed', String(b.dataset.dir === state.dir));
  });
  $('dirNote').textContent = state.dirCount === 1 ? 'One view, facing south-east.' : `All ${state.dirCount} render. Click one to preview it.`;
  setPressed($('dirCount'), state.dirCount);

  // animations + style controls
  setPressed($('fpsSeg'), state.fps);
  document.querySelectorAll('[data-clip-frames]').forEach((el, i) => { el.textContent = `${sampleTimes(state.clips[i].duration, state.fps, state.loopSafe).length} frames`; });
  setPressed($('styleSeg'), state.stylePreset);
  setPressed($('lightSeg'), state.style.lighting);
  $('outline').value = state.style.outline;
  $('outlineOut').textContent = `${state.style.outline} px`;
  $('shadow').checked = state.style.shadow;
  $('pixel').checked = state.style.pixel;
  $('pixelOpts').hidden = !state.style.pixel;
  $('pixelScale').value = String(state.style.pixelScale);
  $('levels').value = String(state.style.levels);
  renderPreviewClipSelect();

  // export summary
  const r = rows();
  const total = countFrames(r);
  const layout = layoutSheet(r, g.cell, state.maxWidth);
  const clips = selectedClips();
  $('sumFrames').textContent = has ? `${total} frame${total === 1 ? '' : 's'} · ${state.dirCount} direction${state.dirCount === 1 ? '' : 's'}` : 'Load a model first';
  $('sumParts').textContent = has ? (clips.length ? '= ' + clips.map((c) => `${c.name} ${sampleTimes(c.duration, state.fps, state.loopSafe).length}`).join(' + ') + `, each from ${state.dirCount} side${state.dirCount === 1 ? '' : 's'}` : '= one still frame per direction') : '';
  $('sumSheet').textContent = has ? `= sheet ${layout.width} × ${layout.height} px, ${g.cell} px cells` : '';
  const ex = r[0]?.frames[Math.min(3, (r[0]?.frames.length ?? 1) - 1)];
  $('patternEx').textContent = (ex ? ex.name : frameName(state.pattern, { model: 'guard', anim: 'walk', dir: 'se', frame: 3 })) + '.png';
  const tooBig = layout.width > 16384 || layout.height > 16384;
  $('makeBtn').disabled = !has || state.busy || tooBig;
  $('makeBtn').title = tooBig ? 'The sheet is too big for a browser. Pick fewer clips or directions.' : '';

  renderFrameStrip();
  syncPlay();
  drawPreview(true);
  updateThumbs();
}

// ---------------------------------------------------------------- preview loop
let lastStep = 0;
let exactDirty = true;
function drawPreview(force = false) {
  const times = previewTimes();
  if (state.frame >= times.length) state.frame = 0;
  const g = lastGeom ?? geometry();
  stage.setDirection(state.dir);
  if (stage.model) stage.pose(state.previewClip, times[state.frame], state.inPlace);
  const fit = state.fit ?? stage.metrics();
  preview.zoom = state.zoom ?? 1;
  preview.resize(stage.model ? fit.height : 1.8);
  preview.setHelpers({ refs: $('showRefs').checked });
  const showExact = $('showSprite').checked && !!stage.model;
  // With "Exact sprite" on, the model is drawn by the sprite renderer and laid over the grid.
  stage.center.visible = !showExact; stage.shadow.visible = !showExact && !!state.style.shadow && !!stage.model;
  preview.render();
  stage.center.visible = true; stage.shadow.visible = !!state.style.shadow && !!stage.model;
  const box = preview.cellBox(g);
  const cb = $('cellBox');
  cb.hidden = !$('showCell').checked || !stage.model;
  Object.assign(cb.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.size}px`, height: `${box.size}px` });
  cb.firstElementChild.style.left = `${g.anchor.x * box.scale}px`;
  cb.firstElementChild.style.top = `${g.anchor.y * box.scale}px`;
  const img = $('exactImg');
  img.hidden = !showExact;
  if (showExact && (force || exactDirty)) {
    sprites.configure({ tileW: g.tileW, cell: g.cell, anchor: g.anchor, pixel: state.style.pixel, pixelScale: state.style.pixelScale, levels: state.style.levels });
    img.src = sprites.render().toDataURL('image/png');
    Object.assign(img.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.size}px`, height: `${box.size}px` });
    exactDirty = false;
  }
  $('previewInfo').textContent = stage.model
    ? `${state.previewClip?.name ?? 'Still'} · ${DIR_LABEL[state.dir]} · frame ${state.frame + 1} of ${times.length}`
    : 'No model yet';
  $('timeOut').textContent = `${times[state.frame].toFixed(2)} / ${(state.previewClip?.duration ?? 0).toFixed(2)} s`;
  [...$('frameStrip').children].forEach((b, i) => b.classList.toggle('on', i === state.frame));
}

function loop(t) {
  requestAnimationFrame(loop);
  if (document.hidden || $('setupView').hidden || state.busy) return;
  if (state.playing && stage.model && state.previewClip) {
    if (t - lastStep >= 1000 / state.fps) {
      lastStep = t;
      state.frame = (state.frame + 1) % previewTimes().length;
      exactDirty = true;
      drawPreview();
    }
  } else if (resized) { resized = false; drawPreview(true); }
}
let resized = false;
new ResizeObserver(() => { resized = true; if (!state.playing) drawPreview(true); }).observe($('viewport'));

// ---------------------------------------------------------------- direction thumbnails (real sprite renders)
const updateThumbs = debounce(() => {
  const box = $('thumbs');
  box.textContent = '';
  if (!stage.model || state.busy) return;
  const g = lastGeom ?? geometry();
  sprites.configure({ tileW: g.tileW, cell: g.cell, anchor: g.anchor, pixel: state.style.pixel, pixelScale: state.style.pixelScale, levels: state.style.levels });
  const t = previewTimes()[0];
  for (const dir of DIRECTION_SETS[state.dirCount]) {
    stage.setDirection(dir);
    stage.pose(state.previewClip, t, state.inPlace);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'thumb'; b.setAttribute('aria-pressed', String(dir === state.dir));
    b.setAttribute('aria-label', `Preview ${DIR_LABEL[dir]}`);
    const img = new Image(); img.alt = ''; img.src = sprites.render().toDataURL('image/png');
    if (state.style.pixel) img.style.imageRendering = 'pixelated';
    const s = document.createElement('span'); s.textContent = DIR_LABEL[dir];
    b.append(img, s);
    b.onclick = () => { state.dir = dir; refresh(); };
    box.append(b);
  }
  drawPreview(true);
}, 250);

// ---------------------------------------------------------------- export
let urls = [];
async function make() {
  if (!stage.model || state.busy) return;
  state.busy = true;
  $('makeBtn').disabled = true;
  $('progress').hidden = false;
  const setP = (p, text) => { $('progressBar').style.width = `${Math.round(p * 100)}%`; $('progressText').textContent = text; };
  setP(0, 'Starting');
  try {
    const g = geometry();
    const r = rows();
    const travel = {};
    for (const c of selectedClips()) travel[c.name] = state.travel.get(c) ?? 0;
    const result = await makeSprites({
      stage, sprites, rows: r, onProgress: setP,
      cfg: { cell: g.cell, anchor: g.anchor, tileW: g.tileW, fps: state.fps, loopSafe: state.loopSafe, inPlace: state.inPlace, maxWidth: state.maxWidth, model: state.modelName, pixel: state.style.pixel, pixelScale: state.style.pixelScale, levels: state.style.levels, wantZip: state.wantZip, travel },
    });
    state.result = result;
    showResult(result);
  } catch (error) {
    console.error(error);
    toast('Could not make the sprites', error.message, 'error');
  } finally {
    state.busy = false;
    $('progress').hidden = true;
    refresh();
  }
}

function showResult(res) {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  const url = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const png = url(res.sheetBlob);
  $('sheetImg').src = png;
  $('sheetImg').parentElement.classList.toggle('pixelated', state.style.pixel);
  $('sheetDims').textContent = `${res.layout.width} × ${res.layout.height} · ${res.atlas.meta.cell.w} px cells`;
  const set = (id, href, name, label) => { const a = $(id); a.href = href; a.download = name; a.firstChild.textContent = label ?? name; };
  set('dlPng', png, res.base + '.png');
  set('dlJson', url(new Blob([res.json], { type: 'application/json' })), res.base + '.json');
  $('dlZip').hidden = !res.zipBlob;
  if (res.zipBlob) { set('dlZip', url(res.zipBlob), slug(state.modelName) + '-frames.zip'); $('zipCount').textContent = `${res.total} PNGs`; }
  const anims = Object.keys(res.atlas.animations);
  $('resultLine').textContent = `${state.loaded.source.fileName} → ${res.total} frames, ${state.dirCount} direction${state.dirCount === 1 ? '' : 's'}, ${anims.join(' and ')}, all on the same base point.`;
  $('checks').textContent = '';
  for (const c of res.checks) {
    const d = document.createElement('div'); d.className = 'check';
    const b = document.createElement('span'); b.className = 'badge ' + c.level; b.textContent = c.level;
    const t = document.createElement('span'); t.textContent = c.text;
    d.append(b, t); $('checks').append(d);
  }
  const [name, frame] = Object.entries(res.atlas.frames)[Math.min(3, res.total - 1)];
  const inner = Object.entries(frame).map(([k, v]) => `  "${k}": ${JSON.stringify(v).replace(/([:,])/g, '$1 ').replace(/^\{/, '{ ').replace(/\}$/, ' }')}`);
  $('jsonSample').textContent = `"${name}": {\n${inner.join(',\n')}\n}`;
  $('setupView').hidden = true; $('resultView').hidden = false;
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- events
$('tilePreset').append(...TILE_PRESETS.map((p) => new Option(p.label, p.id)));
$('fileInput').accept = ACCEPT;
$('browseBtn').onclick = () => $('fileInput').click();
$('drop').onclick = () => $('fileInput').click();
$('drop').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fileInput').click(); } };
$('fileInput').onchange = (e) => { openFiles([...e.target.files]); e.target.value = ''; };
$('sampleBtn').onclick = loadSample;
for (const t of [$('drop'), $('viewport')]) {
  t.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').classList.add('over'); });
  t.addEventListener('dragleave', () => $('drop').classList.remove('over'));
  t.addEventListener('drop', (e) => { e.preventDefault(); $('drop').classList.remove('over'); openFiles([...e.dataTransfer.files]); });
}
$('units').onchange = (e) => { state.units = e.target.value; if (state.units === 'height' && stage.model) $('heightM').value = state.heightM = +(stage.rawHeight * unitScaleFor('auto')).toFixed(2) || 1.75; applyUnits(); };
function unitScaleFor(u) { const keep = state.units; state.units = u; const s = unitScale(); state.units = keep; return s; }
$('heightM').oninput = (e) => { const v = parseFloat(e.target.value); if (v > 0) { state.heightM = v; applyUnits(); } };
$('facing').onchange = (e) => { state.facing = Number(e.target.value); applyUnits(); };
function applyUnits() { stage.setUnits(unitScale(), state.facing); state.baseManual = false; remeasure(); refresh(); }

$('tilePreset').onchange = (e) => { state.tile = e.target.value; state.baseManual = false; refresh(); };
$('cellMode').onchange = (e) => { state.cellMode = e.target.value; state.baseManual = false; refresh(); };
const setBase = (x, y) => { const g = geometry(); state.base = { x: Math.round(x), y: Math.round(y) }; state.baseManual = true; void g; refresh(); };
$('baseX').onchange = () => setBase(+$('baseX').value, +$('baseY').value);
$('baseY').onchange = () => setBase(+$('baseX').value, +$('baseY').value);
document.querySelectorAll('[data-nudge]').forEach((b) => b.addEventListener('click', () => {
  const [dx, dy] = b.dataset.nudge.split(',').map(Number);
  const g = geometry(); const k = pixelK();
  setBase(g.anchor.x + dx * k, g.anchor.y + dy * k);
}));
$('baseAuto').onclick = () => { state.baseManual = false; refresh(); };

$('dirCount').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { state.dirCount = Number(v); refresh(); } };
$('compass').onclick = (e) => { const d = e.target.closest('button')?.dataset.dir; if (d) { state.dir = d; refresh(); } };
$('fpsSeg').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { state.fps = Number(v); state.frame = 0; refresh(); } };
$('loopSafe').onchange = (e) => { state.loopSafe = e.target.checked; state.frame = 0; refresh(); };
$('inPlace').onchange = (e) => { state.inPlace = e.target.checked; remeasure(); refresh(); };
$('previewClip').onchange = (e) => { state.previewClip = state.clips[Number(e.target.value)] ?? null; state.frame = 0; refresh(); };
$('playBtn').onclick = () => { state.playing = !state.playing; syncPlay(); };

$('styleSeg').onclick = (e) => {
  const v = e.target.closest('button')?.dataset.v; if (!v) return;
  state.stylePreset = v; state.style = { ...STYLE_PRESETS[v] }; state.baseManual = false; refresh();
};
const custom = () => { state.stylePreset = null; };
$('outline').oninput = (e) => { state.style.outline = Number(e.target.value); custom(); refresh(); };
$('shadow').onchange = (e) => { state.style.shadow = e.target.checked; custom(); refresh(); };
$('lightSeg').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { state.style.lighting = v; custom(); refresh(); } };
$('pixel').onchange = (e) => { state.style.pixel = e.target.checked; custom(); refresh(); };
$('pixelScale').onchange = (e) => { state.style.pixelScale = Number(e.target.value); custom(); refresh(); };
$('levels').onchange = (e) => { state.style.levels = Number(e.target.value); custom(); refresh(); };

$('maxWidth').onchange = (e) => { state.maxWidth = Number(e.target.value); refresh(); };
$('wantZip').onchange = (e) => { state.wantZip = e.target.checked; };
$('pattern').oninput = (e) => { state.pattern = e.target.value || '{model}_{anim}_{dir}_{frame}'; refresh(); };
$('makeBtn').onclick = make;
$('backBtn').onclick = () => { $('resultView').hidden = true; $('setupView').hidden = false; state.result = null; refresh(); };
for (const id of ['showRefs', 'showCell', 'showSprite']) $(id).onchange = () => drawPreview(true);
$('zoomIn').onclick = () => { state.zoom = Math.min(4, (state.zoom ?? 1) * 1.25); drawPreview(true); };
$('zoomOut').onclick = () => { state.zoom = Math.max(0.4, (state.zoom ?? 1) / 1.25); drawPreview(true); };

// Tell the AssetBench wrapper how tall the page is.
if (window.parent !== window) {
  new ResizeObserver(() => window.parent.postMessage({ type: 'assetbench:height', height: Math.ceil(document.body.getBoundingClientRect().height) + 2 }, '*')).observe(document.body);
}

refresh();
requestAnimationFrame(loop);

// Read-only hooks for automated tests.
window.__modelToIsoSprites = {
  state, stage, geometry, rows, loadSample, make,
  openFiles,
  get result() { return state.result; },
};
