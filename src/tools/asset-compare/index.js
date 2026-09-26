import stylesUrl from './asset-compare.css?url';
import { AssetComparePage } from './AssetComparePage.js';
import { collectAssets, analyseAsset } from '../../shared/glb/analyseGLB.js';
import { Viewer } from '../../shared/viewer/Viewer.js';
import { loadModel } from '../../shared/viewer/loadModel.js';
import { disposeModel } from '../../shared/viewer/disposeModel.js';
import { navigate } from '../../app/router.js';
import { downloadBlob } from '../../shared/utils/download.js';
import { compareAnalyses, toJson, toMarkdown } from './compare/diff.js';
import { renderResults } from './compare/render.js';
import { fmtBytes, fmtCount } from './compare/format.js';

/**
 * Asset Compare — two models (A "before", B "after") analysed with the
 * shared engine, previewed in two synced viewers (side by side or a
 * reveal slider), and diffed: verdict, metrics, bytes, budgets, health
 * checks and per-item details, with JSON / Markdown / image export.
 */

const KEYS = ['a', 'b'];

let el = {};
let slots = {};
let viewers = {};
let layout = 'side';
let viewMode = 'shaded';
let activeTab = 'textures';
let leader = null;
let result = null;
let disposed = false;
let statusTimer = null;
const cleanups = [];

export function mount(container) {
  disposed = false;
  slots = { a: emptySlot(), b: emptySlot() };
  layout = 'side';
  viewMode = 'shaded';
  activeTab = 'textures';
  leader = null;
  result = null;

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = stylesUrl;
  document.head.appendChild(styleLink);

  container.innerHTML = '';
  container.appendChild(AssetComparePage());
  cacheElements();

  viewers = { a: new Viewer(el.view.a), b: new Viewer(el.view.b) };
  wireCameraSync();
  wireEvents();
  renderAll();

  return () => {
    disposed = true;
    clearTimeout(statusTimer);
    cleanups.splice(0).forEach((fn) => fn());
    KEYS.forEach((k) => viewers[k]?.dispose());
    viewers = {};
    styleLink.remove();
  };
}

function emptySlot() {
  return { asset: null, analysis: null, loading: false, error: null, previewError: null, token: 0, hasModel: false };
}

function cacheElements() {
  const id = (name) => document.getElementById(`ac-${name}`);
  el = {
    bothDrop: id('both-drop'), bothFile: id('file-both'), swap: id('swap'), stage: id('stage'), divider: id('divider'),
    sync: id('sync'), grid: id('grid'), reset: id('reset'), snap: id('snap'), status: id('status'), results: id('results'),
    view: { a: id('view-a'), b: id('view-b') },
    slot: Object.fromEntries(KEYS.map((k) => [k, {
      root: id(`slot-${k}`), meta: id(`slot-${k}-meta`), grade: id(`slot-${k}-grade`), clear: id(`slot-${k}-clear`),
      error: id(`slot-${k}-error`), drop: id(`drop-${k}`), dropLabel: id(`drop-${k}-label`), file: id(`file-${k}`),
      viewName: id(`view-${k}-name`), empty: id(`view-${k}-empty`), busy: id(`view-${k}-busy`),
    }])),
  };
}

// ---------------------------------------------------------------- loading

async function loadSlot(key, asset) {
  const slot = slots[key];
  const token = ++slot.token;
  Object.assign(slot, { asset, analysis: null, loading: true, error: null, previewError: null });
  renderAll();

  const [analysis, preview] = await Promise.all([
    analyseAsset(asset).catch((err) => ({ error: err })),
    loadModel(asset).catch((err) => ({ error: err })),
  ]);

  if (disposed || token !== slot.token) {
    if (preview?.scene) disposeModel(preview.scene);
    return;
  }
  slot.loading = false;
  if (analysis.error) {
    console.error('[AssetCompare]', analysis.error);
    slot.error = analysis.error.message || 'That file couldn’t be read.';
    slot.analysis = null;
  } else {
    slot.analysis = analysis;
  }
  if (preview.error) {
    console.error('[AssetCompare] preview', preview.error);
    slot.previewError = preview.error.message;
    viewers[key].clear();
    slot.hasModel = false;
  } else {
    viewers[key].setModel(preview.scene, preview.animations, preview.meshObjects);
    viewers[key].setViewMode(viewMode);
    viewers[key].setGridVisible(el.grid.checked);
    slot.hasModel = true;
  }
  frameBoth();
  renderAll();
}

async function reloadPreview(key) {
  const slot = slots[key];
  const token = ++slot.token;
  if (!slot.asset) {
    viewers[key].clear();
    slot.hasModel = false;
    return;
  }
  try {
    const preview = await loadModel(slot.asset);
    if (disposed || token !== slot.token) {
      disposeModel(preview.scene);
      return;
    }
    viewers[key].setModel(preview.scene, preview.animations, preview.meshObjects);
    viewers[key].setViewMode(viewMode);
    viewers[key].setGridVisible(el.grid.checked);
    slot.hasModel = true;
    slot.previewError = null;
  } catch (err) {
    slot.previewError = err.message;
    viewers[key].clear();
    slot.hasModel = false;
  }
}

async function handleFiles(files, target) {
  if (!files.length) return;
  let assets;
  try {
    assets = await collectAssets([...files]);
  } catch (err) {
    showStatus(`Couldn’t read those files: ${err.message}`, 'error');
    return;
  }
  if (!assets.length) {
    showStatus('No .glb or .gltf model found in those files.', 'error');
    return;
  }
  if (target === 'both') {
    if (assets.length >= 2) {
      loadSlot('a', assets[0]);
      loadSlot('b', assets[1]);
      if (assets.length > 2) showStatus(`Using the first two models (${assets.length} found).`);
    } else {
      const key = !slots.a.asset ? 'a' : 'b';
      loadSlot(key, assets[0]);
    }
    return;
  }
  loadSlot(target, assets[0]);
  if (assets.length > 1) {
    const other = target === 'a' ? 'b' : 'a';
    if (!slots[other].asset) loadSlot(other, assets[1]);
    else showStatus(`Loaded ${assets[0].name} into ${target.toUpperCase()}; the other ${assets.length - 1} file(s) were ignored.`);
  }
}

async function swap() {
  if (slots.a.loading || slots.b.loading) return;
  const { a, b } = slots;
  slots = { a: { ...b, token: a.token }, b: { ...a, token: b.token } };
  renderAll();
  await Promise.all([reloadPreview('a'), reloadPreview('b')]);
  if (disposed) return;
  frameBoth();
  renderAll();
  showStatus('Swapped A and B.');
}

function clearSlot(key) {
  const slot = slots[key];
  slot.token++;
  Object.assign(slot, { asset: null, analysis: null, loading: false, error: null, previewError: null, hasModel: false });
  viewers[key].clear();
  renderAll();
}

// ---------------------------------------------------------------- cameras

/**
 * Whoever the user is currently driving ('start' on its controls) is the
 * leader, and only the leader's changes propagate. The follower's own
 * 'change' events (fired when its controls notice the copied pose) are
 * ignored, so there's no feedback loop.
 */
function wireCameraSync() {
  for (const key of KEYS) {
    const other = key === 'a' ? 'b' : 'a';
    const onStart = () => {
      leader = key;
    };
    viewers[key].controls.addEventListener('start', onStart);
    const off = viewers[key].onCameraChange(() => {
      if (!syncing() || leader !== key) return;
      viewers[key].copyCameraTo(viewers[other]);
    });
    cleanups.push(() => {
      viewers[key]?.controls.removeEventListener('start', onStart);
      off();
    });
  }
}

function syncing() {
  return layout === 'slider' || el.sync.checked;
}

/** Frames the larger model and mirrors that camera, so relative scale stays visible. */
function frameBoth() {
  const ready = KEYS.filter((k) => slots[k].hasModel);
  ready.forEach((k) => viewers[k].resetCamera());
  if (ready.length < 2 || !syncing()) return;
  const radius = (k) => {
    const s = slots[k].analysis?.bounds?.size;
    return s ? Math.hypot(...s) : 0;
  };
  const from = radius('a') >= radius('b') ? 'a' : 'b';
  viewers[from].copyCameraTo(viewers[from === 'a' ? 'b' : 'a']);
  leader = from;
}

// ---------------------------------------------------------------- layout

function setLayout(next) {
  layout = next;
  el.stage.classList.toggle('is-side', next === 'side');
  el.stage.classList.toggle('is-slider', next === 'slider');
  document.querySelectorAll('.ac-seg-btn[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === next)));
  el.sync.disabled = next === 'slider';
  // The two canvases now share one frame: line the cameras up.
  if (next === 'slider' && slots.a.hasModel && slots.b.hasModel) {
    const from = leader || 'a';
    viewers[from].copyCameraTo(viewers[from === 'a' ? 'b' : 'a']);
  }
}

function setSplit(pct) {
  const value = Math.max(0, Math.min(100, pct));
  el.stage.style.setProperty('--ac-split', value.toFixed(2));
  el.divider.setAttribute('aria-valuenow', String(Math.round(value)));
}

function wireDivider() {
  let dragging = false;
  const move = (e) => {
    if (!dragging) return;
    const rect = el.stage.getBoundingClientRect();
    setSplit(((e.clientX - rect.left) / rect.width) * 100);
  };
  el.divider.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.divider.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  el.divider.addEventListener('pointermove', move);
  const stop = (e) => {
    dragging = false;
    if (el.divider.hasPointerCapture?.(e.pointerId)) el.divider.releasePointerCapture(e.pointerId);
  };
  el.divider.addEventListener('pointerup', stop);
  el.divider.addEventListener('pointercancel', stop);
  el.divider.addEventListener('keydown', (e) => {
    const current = Number(el.divider.getAttribute('aria-valuenow'));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setSplit(current + (e.key === 'ArrowLeft' ? -5 : 5));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setSplit(e.key === 'Home' ? 0 : 100);
    }
  });
}

// ---------------------------------------------------------------- render

function renderAll() {
  for (const key of KEYS) renderSlot(key);
  const both = slots.a.analysis && slots.b.analysis;
  el.swap.disabled = !(slots.a.asset || slots.b.asset) || slots.a.loading || slots.b.loading;
  el.snap.disabled = !(slots.a.hasModel && slots.b.hasModel);
  el.bothDrop.hidden = Boolean(slots.a.asset && slots.b.asset);

  if (both) {
    result = compareAnalyses(slots.a.analysis, slots.b.analysis);
    el.results.innerHTML = renderResults(result, slots.a.analysis, slots.b.analysis, activeTab);
  } else {
    result = null;
    const loading = slots.a.loading || slots.b.loading;
    const missing = KEYS.filter((k) => !slots[k].asset).map((k) => k.toUpperCase());
    el.results.innerHTML = `<p class="ac-hint">${loading ? 'Analysing…' : missing.length === 2 ? 'Add two versions of a model to compare them. Works with .glb, .gltf (with its .bin and textures) and .zip.' : `Add model ${missing.join(' and ')} to see the comparison.`}</p>`;
  }
}

function renderSlot(key) {
  const slot = slots[key];
  const ui = el.slot[key];
  const a = slot.analysis;
  ui.root.classList.toggle('is-filled', Boolean(slot.asset));
  ui.root.classList.toggle('is-loading', slot.loading);
  ui.meta.textContent = slot.asset
    ? a
      ? `${slot.asset.name} · ${fmtBytes(a.file.bytes)} · ${fmtCount(a.totals.triangles)} tris`
      : `${slot.asset.name}${slot.loading ? ' · analysing…' : ''}`
    : 'No model yet';
  ui.meta.title = slot.asset?.name || '';
  ui.grade.hidden = !a;
  if (a) {
    ui.grade.textContent = `${a.health.grade} · ${a.health.score}`;
    ui.grade.className = `ac-grade ac-grade--${a.health.grade.toLowerCase()}`;
    ui.grade.title = a.health.summary;
  }
  ui.clear.hidden = !slot.asset || slot.loading;
  ui.dropLabel.textContent = slot.asset ? `Replace model ${key.toUpperCase()}` : `Add model ${key.toUpperCase()}`;
  // When the file itself is unreadable the loader's parse error is just noise.
  const errors = slot.error ? [slot.error] : [slot.previewError && `Preview unavailable: ${slot.previewError}`].filter(Boolean);
  ui.error.hidden = !errors.length;
  ui.error.textContent = errors.join(' ');
  ui.viewName.textContent = slot.asset ? slot.asset.name : key === 'a' ? 'Before' : 'After';
  ui.empty.hidden = slot.hasModel || slot.loading;
  ui.busy.hidden = !slot.loading;
}

function showStatus(message, kind = 'info') {
  clearTimeout(statusTimer);
  el.status.hidden = false;
  el.status.className = `ac-status ac-status--${kind}`;
  el.status.textContent = message;
  statusTimer = setTimeout(() => {
    el.status.hidden = true;
  }, 5000);
}

// ---------------------------------------------------------------- export

async function copyMarkdown() {
  const text = toMarkdown(result, slots.a.analysis, slots.b.analysis);
  try {
    await navigator.clipboard.writeText(text);
    showStatus('Summary copied as Markdown.', 'ok');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    showStatus(ok ? 'Summary copied as Markdown.' : 'Couldn’t access the clipboard.', ok ? 'ok' : 'error');
  }
}

function downloadJson() {
  const blob = new Blob([toJson(result, slots.a.analysis, slots.b.analysis)], { type: 'application/json' });
  downloadBlob(blob, `compare_${baseName(slots.a.asset.name)}_vs_${baseName(slots.b.asset.name)}.json`);
  showStatus('Comparison JSON downloaded.', 'ok');
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 40) || 'model';
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function saveImage() {
  if (!slots.a.hasModel || !slots.b.hasModel) return;
  const w = 900;
  const h = 675;
  const bar = 64;
  const [imgA, imgB] = await Promise.all([loadImage(viewers.a.capture(w, h)), loadImage(viewers.b.capture(w, h))]);
  const canvas = document.createElement('canvas');
  canvas.width = w * 2 + 12;
  canvas.height = h + bar;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0b0b0b';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const panel = (img, x, letter, slot) => {
    g.fillStyle = '#131313';
    g.fillRect(x, bar, w, h);
    g.drawImage(img, x, bar, w, h);
    const a = slot.analysis;
    g.fillStyle = letter === 'A' ? '#8a8a8a' : '#ffb547';
    g.font = '700 26px Inter, system-ui, sans-serif';
    g.fillText(letter, x + 18, 40);
    g.fillStyle = '#f4f1ea';
    g.font = '600 18px Inter, system-ui, sans-serif';
    g.fillText(truncate(slot.asset.name, 48), x + 52, 30);
    g.fillStyle = '#a8a49b';
    g.font = '400 15px Inter, system-ui, sans-serif';
    if (a) g.fillText(`${fmtBytes(a.file.bytes)} · ${fmtCount(a.totals.triangles)} triangles · health ${a.health.grade} ${a.health.score}`, x + 52, 52);
  };
  panel(imgA, 0, 'A', slots.a);
  panel(imgB, w + 12, 'B', slots.b);
  g.fillStyle = '#6f6c65';
  g.font = '400 13px Inter, system-ui, sans-serif';
  g.fillText('Asset Bench · Asset Compare', canvas.width - 190, canvas.height - 12);
  canvas.toBlob((blob) => {
    if (!blob) return showStatus('Couldn’t create the image.', 'error');
    downloadBlob(blob, `compare_${baseName(slots.a.asset.name)}_vs_${baseName(slots.b.asset.name)}.png`);
    showStatus('Side-by-side image saved.', 'ok');
  }, 'image/png');
}

function truncate(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ---------------------------------------------------------------- events

function wireDrop(zone, input, target) {
  const open = () => input.click();
  zone.addEventListener('click', open);
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('change', () => {
    handleFiles([...input.files], target);
    input.value = '';
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-dragging');
  });
  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('is-dragging');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('is-dragging');
    handleFiles([...e.dataTransfer.files], target);
  });
}

function wireEvents() {
  wireDrop(el.bothDrop, el.bothFile, 'both');
  for (const key of KEYS) {
    wireDrop(el.slot[key].drop, el.slot[key].file, key);
    // Dropping straight onto a viewport also works.
    wireDrop(el.view[key], el.slot[key].file, key);
    el.slot[key].clear.addEventListener('click', () => clearSlot(key));
  }
  // Clicking a viewport shouldn't open the picker once a model is in it.
  for (const key of KEYS) {
    el.view[key].addEventListener('click', (e) => {
      if (slots[key].hasModel || slots[key].loading) e.stopImmediatePropagation();
    }, true);
  }
  el.swap.addEventListener('click', swap);
  document.querySelectorAll('.ac-seg-btn[data-layout]').forEach((b) => b.addEventListener('click', () => setLayout(b.dataset.layout)));
  document.querySelectorAll('.ac-seg-btn[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      viewMode = b.dataset.mode;
      document.querySelectorAll('.ac-seg-btn[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      KEYS.forEach((k) => viewers[k].setViewMode(viewMode));
    }),
  );
  el.grid.addEventListener('change', () => KEYS.forEach((k) => viewers[k].setGridVisible(el.grid.checked)));
  el.sync.addEventListener('change', () => {
    if (el.sync.checked && slots.a.hasModel && slots.b.hasModel) {
      const from = leader || 'a';
      viewers[from].copyCameraTo(viewers[from === 'a' ? 'b' : 'a']);
    }
  });
  el.reset.addEventListener('click', frameBoth);
  el.snap.addEventListener('click', saveImage);
  wireDivider();

  el.results.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      activeTab = tab.dataset.tab;
      renderAll();
      el.results.querySelector(`[data-tab="${activeTab}"]`)?.focus();
      return;
    }
    const fix = e.target.closest('[data-route]');
    if (fix) {
      navigate(fix.dataset.route);
      return;
    }
    const exp = e.target.closest('[data-export]');
    if (!exp || !result) return;
    if (exp.dataset.export === 'json') downloadJson();
    else if (exp.dataset.export === 'markdown') copyMarkdown();
    else saveImage();
  });
}
