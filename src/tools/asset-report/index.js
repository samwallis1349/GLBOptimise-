import stylesUrl from './asset-report.css?url';
import { AssetReportPage } from './AssetReportPage.js';
import { ASSET_REPORT_CONFIG } from './config.js';
import { collectAssets, analyseAsset } from '../../shared/glb/analyseGLB.js';
import { Viewer } from '../../shared/viewer/Viewer.js';
import { loadModel } from '../../shared/viewer/loadModel.js';
import { navigate } from '../../app/router.js';
import { downloadBlob } from '../../shared/utils/download.js';
import { filesFromDrop } from './processing/gatherFiles.js';
import { filterItems, sortItems, summarise } from './processing/library.js';
import { toCsv, toJson, toMarkdown } from './processing/exporters.js';
import { renderDetail, renderPrint, renderSummary, renderTable } from './ui/render.js';
import { escapeHtml } from './ui/format.js';

/**
 * Asset Report — batch audit of a GLB/glTF library. Assets are analysed one
 * at a time (yielding to the UI between files) with the shared analysis
 * engine; a single offscreen Viewer renders thumbnails.
 */

let el = {};
let state = null;

function freshState() {
  return {
    items: [],
    nextId: 1,
    target: ASSET_REPORT_CONFIG.defaultTarget,
    sort: { key: 'score', dir: 'asc' },
    filters: { query: '', grades: new Set(), budget: false, errors: false, failed: false },
    selectedId: null,
    run: null,
    thumbsTouched: false,
    viewer: null,
    viewerHost: null,
  };
}

export function mount(container) {
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = stylesUrl;
  document.head.appendChild(styleLink);

  state = freshState();
  container.innerHTML = '';
  container.appendChild(AssetReportPage());
  cacheElements();
  wireEvents();

  return () => {
    if (state.run) state.run.cancelled = true;
    state.viewer?.dispose();
    state.viewerHost?.remove();
    finishPrint();
    window.removeEventListener('afterprint', finishPrint);
    styleLink.remove();
    state = null;
  };
}

function cacheElements() {
  const id = (name) => document.getElementById(`ar-${name}`);
  el = {
    page: document.querySelector('.ar-page'),
    drop: id('drop'), pickFiles: id('pick-files'), pickFolder: id('pick-folder'), file: id('file'), folder: id('folder'),
    target: id('target'), thumbs: id('thumbs'), thumbsNote: id('thumbs-note'), clear: id('clear'),
    progress: id('progress'), progressText: id('progress-text'), progressFill: id('progress-fill'), cancel: id('cancel'),
    notice: id('notice'), results: id('results'), summary: id('summary'), summarySub: id('summary-sub'),
    tableSub: id('table-sub'), search: id('search'), table: id('table'), detail: id('detail'), print: id('print'),
    exportCsv: id('export-csv'), exportJson: id('export-json'), copy: id('copy'), printBtn: id('print-btn'),
  };
}

// ---------------------------------------------------------------- input

async function addFiles(fileList) {
  if (state.run) {
    showNotice('A batch is still being analysed — wait for it to finish or cancel it first.');
    return;
  }
  const files = [...fileList];
  if (!files.length) return;
  hideNotice();

  let assets;
  try {
    assets = await collectAssets(files);
  } catch (err) {
    showNotice(`Couldn’t read the dropped files: ${err.message}`);
    return;
  }
  if (!state) return;
  if (!assets.length) {
    showNotice('No .glb or .gltf files found in that selection.');
    return;
  }

  const known = new Set(state.items.map((i) => `${i.name}|${i.size}`));
  const fresh = assets.filter((a) => !known.has(`${a.name}|${a.main.size}`));
  const skipped = assets.length - fresh.length;
  const room = ASSET_REPORT_CONFIG.maxAssets - state.items.length;
  const batch = fresh.slice(0, Math.max(0, room));
  const notes = [];
  if (skipped) notes.push(`${skipped} already in the library were skipped`);
  if (fresh.length > batch.length) notes.push(`only the first ${batch.length} were added (limit ${ASSET_REPORT_CONFIG.maxAssets} assets)`);
  if (!batch.length) {
    showNotice(notes.length ? `Nothing new to add — ${notes.join('; ')}.` : 'Nothing new to add.');
    return;
  }

  if (!state.thumbsTouched) {
    el.thumbs.checked = batch.length <= ASSET_REPORT_CONFIG.autoThumbnailLimit;
    el.thumbsNote.textContent = el.thumbs.checked
      ? `On for batches up to ${ASSET_REPORT_CONFIG.autoThumbnailLimit} assets`
      : `Off for this batch of ${batch.length} to keep it fast — tick to include`;
  }
  if (notes.length) showNotice(`Adding ${batch.length} asset${batch.length === 1 ? '' : 's'} — ${notes.join('; ')}.`);
  await runBatch(batch);
}

async function runBatch(assets) {
  const run = { cancelled: false };
  state.run = run;
  el.progress.hidden = false;
  el.clear.disabled = true;
  setInputsBusy(true);
  const withThumbs = el.thumbs.checked;

  for (let i = 0; i < assets.length; i++) {
    if (run.cancelled || !state) break;
    const asset = assets[i];
    el.progressText.textContent = `Analysing ${i + 1} / ${assets.length} — ${asset.name}`;
    el.progressFill.style.width = `${(i / assets.length) * 100}%`;
    await yieldToUi();

    const item = { id: state.nextId++, name: asset.name, size: asset.main.size, status: 'ok', thumb: null };
    try {
      const analysis = await analyseAsset(asset);
      delete analysis.rawJson; // large and not needed for reporting
      item.analysis = analysis;
    } catch (err) {
      console.warn('[AssetReport] could not analyse', asset.name, err);
      item.status = 'error';
      item.error = err?.message || 'Unknown error';
    }
    if (!state || run.cancelled) break;
    if (item.status === 'ok' && withThumbs) item.thumb = await makeThumbnail(asset);
    if (!state) break;
    state.items.push(item);
    renderAll();
  }

  if (!state) return;
  const done = !run.cancelled;
  state.run = null;
  el.progressFill.style.width = '100%';
  el.progress.hidden = true;
  el.clear.disabled = !state.items.length;
  setInputsBusy(false);
  if (!done) showNotice('Batch cancelled — assets analysed so far are kept.');
  renderAll();
}

async function makeThumbnail(asset) {
  try {
    if (!state.viewer) {
      const host = document.createElement('div');
      host.className = 'ar-thumb-host';
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${ASSET_REPORT_CONFIG.thumbnail.width}px;height:${ASSET_REPORT_CONFIG.thumbnail.height}px;pointer-events:none;`;
      host.setAttribute('aria-hidden', 'true');
      document.body.appendChild(host);
      state.viewerHost = host;
      state.viewer = new Viewer(host, { grid: false });
    }
    const { scene, meshObjects } = await loadModel(asset);
    if (!state?.viewer) return null;
    state.viewer.setModel(scene, [], meshObjects);
    const { width, height } = ASSET_REPORT_CONFIG.thumbnail;
    const url = state.viewer.capture(width, height);
    state.viewer.clear();
    return url;
  } catch (err) {
    console.warn('[AssetReport] thumbnail failed', asset.name, err);
    return null;
  }
}

function yieldToUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setInputsBusy(busy) {
  el.pickFiles.disabled = busy;
  el.pickFolder.disabled = busy;
  el.drop.classList.toggle('is-busy', busy);
}

// --------------------------------------------------------------- render

function visibleItems() {
  return sortItems(filterItems(state.items, state.filters, state.target), state.sort, state.target);
}

function renderAll() {
  if (!state) return;
  const has = state.items.length > 0;
  el.results.hidden = !has;
  el.clear.disabled = !has || Boolean(state.run);
  if (!has) {
    el.detail.hidden = true;
    return;
  }
  const summary = summarise(state.items, state.target);
  el.summary.innerHTML = renderSummary(summary, state.target);
  el.summarySub.textContent = `${summary.okCount} analysed${summary.failed ? ` · ${summary.failed} unreadable` : ''}`;
  const visible = visibleItems();
  el.table.innerHTML = renderTable(visible, state.sort, state.target, state.selectedId);
  el.tableSub.textContent = visible.length === state.items.length ? 'Click a row for the full report' : `Showing ${visible.length} of ${state.items.length} · click a row for the full report`;
  renderDetailPanel();
}

function renderDetailPanel() {
  const item = state.items.find((i) => i.id === state.selectedId);
  if (!item) {
    el.detail.hidden = true;
    el.detail.innerHTML = '';
    return;
  }
  let list = visibleItems();
  if (!list.includes(item)) list = sortItems(state.items, state.sort, state.target);
  el.detail.innerHTML = renderDetail(item, { index: list.indexOf(item), count: list.length });
  el.detail.hidden = false;
}

function select(id, scroll = true) {
  state.selectedId = id;
  el.table.querySelectorAll('.ar-row').forEach((row) => row.classList.toggle('is-selected', Number(row.dataset.id) === id));
  renderDetailPanel();
  if (scroll) el.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function step(delta) {
  let list = visibleItems();
  const current = state.items.find((i) => i.id === state.selectedId);
  if (!list.includes(current)) list = sortItems(state.items, state.sort, state.target);
  const next = list[list.indexOf(current) + delta];
  if (next) select(next.id, false);
}

// -------------------------------------------------------------- exports

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function exportCsv() {
  const items = sortItems(state.items, { key: 'name', dir: 'asc' }, state.target);
  downloadBlob(new Blob([toCsv(items)], { type: 'text/csv;charset=utf-8' }), `asset-report-${stamp()}.csv`);
}

function exportJson() {
  const items = sortItems(state.items, { key: 'name', dir: 'asc' }, state.target);
  downloadBlob(new Blob([toJson(items, state.target)], { type: 'application/json' }), `asset-report-${stamp()}.json`);
}

async function copySummary() {
  const text = toMarkdown(sortItems(state.items, { key: 'name', dir: 'asc' }, state.target), state.target);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  showNotice('Summary copied to the clipboard as Markdown.');
}

function printReport() {
  const items = sortItems(state.items, { key: 'name', dir: 'asc' }, state.target);
  el.print.innerHTML = renderPrint(items, summarise(state.items, state.target), state.target);
  document.body.classList.add('ar-printing');
  window.addEventListener('afterprint', finishPrint, { once: true });
  window.print();
}

function finishPrint() {
  document.body.classList.remove('ar-printing');
  if (el.print) el.print.innerHTML = '';
}

// --------------------------------------------------------------- events

function wireEvents() {
  el.pickFiles.addEventListener('click', (e) => {
    e.stopPropagation();
    el.file.click();
  });
  el.pickFolder.addEventListener('click', (e) => {
    e.stopPropagation();
    el.folder.click();
  });
  el.drop.addEventListener('click', () => {
    if (!state.run) el.file.click();
  });
  el.drop.addEventListener('keydown', (e) => {
    if (e.target === el.drop && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      el.file.click();
    }
  });
  for (const input of [el.file, el.folder]) {
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.value = '';
      addFiles(files);
    });
  }
  el.drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.drop.classList.add('is-dragging');
  });
  el.drop.addEventListener('dragleave', (e) => {
    if (!el.drop.contains(e.relatedTarget)) el.drop.classList.remove('is-dragging');
  });
  el.drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.drop.classList.remove('is-dragging');
    addFiles(await filesFromDrop(e.dataTransfer));
  });

  el.target.addEventListener('change', () => {
    state.target = el.target.value;
    renderAll();
  });
  el.thumbs.addEventListener('change', () => {
    state.thumbsTouched = true;
    el.thumbsNote.textContent = el.thumbs.checked ? 'Rendered for each new asset' : 'Skipped for new assets';
  });
  el.clear.addEventListener('click', () => {
    state.items = [];
    state.selectedId = null;
    hideNotice();
    renderAll();
  });
  el.cancel.addEventListener('click', () => {
    if (state.run) state.run.cancelled = true;
    el.progressText.textContent = 'Cancelling after the current file…';
  });

  el.search.addEventListener('input', () => {
    state.filters.query = el.search.value;
    renderAll();
  });
  el.page.querySelectorAll('.ar-chip').forEach((chip) => chip.addEventListener('click', () => {
    const on = chip.getAttribute('aria-pressed') !== 'true';
    chip.setAttribute('aria-pressed', String(on));
    if (chip.dataset.grade) {
      if (on) state.filters.grades.add(chip.dataset.grade);
      else state.filters.grades.delete(chip.dataset.grade);
    } else {
      state.filters[chip.dataset.filter] = on;
    }
    renderAll();
  }));

  el.table.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const key = sortBtn.dataset.sort;
      state.sort = state.sort.key === key ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'score' ? 'asc' : 'desc' };
      renderAll();
      return;
    }
    const row = e.target.closest('.ar-row');
    if (row) select(Number(row.dataset.id));
  });
  el.table.addEventListener('keydown', (e) => {
    const row = e.target.closest('.ar-row');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      select(Number(row.dataset.id));
    }
  });

  // Delegated: fix-tool links and "select asset" links in summary + detail.
  el.page.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      navigate(nav.dataset.nav);
      return;
    }
    const pick = e.target.closest('[data-select]');
    if (pick) select(Number(pick.dataset.select));
  });
  el.detail.addEventListener('click', (e) => {
    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) step(Number(stepBtn.dataset.step));
    if (e.target.closest('[data-close]')) {
      state.selectedId = null;
      renderAll();
    }
  });

  el.exportCsv.addEventListener('click', exportCsv);
  el.exportJson.addEventListener('click', exportJson);
  el.copy.addEventListener('click', copySummary);
  el.printBtn.addEventListener('click', printReport);
}

function showNotice(message) {
  el.notice.innerHTML = escapeHtml(message);
  el.notice.hidden = false;
}

function hideNotice() {
  el.notice.hidden = true;
}
