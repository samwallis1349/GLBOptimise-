import stylesUrl from './asset-pipeline.css?url';
import { pageMarkup } from './markup.js';
import { openModal } from '../../shared/components/Modal.js';
import { downloadBlob } from '../../shared/utils/download.js';
import { BUILTIN_PROFILES, applyEngine, applyMode, compose, normaliseSettings, parseProfileFile, profileFile } from './engine/settings.js';
import { checkStageOrder } from './engine/stages.js';
import { availableFormats } from './engine/codecs.js';
import { gatherAssets, fileEntry } from './engine/sources.js';
import { inspectAsset } from './engine/inspect.js';
import { planAsset } from './engine/plan.js';
import { processAsset, CancelledError } from './engine/pipeline.js';
import { runBatch, jobKey } from './engine/queue.js';
import { buildZip } from './engine/packaging.js';
import { evaluateBatch } from './engine/budgets.js';
import { createEncodeCache } from './engine/textures.js';
import { getPipelineIO, getBrowserCodecs } from './ui/browserEnv.js';
import { Preview, createThumbnailer } from './ui/preview.js';
import { renderSettingsPanel, syncSettingsPanel, bindSettingsPanel } from './ui/settingsPanel.js';
import { filterItems, sortItems, renderTable, updateRow } from './ui/library.js';
import { renderStats, renderPlan, renderChecks, renderMaterials, renderFiles, renderLog, estimateTextures } from './ui/details.js';
import { entriesFromDrop } from './ui/drop.js';
import { bytes, esc, int } from './ui/format.js';

/**
 * Asset Pipeline — batch GLB/glTF processing.
 *
 * The page is a thin controller over the DOM-free engine in ./engine: it
 * gathers files, keeps the library, runs processAsset() through a bounded
 * queue, and renders results. All processing happens in this tab.
 */

const STORE_PROFILES = 'assetbench.pipeline.profiles';
const STORE_CURRENT = 'assetbench.pipeline.current';
const AUTO_THUMBS = 80;

let state = null;
let el = {};

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked or full: settings simply won't persist */
    }
  },
};

export async function mount(container) {
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = stylesUrl;
  document.head.appendChild(styleLink);

  container.innerHTML = pageMarkup();
  const root = container.querySelector('.ap-page');
  const q = (sel) => root.querySelector(sel);
  el = {
    root,
    shell: q('.ap-shell'),
    table: q('[data-table]'),
    empty: q('[data-empty]'),
    drop: q('[data-drop]'),
    search: q('[data-search]'),
    filter: q('[data-filter]'),
    selectAll: q('[data-select-all]'),
    selCount: q('[data-sel-count]'),
    ignored: q('[data-ignored]'),
    settings: q('[data-settings]'),
    profile: q('[data-profile]'),
    concurrency: q('[data-concurrency]'),
    viewport: q('[data-viewport]'),
    viewEmpty: q('[data-view-empty]'),
    viewBusy: q('[data-view-busy]'),
    lod: q('[data-lod]'),
    clip: q('[data-clip]'),
    viewmode: q('[data-viewmode]'),
    infoBody: q('[data-info-body]'),
    batch: q('[data-batch]'),
    batchText: q('[data-batch-text]'),
    batchBar: q('[data-batch-bar]'),
    eta: q('[data-eta]'),
    status: q('[data-status]'),
    count: q('[data-count]'),
    inputs: Object.fromEntries([...root.querySelectorAll('[data-input]')].map((i) => [i.dataset.input, i])),
    btn: (action) => q(`[data-action="${action}"]`),
  };

  const saved = store.get(STORE_CURRENT, null);
  state = {
    items: [],
    nextId: 1,
    keys: new Set(),
    sort: { key: 'name', dir: 'asc' },
    query: '',
    filter: 'all',
    expanded: false,
    activeId: null,
    infoTab: 'stats',
    settings: normaliseSettings(saved?.settings || compose('threejs', 'balanced')),
    profileId: saved?.profileId || 'builtin:none',
    profiles: store.get(STORE_PROFILES, []),
    lastRunSettings: null,
    run: null,
    io: null,
    codecs: null,
    formats: { keep: true, png: true, jpeg: true, webp: false, ktx2: false },
    encodeCache: createEncodeCache(),
    preview: null,
    thumbnailer: createThumbnailer(192),
    materials: [],
    previewToken: 0,
    inspectQueue: Promise.resolve(),
    disposed: false,
  };

  wireStatic();
  setStatus('Loading processing engine…');
  try {
    const [io, codecs] = await Promise.all([getPipelineIO(), getBrowserCodecs()]);
    if (!state || state.disposed) return () => {};
    state.io = io;
    state.codecs = codecs;
    state.formats = availableFormats(codecs);
    setStatus('');
  } catch (err) {
    setStatus(`The processing engine could not load: ${err?.message || err}`, 'error');
  }

  renderSettingsPanel(el.settings, { formats: state.formats });
  bindSettingsPanel(el.settings, () => state.settings, {
    onChange: (kind) => settingsChanged(kind),
    onEngine: (engine) => {
      applyEngine(state.settings, engine);
      state.settings = normaliseSettings(state.settings);
      settingsChanged('structure');
    },
    onMode: (mode) => {
      applyMode(state.settings, mode);
      state.settings = normaliseSettings(state.settings);
      settingsChanged('structure');
    },
  });
  syncSettingsPanel(el.settings, state.settings);
  renderProfiles();
  try {
    state.preview = new Preview(el.viewport);
  } catch (err) {
    el.viewEmpty.textContent = `3D preview unavailable (WebGL could not start: ${err?.message || err}). Processing still works.`;
  }
  render();

  return () => {
    if (!state) return;
    state.disposed = true;
    state.run?.controller.abort();
    if (state.run) resumeRun();
    state.preview?.dispose();
    state.thumbnailer.dispose();
    for (const item of state.items) if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    styleLink.remove();
    state = null;
  };
}

// ---------------------------------------------------------------- events

function wireStatic() {
  const { root } = el;

  // Mobile panel tabs.
  root.querySelector('.ap-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) showTab(b.dataset.tab);
  });

  // Adding files.
  el.btn('pick-files').addEventListener('click', (e) => {
    e.stopPropagation();
    el.inputs.files.click();
  });
  el.btn('pick-folder').addEventListener('click', (e) => {
    e.stopPropagation();
    el.inputs.folder.click();
  });
  el.btn('add').addEventListener('click', () => el.inputs.files.click());
  el.drop.addEventListener('click', () => el.inputs.files.click());
  el.drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.inputs.files.click();
    }
  });
  for (const key of ['files', 'folder']) {
    el.inputs[key].addEventListener('change', () => {
      const entries = [...el.inputs[key].files].map(fileEntry);
      el.inputs[key].value = '';
      addEntries(entries);
    });
  }
  const panel = root.querySelector('[data-panel="library"]');
  panel.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.drop.classList.add('is-dragging');
  });
  panel.addEventListener('dragleave', (e) => {
    if (!panel.contains(e.relatedTarget)) el.drop.classList.remove('is-dragging');
  });
  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.drop.classList.remove('is-dragging');
    addEntries(await entriesFromDrop(e.dataTransfer));
  });

  // Library.
  el.search.addEventListener('input', () => {
    state.query = el.search.value;
    render();
  });
  el.filter.addEventListener('change', () => {
    state.filter = el.filter.value;
    render();
  });
  el.selectAll.addEventListener('change', () => {
    for (const item of visibleItems()) item.selected = el.selectAll.checked;
    render();
  });
  el.table.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const key = sortBtn.dataset.sort;
      state.sort = { key, dir: state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc' };
      return render();
    }
    const open = e.target.closest('[data-open]');
    if (open) return setActive(Number(open.dataset.open), { showPreview: true });
  });
  el.table.addEventListener('change', (e) => {
    const box = e.target.closest('[data-select]');
    if (!box) return;
    const item = byId(Number(box.dataset.select));
    if (item) item.selected = box.checked;
    render();
  });
  el.btn('expand').addEventListener('click', () => {
    state.expanded = !state.expanded;
    el.shell.classList.toggle('is-expanded', state.expanded);
    el.btn('expand').setAttribute('aria-pressed', String(state.expanded));
    render();
  });
  el.btn('remove').addEventListener('click', removeSelected);
  el.btn('replace').addEventListener('click', () => el.inputs.replace.click());
  el.inputs.replace.addEventListener('change', () => {
    const file = el.inputs.replace.files[0];
    el.inputs.replace.value = '';
    if (file) replaceActive(file);
  });
  el.btn('retry').addEventListener('click', () => {
    const failed = state.items.filter((i) => ['failed', 'cancelled'].includes(i.status) && i.inspection?.ok);
    processBatch(failed);
  });

  // Preview controls.
  root.querySelector('.ap-view-tools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-compare]');
    if (b && state.preview) {
      state.preview.setCompare(b.dataset.compare);
      for (const x of root.querySelectorAll('[data-compare]')) x.setAttribute('aria-pressed', String(x === b));
    }
  });
  el.viewmode.addEventListener('change', () => state.preview?.setMode(el.viewmode.value));
  el.btn('reset-cam').addEventListener('click', () => state.preview?.resetCamera());
  el.lod.addEventListener('change', () => loadPreview(activeItem(), { keepCamera: true }));
  el.clip.addEventListener('change', () => state.preview?.playClip(Number(el.clip.value)));

  // Detail tabs.
  root.querySelector('.ap-info-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-info]');
    if (!b) return;
    state.infoTab = b.dataset.info;
    renderInfo();
  });
  el.infoBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-download-output]');
    if (!b) return;
    const out = activeItem()?.result?.outputs[Number(b.dataset.downloadOutput)];
    if (out) downloadBlob(out.bytes, out.path.split('/').pop());
  });

  // Batch.
  el.btn('process').addEventListener('click', () => processBatch());
  el.btn('pause').addEventListener('click', () => {
    if (!state.run) return;
    if (state.run.paused) resumeRun();
    else {
      state.run.paused = true;
      el.btn('pause').textContent = 'Resume';
      setStatus('Paused: running assets stop at their next stage.');
    }
  });
  el.btn('cancel').addEventListener('click', () => {
    if (!state.run) return;
    state.run.controller.abort();
    resumeRun();
    setStatus('Cancelling…');
  });
  el.btn('download').addEventListener('click', downloadAll);
  el.btn('preview-plan').addEventListener('click', previewPipeline);

  // Profiles.
  el.profile.addEventListener('change', () => selectProfile(el.profile.value));
  el.btn('profile-save').addEventListener('click', saveProfile);
  el.btn('profile-rename').addEventListener('click', renameProfile);
  el.btn('profile-duplicate').addEventListener('click', duplicateProfile);
  el.btn('profile-delete').addEventListener('click', deleteProfile);
  el.btn('profile-export').addEventListener('click', exportProfile);
  el.btn('profile-import').addEventListener('click', () => el.inputs.profile.click());
  el.inputs.profile.addEventListener('change', importProfile);
}

function showTab(tab) {
  el.shell.dataset.activeTab = tab;
  for (const b of el.root.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
}

// ---------------------------------------------------------------- library

const byId = (id) => state.items.find((i) => i.id === id);
const activeItem = () => (state ? byId(state.activeId) : null);
const visibleItems = () => sortItems(filterItems(state.items, { query: state.query, filter: state.filter }), state.sort);

async function addEntries(entries) {
  if (!entries.length || !state) return;
  setStatus('Reading files…');
  const { assets, ignored } = await gatherAssets(entries);
  const dupes = [];
  const added = [];
  for (const asset of assets) {
    const key = jobKey(asset);
    if (state.keys.has(key)) {
      dupes.push(asset.path);
      continue;
    }
    state.keys.add(key);
    const item = { id: state.nextId++, key, asset, name: asset.name, dir: asset.dir, sourceBytes: asset.sourceBytes, status: 'queued', inspection: null, result: null, selected: false, thumbUrl: null, missing: [] };
    state.items.push(item);
    added.push(item);
  }
  const notes = [...ignored.map((i) => `${i.path}: ${i.reason}`), ...dupes.map((p) => `${p}: already in the library`)];
  el.ignored.hidden = !notes.length;
  el.ignored.innerHTML = notes.length ? `<details><summary>${notes.length} file(s) skipped</summary><ul>${notes.slice(0, 200).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '';
  setStatus(added.length ? `Added ${added.length} asset(s). Inspecting…` : 'No new GLB / glTF assets found.');
  render();
  if (added.length && state.activeId == null) setActive(added[0].id);
  const thumbs = state.items.length <= AUTO_THUMBS;
  // Inspect two at a time; the queue is chained so later drops wait their turn.
  state.inspectQueue = state.inspectQueue.then(() => runBatch(added, (item) => inspectItem(item, thumbs), { concurrency: 2 }));
  await state.inspectQueue;
  if (!state) return;
  const ready = state.items.filter((i) => i.status === 'ready').length;
  setStatus(`${ready} asset(s) ready.`);
  render();
}

async function inspectItem(item, withThumb) {
  if (!state || !state.io || !byId(item.id)) return;
  item.status = 'inspecting';
  refreshRow(item);
  try {
    const { bytes: data, missing } = await item.asset.load(state.io);
    item.missing = missing;
    item.inspection = await inspectAsset(data, { io: state.io, missing, sourceFormat: item.asset.sourceFormat });
    item.status = item.inspection.ok ? 'ready' : 'invalid';
    // A .gltf's size is its JSON plus resources: use the packed size so savings compare like with like.
    if (item.asset.sourceFormat === 'gltf' && item.inspection.fileBytes) item.sourceBytes = item.inspection.fileBytes;
    item.error = item.inspection.ok ? null : item.inspection.error || item.inspection.issues.find((i) => i.severity === 'error')?.message;
    if (withThumb && item.inspection.ok && state) {
      try {
        const png = await state.thumbnailer.render(data);
        if (state && byId(item.id)) item.thumbUrl = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
      } catch {
        /* thumbnail is optional */
      }
    }
  } catch (err) {
    item.status = 'invalid';
    item.error = err?.message || String(err);
    item.inspection = { ok: false, error: item.error, issues: [{ severity: 'error', code: 'load', message: item.error }] };
  }
  if (!state) return;
  render();
  if (item.id === state.activeId) {
    renderInfo();
    loadPreview(item);
  }
}

function removeSelected() {
  const doomed = state.items.filter((i) => i.selected && i.status !== 'processing' && i.status !== 'queued');
  if (!doomed.length) return;
  for (const item of doomed) {
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    state.keys.delete(item.key);
  }
  state.items = state.items.filter((i) => !doomed.includes(i));
  if (!byId(state.activeId)) setActive(state.items[0]?.id ?? null);
  setStatus(`Removed ${doomed.length} asset(s).`);
  render();
}

async function replaceActive(file) {
  const item = activeItem();
  if (!item || item.status === 'processing' || item.status === 'queued') return;
  const { assets } = await gatherAssets([{ ...fileEntry(file), path: `${item.dir}${file.name}` }]);
  if (!assets[0]) return setStatus('Replacement must be a .glb or self-contained .gltf.', 'error');
  state.keys.delete(item.key);
  item.asset = assets[0];
  item.name = assets[0].name;
  item.sourceBytes = assets[0].sourceBytes;
  item.key = jobKey(assets[0]);
  state.keys.add(item.key);
  item.result = null;
  if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  item.thumbUrl = null;
  setStatus(`Replaced with ${file.name}. Re-inspecting…`);
  await inspectItem(item, true);
}

function render() {
  if (!state) return;
  const rows = visibleItems();
  renderTable(el.table, rows, { sort: state.sort, activeId: state.activeId, expanded: state.expanded });
  el.empty.hidden = state.items.length > 0;
  el.drop.classList.toggle('is-compact', state.items.length > 0);
  const selected = state.items.filter((i) => i.selected);
  el.selCount.textContent = selected.length ? `${selected.length} selected` : `${state.items.length} asset(s)`;
  el.selectAll.checked = rows.length > 0 && rows.every((i) => i.selected);
  el.count.textContent = state.items.length;
  const busy = Boolean(state.run);
  el.btn('remove').disabled = busy || !selected.length;
  el.btn('replace').disabled = busy || !activeItem();
  const retryable = state.items.filter((i) => ['failed', 'cancelled'].includes(i.status) && i.inspection?.ok).length;
  el.btn('retry').hidden = !retryable || busy;
  el.btn('retry').textContent = `Retry failed (${retryable})`;
  el.btn('process').disabled = busy || !state.io || !state.items.some((i) => i.inspection?.ok);
  el.btn('process').textContent = selected.length ? `Process ${selected.length} selected` : 'Process Batch';
  el.btn('download').disabled = busy || !state.items.some((i) => i.result?.outputs?.length);
}

function refreshRow(item) {
  if (!updateRow(el.table, item, { expanded: state.expanded })) render();
}

// ---------------------------------------------------------------- active asset / preview

function setActive(id, { showPreview = false } = {}) {
  state.activeId = id;
  for (const tr of el.table.querySelectorAll('tr[data-id]')) tr.classList.toggle('is-active', Number(tr.dataset.id) === id);
  if (showPreview && window.matchMedia('(max-width: 980px)').matches) showTab('preview');
  const item = activeItem();
  el.btn('replace').disabled = !item || Boolean(state.run);
  renderLodOptions(item);
  renderInfo();
  loadPreview(item);
}

function renderLodOptions(item) {
  const lods = (item?.result?.outputs || []).filter((o) => o.kind === 'lod' && !o.heldBack);
  el.lod.hidden = lods.length < 2;
  el.lod.innerHTML = lods.map((o) => `<option value="${o.level}">LOD${o.level}</option>`).join('');
}

async function loadPreview(item, { keepCamera = false } = {}) {
  if (!state?.preview) return;
  const token = ++state.previewToken;
  el.viewEmpty.hidden = Boolean(item);
  if (!item || !item.inspection?.ok) {
    if (item) el.viewEmpty.hidden = false;
    el.viewEmpty.textContent = item ? (item.status === 'inspecting' || item.status === 'queued' ? 'Inspecting…' : 'This asset cannot be previewed.') : 'Select an asset to preview it.';
    await state.preview.show({ original: null, output: null });
    return;
  }
  el.viewBusy.hidden = false;
  try {
    const { bytes: original } = await item.asset.load(state.io);
    let output = null;
    const outs = (item.result?.outputs || []).filter((o) => !o.heldBack && !o.separate);
    const level = Number(el.lod.value || 0);
    const pick = outs.find((o) => o.kind === 'lod' && o.level === level) || outs.find((o) => o.kind === 'main') || outs.find((o) => o.kind === 'lod');
    if (pick) output = new Uint8Array(await pick.bytes.arrayBuffer());
    else if (item.result?.previewGlb) output = new Uint8Array(await item.result.previewGlb.arrayBuffer());
    if (token !== state.previewToken) return;
    const { animations, materials } = await state.preview.show({ original, output });
    if (token !== state.previewToken) return;
    if (!keepCamera) state.preview.resetCamera();
    state.materials = materials;
    el.clip.hidden = !animations.length;
    el.clip.innerHTML = animations.length ? `<option value="-1">No animation</option>${animations.map((a, i) => `<option value="${i}">${esc(a.name || `Clip ${i + 1}`)}</option>`).join('')}` : '';
    if (state.infoTab === 'materials') renderInfo();
  } catch (err) {
    el.viewEmpty.hidden = false;
    el.viewEmpty.textContent = `Preview failed: ${err?.message || err}`;
  } finally {
    if (state && token === state.previewToken) el.viewBusy.hidden = true;
  }
}

function renderInfo() {
  if (!state) return;
  for (const b of el.root.querySelectorAll('[data-info]')) b.setAttribute('aria-selected', String(b.dataset.info === state.infoTab));
  const item = activeItem();
  if (!item) {
    el.infoBody.innerHTML = '<p class="ap-muted">No asset selected.</p>';
    return;
  }
  const head = `<p class="ap-info-title"><b>${esc(item.dir)}${esc(item.name)}</b> <span class="ap-badge is-${item.status}">${esc(item.status)}</span></p>`;
  let body = '';
  switch (state.infoTab) {
    case 'plan':
      body = renderPlan(item.inspection?.ok ? planAsset(item.inspection, state.settings) : null);
      break;
    case 'checks':
      body = renderChecks(item);
      break;
    case 'materials':
      body = renderMaterials(state.materials, item);
      break;
    case 'files':
      body = renderFiles(item);
      break;
    case 'log':
      body = renderLog(item);
      break;
    default:
      body = renderStats(item, state.settings);
  }
  el.infoBody.innerHTML = head + body;
}

// ---------------------------------------------------------------- settings & profiles

let persistTimer = null;
function settingsChanged(kind) {
  syncSettingsPanel(el.settings, state.settings, { structure: kind === 'structure' });
  updateEstimate();
  if (state.infoTab === 'plan' || state.infoTab === 'stats') renderInfo();
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => store.set(STORE_CURRENT, { profileId: state.profileId, settings: state.settings }), 300);
}

function updateEstimate() {
  const host = el.settings.querySelector('[data-estimate]');
  if (!host) return;
  const inspected = state.items.filter((i) => i.inspection?.ok);
  let before = 0;
  let after = 0;
  for (const item of inspected) {
    const e = estimateTextures(item.inspection, state.settings);
    if (e) {
      before += e.before;
      after += e.after;
    }
  }
  host.innerHTML = before ? `Estimated GPU texture memory for ${inspected.length} asset(s): <b>${bytes(before)} → ~${bytes(after)}</b>. <small>Estimate (RGBA8 + mips, ~1 byte/px for KTX2). File-size savings are measured separately after processing.</small>` : '';
}

function allProfiles() {
  return [...BUILTIN_PROFILES.map((p) => ({ id: `builtin:${p.id}`, name: p.name, builtin: true, build: p.build })), ...state.profiles.map((p) => ({ ...p, id: `user:${p.id}` }))];
}

function renderProfiles() {
  const list = allProfiles();
  el.profile.innerHTML = `<option value="builtin:none">Unsaved settings</option><optgroup label="Built-in">${list.filter((p) => p.builtin).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>${state.profiles.length ? `<optgroup label="Your profiles">${list.filter((p) => !p.builtin).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>` : ''}`;
  el.profile.value = list.some((p) => p.id === state.profileId) ? state.profileId : 'builtin:none';
  const user = state.profileId.startsWith('user:');
  el.btn('profile-rename').disabled = !user;
  el.btn('profile-delete').disabled = !user;
  el.btn('profile-duplicate').disabled = state.profileId === 'builtin:none';
}

function selectProfile(id) {
  const p = allProfiles().find((x) => x.id === id);
  state.profileId = id;
  if (p) state.settings = normaliseSettings(p.builtin ? p.build() : p.settings);
  renderProfiles();
  settingsChanged('structure');
  setStatus(p ? `Profile “${p.name}” loaded.` : '');
}

const persistProfiles = () => store.set(STORE_PROFILES, state.profiles);

async function saveProfile() {
  const current = state.profileId.startsWith('user:') ? state.profiles.find((p) => `user:${p.id}` === state.profileId) : null;
  if (current) {
    current.settings = normaliseSettings(state.settings);
    persistProfiles();
    return setStatus(`Saved “${current.name}”.`);
  }
  const name = await promptName('Save profile', 'My studio profile');
  if (!name) return;
  const profile = { id: Date.now().toString(36), name, settings: normaliseSettings(state.settings) };
  state.profiles.push(profile);
  persistProfiles();
  state.profileId = `user:${profile.id}`;
  renderProfiles();
  settingsChanged('value');
  setStatus(`Saved “${name}”. It will be here next time you open the tool on this device.`);
}

async function renameProfile() {
  const p = state.profiles.find((x) => `user:${x.id}` === state.profileId);
  if (!p) return;
  const name = await promptName('Rename profile', p.name);
  if (!name) return;
  p.name = name;
  persistProfiles();
  renderProfiles();
}

async function duplicateProfile() {
  const src = allProfiles().find((x) => x.id === state.profileId);
  if (!src) return;
  const name = await promptName('Duplicate profile', `${src.name} copy`);
  if (!name) return;
  const profile = { id: Date.now().toString(36), name, settings: normaliseSettings(state.settings) };
  state.profiles.push(profile);
  persistProfiles();
  state.profileId = `user:${profile.id}`;
  renderProfiles();
}

async function deleteProfile() {
  const p = state.profiles.find((x) => `user:${x.id}` === state.profileId);
  if (!p) return;
  if (!(await confirmModal('Delete profile', `<p>Delete “${esc(p.name)}”? The current settings stay loaded.</p>`, 'Delete'))) return;
  state.profiles = state.profiles.filter((x) => x !== p);
  persistProfiles();
  state.profileId = 'builtin:none';
  renderProfiles();
}

function exportProfile() {
  const p = allProfiles().find((x) => x.id === state.profileId);
  const name = p?.name || 'Pipeline profile';
  const blob = new Blob([JSON.stringify(profileFile(name, state.settings), null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${name.replace(/[^\w-]+/g, '_')}.assetbench-profile.json`);
}

async function importProfile() {
  const file = el.inputs.profile.files[0];
  el.inputs.profile.value = '';
  if (!file) return;
  try {
    const { name, settings } = parseProfileFile(await file.text());
    const profile = { id: Date.now().toString(36), name, settings };
    state.profiles.push(profile);
    persistProfiles();
    selectProfile(`user:${profile.id}`);
  } catch (err) {
    setStatus(`Import failed: ${err?.message || err}`, 'error');
  }
}

function promptName(title, value) {
  return new Promise((resolve) => {
    const content = document.createElement('div');
    content.innerHTML = `<label class="ap-field"><span>Name</span><input type="text" maxlength="60" value="${esc(value)}"></label>`;
    const input = content.querySelector('input');
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    const ok = button('Save', 'primary', () => finish(input.value.trim().slice(0, 60) || null));
    const cancel = button('Cancel', '', () => finish(null));
    input.addEventListener('keydown', (e) => e.key === 'Enter' && ok.click());
    const close = openModal({ title, content, actions: [cancel, ok], className: 'ap-modal' });
    setTimeout(() => input.select(), 0);
  });
}

function confirmModal(title, html, okLabel = 'Continue') {
  return new Promise((resolve) => {
    const content = document.createElement('div');
    content.innerHTML = html;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    const close = openModal({ title, content, actions: [button('Cancel', '', () => finish(false)), button(okLabel, 'primary', () => finish(true))], className: 'ap-modal' });
    // Escape / backdrop close the modal without a choice: treat as cancel.
    const obs = new MutationObserver(() => {
      if (!content.isConnected) {
        obs.disconnect();
        finish(false);
      }
    });
    obs.observe(document.body, { childList: true });
  });
}

function button(label, kind, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${kind === 'primary' ? 'btn--primary' : 'btn--secondary'}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// ---------------------------------------------------------------- processing

function previewPipeline() {
  const item = activeItem()?.inspection?.ok ? activeItem() : state.items.find((i) => i.inspection?.ok);
  if (!item) return setStatus('Add and inspect an asset first.');
  if (item.id !== state.activeId) setActive(item.id);
  state.infoTab = 'plan';
  renderInfo();
  showTab('preview');
  const flagged = state.items.filter((i) => i.inspection?.ok && planAsset(i.inspection, state.settings).confirm.length).length;
  setStatus(flagged ? `${flagged} asset(s) have settings that need confirmation before processing.` : 'Plan shown for the active asset.');
}

async function processBatch(explicit) {
  if (!state || state.run || !state.io) return;
  const order = checkStageOrder(state.settings.stages);
  if (order.errors.length) {
    showTab('settings');
    return setStatus(order.errors[0], 'error');
  }
  const selected = state.items.filter((i) => i.selected && i.inspection?.ok);
  const targets = (explicit || (selected.length ? selected : state.items.filter((i) => i.status === 'ready'))).filter((i) => i.inspection?.ok && i.status !== 'processing' && i.status !== 'queued');
  if (!targets.length) return setStatus(state.items.some((i) => i.result) ? 'Everything is processed. Select assets to process them again.' : 'Nothing ready to process.');

  // Destructive settings are never applied silently: one confirmation listing every affected asset.
  const confirms = new Map();
  for (const item of targets) {
    for (const c of planAsset(item.inspection, state.settings).confirm) {
      if (!confirms.has(c.code)) confirms.set(c.code, { message: c.message, assets: [] });
      confirms.get(c.code).assets.push(item.name);
    }
  }
  if (confirms.size) {
    const html = `<p>These settings can change how your assets look or behave:</p><ul class="ap-confirm-list">${[...confirms.values()].map((c) => `<li>${esc(c.message)} <small>${c.assets.length} asset(s)${c.assets.length <= 4 ? `: ${esc(c.assets.join(', '))}` : ''}</small></li>`).join('')}</ul><p class="ap-note">Source files are never modified. You can compare every result in the preview.</p>`;
    if (!(await confirmModal('Confirm pipeline settings', html, `Process ${targets.length} asset(s)`))) return;
  }

  const settings = normaliseSettings(structuredClone(state.settings));
  state.lastRunSettings = settings;
  const concurrency = Number(el.concurrency.value) || 2;
  const run = { controller: new AbortController(), paused: false, waiters: [], total: targets.length, done: 0, started: performance.now(), durations: [], concurrency };
  state.run = run;
  for (const item of targets) {
    item.status = 'queued';
    item.progress = null;
  }
  el.batch.hidden = false;
  el.btn('pause').textContent = 'Pause';
  render();
  updateBatch();

  const env = {
    io: state.io,
    codecs: state.codecs,
    encodeCache: state.encodeCache,
    signal: run.controller.signal,
    waitIfPaused: () => (run.paused ? new Promise((resolve) => run.waiters.push(resolve)) : null),
    renderThumbnail: settings.export.thumbnails ? (b) => state.thumbnailer.render(b) : null,
  };

  await runBatch(
    targets,
    async (item) => {
      if (!state || state.disposed) return;
      const t0 = performance.now();
      item.status = 'processing';
      item.progress = { index: 0, total: 1, label: 'Loading' };
      refreshRow(item);
      try {
        const { bytes: data, missing } = await item.asset.load(state.io);
        const result = await processAsset(
          { name: item.name, dir: item.dir, bytes: data, missing, sourceFormat: item.asset.sourceFormat, inspection: item.inspection },
          settings,
          {
            ...env,
            onProgress: (id, p) => {
              item.progress = p;
              refreshRow(item);
            },
          }
        );
        // Keep outputs as Blobs: compressed, off the JS heap where the browser allows.
        for (const o of result.outputs) o.bytes = new Blob([o.bytes], { type: o.path.endsWith('.png') ? 'image/png' : 'application/octet-stream' });
        if (result.previewGlb) result.previewGlb = new Blob([result.previewGlb]);
        item.result = result;
        item.status = result.status;
        item.error = result.error;
      } catch (err) {
        if (err instanceof CancelledError || run.controller.signal.aborted) {
          item.status = 'cancelled';
        } else {
          item.status = 'failed';
          item.error = err?.message || String(err);
          item.result = { status: 'failed', error: item.error, outputs: [], log: [{ level: 'error', message: item.error, stage: null }], name: item.name, dir: item.dir, inspection: item.inspection };
        }
      }
      run.done += 1;
      run.durations.push(performance.now() - t0);
      if (!state) return;
      item.progress = null;
      refreshRow(item);
      updateBatch();
      if (item.id === state.activeId) {
        renderLodOptions(item);
        renderInfo();
        loadPreview(item, { keepCamera: true });
      }
    },
    { concurrency, signal: run.controller.signal }
  );

  if (!state) return;
  for (const item of targets) if (item.status === 'queued') item.status = 'cancelled';
  state.run = null;
  el.batch.hidden = true;
  const done = targets.filter((i) => i.status === 'done').length;
  const review = targets.filter((i) => i.status === 'review').length;
  const failed = targets.filter((i) => i.status === 'failed').length;
  const cancelled = targets.filter((i) => i.status === 'cancelled').length;
  const batch = evaluateBatch(state.items.map((i) => i.result).filter((r) => r?.after), settings.budgets.batch);
  const over = batch.checks.filter((c) => c.status === 'fail').map((c) => `${c.label} ${c.unit === 'MB' ? `${c.value.toFixed(1)} MB` : int(c.value)} exceeds ${c.limit}${c.unit ? ` ${c.unit}` : ''}`);
  setStatus(`${done} done${review ? `, ${review} for review` : ''}${failed ? `, ${failed} failed` : ''}${cancelled ? `, ${cancelled} cancelled` : ''}.${over.length ? ` Batch budget: ${over.join('; ')}.` : ''}`, failed || over.length ? 'warn' : '');
  render();
  renderInfo();
}

function resumeRun() {
  if (!state?.run) return;
  state.run.paused = false;
  el.btn('pause').textContent = 'Pause';
  state.run.waiters.splice(0).forEach((r) => r());
}

function updateBatch() {
  const run = state?.run;
  if (!run) return;
  const pct = Math.round((run.done / run.total) * 100);
  el.batchBar.style.width = `${pct}%`;
  const active = state.items.filter((i) => i.status === 'processing').map((i) => `${i.name}${i.progress?.label ? ` (${i.progress.label})` : ''}`);
  el.batchText.textContent = `${run.done} / ${run.total} processed${active.length ? ` · ${active.slice(0, 2).join(', ')}` : ''}`;
  if (run.durations.length) {
    const avg = run.durations.reduce((a, b) => a + b, 0) / run.durations.length;
    const remaining = Math.max(0, ((run.total - run.done) * avg) / run.concurrency);
    el.eta.textContent = run.done < run.total ? `~${remaining >= 60000 ? `${Math.round(remaining / 60000)} min` : `${Math.max(1, Math.round(remaining / 1000))} s`} left` : '';
  } else el.eta.textContent = 'Estimating time…';
}

async function downloadAll() {
  const results = state.items.map((i) => i.result).filter((r) => r?.outputs);
  if (!results.length) return;
  setStatus('Building ZIP…');
  el.btn('download').disabled = true;
  try {
    const { data, files } = await buildZip(results, state.lastRunSettings || state.settings, { onProgress: (p) => setStatus(`Building ZIP… ${Math.round(p * 100)}%`) });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    downloadBlob(new Blob([data], { type: 'application/zip' }), `assetbench_pipeline_${stamp}.zip`);
    setStatus(`ZIP ready: ${files.length} file(s), ${bytes(data.byteLength)}.`);
  } catch (err) {
    setStatus(`ZIP failed: ${err?.message || err}`, 'error');
  } finally {
    if (state) el.btn('download').disabled = false;
  }
}

function setStatus(text, kind = '') {
  if (!el.status) return;
  el.status.textContent = text;
  el.status.dataset.kind = kind;
}
