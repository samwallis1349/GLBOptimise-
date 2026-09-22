import variablesCssUrl from './styles/variables.css?url';
import generateLodsCssUrl from './styles/generate-lods.css?url';
import toolIdentityCssUrl from '../../shared/components/toolIdentity.css?url';

import { readGlb } from './glb/createIO.js';
import { renderToolIdentity } from '../../shared/components/ToolIdentity.js';
import { downloadArrayBuffer } from './utils/download.js';
import { formatBytes, formatNumber } from './utils/formatting.js';
import { HARD_FILE_LIMIT, MAX_LOD_LEVELS, MIN_LOD_LEVELS } from './config/limits.js';

import { generateLodsMarkup } from './markup.js';
import {
  LOD_CHAIN_PRESETS,
  DEFAULT_PRESET_ID,
  ADVANCED_DEFAULTS,
  PRESERVATION_FACTS,
  suggestedDistanceMultiplier,
} from './presets.js';
import { analyseGeometry, buildSafetyReport, computeBoundingRadius } from './LODAnalysis.js';
import { generateLODs } from './LODEngine.js';
import { validateLod } from './LODValidation.js';
import { LODViewer } from './LODViewer.js';
import { BatchExporter } from '../../shared/batch/BatchExporter.js';

const ICON = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

const ICON_REMOVE = ICON('<path d="M18 6 6 18M6 6l12 12"/>');
const ICON_DOWNLOAD = ICON('<path d="M12 3v9"/><path d="m8 8 4 4 4-4"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>');

// Every stage any level can emit, in the order it can emit them, purely to
// compute an overall progress percentage across a variable-length chain
// where some levels are simplified (5 stages) and others are simply copied
// unmodified (3 stages, see LODEngine.js).
const STAGE_ORDER = ['ANALYSING', 'PREPARING GEOMETRY', 'COPYING SOURCE', 'SIMPLIFYING', 'REBUILDING', 'EXPORTING'];

let keyCounter = 0;
const nextKey = () => `L${(keyCounter += 1)}`;

function freshState() {
  keyCounter = 0;
  return {
    file: null,
    originalBuffer: null,
    originalStats: null,
    originalDocument: null,
    boundingRadius: 0,
    levels: [],
    advanced: { ...ADVANCED_DEFAULTS },
    busy: false,
    viewer: null,
    results: null,
    globalWarnings: [],
    selectedLodId: null,
  };
}

let state = freshState();
let el = {};

/**
 * Mounts Generate LODs into `container`. Real, working processing engine —
 * the same meshoptimizer-driven per-primitive simplification Reduce Polys
 * uses, run once per configured level, each from a fresh parse of the
 * source (see LODEngine.js for why), with a two-viewport Three.js
 * comparison viewer whose second slot can be pointed at any generated
 * level.
 *
 * @param {HTMLElement} container
 * @returns {() => void} cleanup, called automatically by the router before
 *   the next navigation.
 */
export function mount(container) {
  const stylesheets = [variablesCssUrl, generateLodsCssUrl, toolIdentityCssUrl].map(injectStylesheet);

  state = freshState();
  container.innerHTML = generateLodsMarkup();

  renderToolIdentity(document.getElementById('gl-identity'), {
    mark: 'lod-stack',
    eyebrow: 'One model, every distance',
    title: 'Generate',
    accentTitle: 'LODs',
    description: 'Build a full Level-of-Detail chain from a single upload — each level simplified from the source, never from the last.',
  });

  el = {
    dropzone: byId('gl-dropzone'),
    file: byId('gl-file'),
    choose: byId('gl-choose'),
    stage: byId('gl-stage'),
    viewports: byId('gl-viewports'),
    splitHandle: byId('gl-split-handle'),
    viewportLodTag: byId('gl-viewport-lod-tag'),
    hudTitle: byId('gl-hud-title'),
    hudStats: byId('gl-hud-stats'),
    lodTabs: byId('gl-lod-tabs'),
    compareSeg: byId('gl-compare-seg'),
    grid: byId('gl-grid'),
    resetCam: byId('gl-reset-cam'),
    presets: byId('gl-presets'),
    levels: byId('gl-levels'),
    addLevel: byId('gl-add-level'),
    distancePanel: byId('gl-distance-panel'),
    distanceList: byId('gl-distance-list'),
    advToggle: byId('gl-adv-toggle'),
    advBody: byId('gl-adv-body'),
    run: byId('gl-run'),
    runLabel: byId('gl-run-label'),
    progress: byId('gl-progress'),
    progressFill: byId('gl-progress-fill'),
    progressStage: byId('gl-progress-stage'),
    progressPct: byId('gl-progress-pct'),
    modelCheck: byId('gl-model-check'),
    checkList: byId('gl-check-list'),
    results: byId('gl-results'),
    headlineNum: byId('gl-headline-num'),
    resultRows: byId('gl-result-rows'),
    warnings: byId('gl-warnings'),
    downloadAll: byId('gl-download-all'),
    restart: byId('gl-restart'),
    breakdownPanel: byId('gl-breakdown-panel'),
    breakdownToggle: byId('gl-breakdown-toggle'),
    breakdownBody: byId('gl-breakdown-body'),
    breakdownLevel: byId('gl-breakdown-level'),
    breakdownRows: byId('gl-breakdown-rows'),
    notice: byId('gl-notice'),
    noticeText: byId('gl-notice-text'),
    noticeClose: byId('gl-notice-close'),
  };

  buildAdvancedPanel();
  wireUpload();
  wireControls();
  wireViewerBar();
  selectPreset(DEFAULT_PRESET_ID);

  state.viewer = new LODViewer({
    originalHost: byId('gl-viewport-original'),
    lodHost: byId('gl-viewport-lod'),
    splitHost: byId('gl-viewports'),
  });

  return () => {
    state.viewer?.dispose();
    stylesheets.forEach((link) => link.remove());
  };
}

function injectStylesheet(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  return link;
}

const byId = (id) => document.getElementById(id);
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const escapeAttr = (value) => String(value).replace(/"/g, '&quot;');

// ---------------------------------------------------------------- upload

function wireUpload() {
  const open = (e) => {
    e?.stopPropagation();
    el.file.click();
  };
  el.dropzone.addEventListener('click', open);
  el.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  el.choose.addEventListener('click', open);
  el.file.addEventListener('change', async () => {
    const file = el.file.files?.[0];
    el.file.value = '';
    if (file) await loadFile(file);
  });

  ['dragenter', 'dragover'].forEach((type) =>
    el.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      el.dropzone.classList.add('drag-active');
    })
  );
  ['dragleave', 'dragend'].forEach((type) =>
    el.dropzone.addEventListener(type, () => el.dropzone.classList.remove('drag-active'))
  );
  el.dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.dropzone.classList.remove('drag-active');
    const file = e.dataTransfer?.files?.[0];
    if (file) await loadFile(file);
  });

  el.noticeClose.addEventListener('click', hideNotice);
}

async function loadFile(file) {
  hideNotice();
  const name = file.name.toLowerCase();
  if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
    return showNotice(`"${file.name}" is not a .glb or .gltf file.`);
  }
  if (file.size > HARD_FILE_LIMIT) {
    return showNotice(`"${file.name}" is larger than the ${Math.round(HARD_FILE_LIMIT / 1024 / 1024)}MB limit.`);
  }
  if (file.size === 0) return showNotice(`"${file.name}" is empty.`);

  try {
    const buffer = await file.arrayBuffer();
    const document_ = await readGlb(buffer);
    const stats = analyseGeometry(document_);

    if (stats.triangleCount === 0) {
      return showNotice(`"${file.name}" contains no triangle geometry, so there is nothing to generate LODs from.`);
    }

    state.file = file;
    state.originalBuffer = buffer;
    state.originalStats = stats;
    state.originalDocument = document_;
    state.boundingRadius = computeBoundingRadius(document_);
    state.results = null;
    state.selectedLodId = null;

    el.dropzone.classList.add('hidden');
    el.stage.classList.remove('hidden');
    el.compareSeg.classList.add('hidden');
    el.lodTabs.classList.add('hidden');
    el.results.classList.add('hidden');
    el.breakdownPanel.classList.add('hidden');
    el.viewports.dataset.layout = 'single';

    await state.viewer.loadOriginal(buffer);
    renderHud('ORIGINAL', stats, file.size);
    renderModelCheck(stats);
    renderLevels();
    el.run.disabled = false;
  } catch (err) {
    showNotice(explainLoadFailure(err, file.name));
    console.error('[GenerateLODs] load failed', err);
  }
}

function explainLoadFailure(err, filename) {
  const message = err?.message || 'Unknown error.';
  if (/DT_FLOAT32|draco/i.test(message)) {
    return `"${filename}" looks Draco-compressed and the decoder could not be loaded.`;
  }
  if (/meshopt/i.test(message)) return `"${filename}" looks Meshopt-compressed and the decoder could not be loaded.`;
  if (/Invalid|Unexpected|JSON|magic/i.test(message)) return `"${filename}" does not appear to be a valid GLB (${message}).`;
  return `Couldn't open "${filename}". ${message}`;
}

// -------------------------------------------------------------- controls

function wireControls() {
  el.presets.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    selectPreset(btn.dataset.preset);
  });

  // Delegated: the level list is rebuilt wholesale on add/remove/preset
  // change, but never mid-drag on 'input' (see renderLevels' comment).
  el.levels.addEventListener('input', (e) => {
    const slider = e.target.closest('[data-role="keep"]');
    if (!slider) return;
    const lvl = state.levels.find((l) => l.key === slider.dataset.key);
    if (!lvl) return;
    lvl.keep = Number(slider.value) / 100;
    const row = slider.closest('.gl-level-row');
    const value = row.querySelector('.gl-level-value');
    const note = row.querySelector('.gl-level-note');
    if (value) value.textContent = `${Math.round(lvl.keep * 100)}%`;
    if (note) {
      note.textContent = state.originalStats
        ? `~${formatNumber(Math.max(1, Math.round(state.originalStats.triangleCount * lvl.keep)))} triangles kept`
        : 'Upload a model to see an estimate';
    }
    syncPresetSelection();
    renderDistancePanel();
  });

  el.levels.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="remove"]');
    if (!btn || state.levels.length <= MIN_LOD_LEVELS) return;
    state.levels = state.levels.filter((l) => l.key !== btn.dataset.key);
    renderLevels();
  });

  el.addLevel.addEventListener('click', () => {
    if (state.levels.length >= MAX_LOD_LEVELS) return;
    const last = state.levels[state.levels.length - 1];
    const keep = Math.max(0.01, Math.round((last.keep / 2) * 100) / 100);
    state.levels.push({ key: nextKey(), keep });
    renderLevels();
  });

  el.advToggle.addEventListener('click', () => {
    const open = el.advToggle.getAttribute('aria-expanded') === 'true';
    el.advToggle.setAttribute('aria-expanded', String(!open));
    el.advBody.classList.toggle('hidden', open);
  });

  el.breakdownToggle.addEventListener('click', () => {
    const open = el.breakdownToggle.getAttribute('aria-expanded') === 'true';
    el.breakdownToggle.setAttribute('aria-expanded', String(!open));
    el.breakdownBody.classList.toggle('hidden', open);
  });

  el.breakdownLevel.addEventListener('change', () => renderBreakdown(el.breakdownLevel.value));

  el.resultRows.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-download]');
    if (!btn || !state.results) return;
    const r = state.results.find((x) => x.id === btn.dataset.download);
    if (!r) return;
    const base = state.file.name.replace(/\.(glb|gltf)$/i, '');
    downloadArrayBuffer(r.outputBuffer, `${base}_${r.label}.glb`);
  });

  el.lodTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lod]');
    if (!btn) return;
    selectLodTab(btn.dataset.lod);
  });

  el.run.addEventListener('click', runGeneration);
  el.downloadAll.addEventListener('click', downloadAllZip);
  el.restart.addEventListener('click', restart);
}

function selectPreset(id) {
  const preset = LOD_CHAIN_PRESETS[id];
  if (preset?.levels) {
    state.levels = preset.levels.map((l) => ({ key: nextKey(), keep: l.keep }));
  }
  renderLevels();
}

/** Editing any slider by hand switches the preset row to Custom. */
function syncPresetSelection() {
  const keeps = state.levels.map((l) => Math.round(l.keep * 1000));
  const match = Object.values(LOD_CHAIN_PRESETS).find((p) => {
    if (!p.levels || p.levels.length !== keeps.length) return false;
    return p.levels.every((l, i) => Math.round(l.keep * 1000) === keeps[i]);
  });
  renderPresets(match ? match.id : 'custom');
}

function renderPresets(activeId) {
  el.presets.innerHTML = Object.values(LOD_CHAIN_PRESETS)
    .map(
      (p) => `
    <button class="gl-preset${p.id === activeId ? ' selected' : ''}" data-preset="${p.id}"
            role="radio" aria-checked="${p.id === activeId}" type="button">
      <span class="gl-preset-name">${p.label}</span>
      <span class="gl-preset-blurb">${p.blurb}</span>
    </button>`
    )
    .join('');
}

/**
 * Rebuilds the level-row list wholesale. Only called on add/remove/preset
 * change — a slider's own 'input' handler updates its row's text in place
 * instead of calling this, so rebuilding the DOM mid-drag never steals
 * pointer capture from the slider the user is dragging.
 */
function renderLevels() {
  el.levels.innerHTML = state.levels
    .map((lvl, i) => {
      const label = `LOD${i}`;
      const pct = Math.round(lvl.keep * 100);
      const note = state.originalStats
        ? `~${formatNumber(Math.max(1, Math.round(state.originalStats.triangleCount * lvl.keep)))} triangles kept`
        : 'Upload a model to see an estimate';
      return `
      <div class="gl-level-row" data-key="${lvl.key}">
        <div class="gl-level-row-top">
          <span class="gl-level-name">${label}</span>
          <span class="gl-level-value">${pct}%</span>
          <button class="gl-level-remove" type="button" data-role="remove" data-key="${lvl.key}"
                  ${state.levels.length <= MIN_LOD_LEVELS ? 'disabled' : ''} aria-label="Remove ${label}">
            ${ICON_REMOVE}
          </button>
        </div>
        <input class="gl-slider" type="range" min="1" max="100" step="1" value="${pct}"
               data-role="keep" data-key="${lvl.key}" aria-label="${label}: percent of source geometry kept" />
        <span class="gl-level-note">${note}</span>
      </div>`;
    })
    .join('');
  el.addLevel.disabled = state.levels.length >= MAX_LOD_LEVELS;
  syncPresetSelection();
  renderDistancePanel();
}

function renderDistancePanel() {
  if (!state.levels.length || state.levels.length < 2) {
    el.distancePanel.hidden = true;
    return;
  }
  el.distancePanel.hidden = false;
  const radius = state.boundingRadius;
  el.distanceList.innerHTML = state.levels
    .map((lvl, i) => {
      if (i === 0) {
        return `<li class="gl-distance-row"><span>LOD0</span><strong>Always closest</strong></li>`;
      }
      const multiplier = suggestedDistanceMultiplier(lvl.keep);
      const value = radius > 0 ? `${(multiplier * radius).toFixed(2)} units` : `${multiplier}× object radius`;
      return `<li class="gl-distance-row"><span>Switch to LOD${i} beyond</span><strong>${value}</strong></li>`;
    })
    .join('');
}

function buildAdvancedPanel() {
  el.advBody.innerHTML = `
    <div>
      <div class="advanced-group-title">Simplifier settings — applied to every level</div>
      <div class="field-row">
        <span>Lock boundary vertices<small>Keeps open edges from shrinking</small></span>
        <label class="switch"><input type="checkbox" id="gl-lock-border" ${ADVANCED_DEFAULTS.lockBorder ? 'checked' : ''} /><span class="switch-track"></span></label>
      </div>
      <div class="field-row">
        <span>Simplification error<small>Max deviation, as a fraction of mesh size</small></span>
        <span class="gl-inline">
          <input class="slider" type="range" id="gl-error" min="1" max="200" step="1" value="${ADVANCED_DEFAULTS.error * 1000}" />
          <span id="gl-error-value" class="gl-mono">${ADVANCED_DEFAULTS.error.toFixed(3)}</span>
        </span>
      </div>
      <div class="field-row">
        <span>Remove unused resources<small>Prunes data left unreferenced after reduction</small></span>
        <label class="switch"><input type="checkbox" id="gl-cleanup" ${ADVANCED_DEFAULTS.cleanup ? 'checked' : ''} /><span class="switch-track"></span></label>
      </div>
    </div>
    <div>
      <div class="advanced-group-title">Preservation</div>
      <p class="gl-adv-note">
        These are not switches. They describe what the simplifier actually does in every level, so
        nothing here claims a guarantee the engine can't make.
      </p>
      <ul class="gl-fact-list">
        ${PRESERVATION_FACTS.map(
          (f) => `
          <li class="gl-fact is-${f.state}">
            <span class="gl-fact-state">${f.state === 'inherent' ? 'Always preserved' : 'Not supported'}</span>
            <span class="gl-fact-label">${f.label}</span>
            <span class="gl-fact-note">${f.note}</span>
          </li>`
        ).join('')}
      </ul>
    </div>
  `;

  byId('gl-lock-border').addEventListener('change', (e) => {
    state.advanced.lockBorder = e.target.checked;
  });
  byId('gl-cleanup').addEventListener('change', (e) => {
    state.advanced.cleanup = e.target.checked;
  });
  const errorInput = byId('gl-error');
  errorInput.addEventListener('input', () => {
    state.advanced.error = Number(errorInput.value) / 1000;
    byId('gl-error-value').textContent = state.advanced.error.toFixed(3);
  });
}

// ------------------------------------------------------------- viewer bar

function wireViewerBar() {
  document.querySelectorAll('[data-shade]').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-shade]').forEach((b) => b.classList.toggle('is-active', b === btn));
      state.viewer.setWireframeMode(btn.dataset.shade);
    })
  );

  document.querySelectorAll('[data-compare]').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-compare]').forEach((b) => b.classList.toggle('is-active', b === btn));
      setCompareLayout(btn.dataset.compare);
    })
  );

  el.grid.addEventListener('click', () => {
    const next = el.grid.getAttribute('aria-pressed') !== 'true';
    el.grid.setAttribute('aria-pressed', String(next));
    el.grid.classList.toggle('is-active', next);
    state.viewer.setGridVisible(next);
  });

  el.resetCam.addEventListener('click', () => state.viewer.resetCamera());

  // Split-compare divider.
  let dragging = false;
  const move = (e) => {
    if (!dragging) return;
    const rect = el.viewports.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    state.viewer.setSplitPosition(pct);
    el.splitHandle.style.left = `${pct}%`;
  };
  el.splitHandle.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.splitHandle.setPointerCapture(e.pointerId);
  });
  el.splitHandle.addEventListener('pointermove', move);
  el.splitHandle.addEventListener('pointerup', (e) => {
    dragging = false;
    el.splitHandle.releasePointerCapture(e.pointerId);
  });
}

function currentLodResult() {
  return state.results?.find((r) => r.id === state.selectedLodId) ?? null;
}

function setActiveCompare(mode) {
  document.querySelectorAll('[data-compare]').forEach((b) => b.classList.toggle('is-active', b.dataset.compare === mode));
}

function setCompareLayout(mode) {
  el.viewports.dataset.layout = mode;
  el.splitHandle.hidden = mode !== 'split';
  if (mode === 'split') {
    state.viewer.setSplitPosition(50);
    el.splitHandle.style.left = '50%';
  }

  const current = currentLodResult();
  if (mode === 'lod' && current) {
    renderHud(current.label, current.stats, current.outputBuffer.byteLength);
  } else if (mode === 'original' && state.originalStats) {
    renderHud('ORIGINAL', state.originalStats, state.file?.size);
  } else if (current) {
    renderHud('COMPARE', current.stats, current.outputBuffer.byteLength, state.originalStats);
  }
  window.dispatchEvent(new Event('resize'));
}

async function selectLodTab(id) {
  const result = state.results?.find((r) => r.id === id);
  if (!result) return;
  state.selectedLodId = id;
  renderLodTabs();
  await state.viewer.loadLod(result.outputBuffer);
  el.viewportLodTag.textContent = `${result.label} · ${Math.round(result.keep * 100)}%`;

  const activeCompareBtn = el.compareSeg.querySelector('.is-active');
  setCompareLayout(activeCompareBtn ? activeCompareBtn.dataset.compare : 'side');

  el.breakdownLevel.value = id;
  renderBreakdown(id);
  renderResults();
}

function renderLodTabs() {
  if (!state.results?.length) {
    el.lodTabs.classList.add('hidden');
    el.lodTabs.innerHTML = '';
    return;
  }
  el.lodTabs.classList.remove('hidden');
  el.lodTabs.innerHTML = state.results
    .map(
      (r) => `
    <button class="gl-lod-tab${r.id === state.selectedLodId ? ' is-active' : ''}" data-lod="${r.id}"
            type="button" role="tab" aria-selected="${r.id === state.selectedLodId}">
      <span class="gl-lod-tab-name">${r.label}</span>
      <span class="gl-lod-tab-sub">${formatNumber(r.stats.triangleCount)} tris</span>
    </button>`
    )
    .join('');
}

// ------------------------------------------------------------------ HUD

function renderHud(title, stats, bytes, compareWith = null) {
  el.hudTitle.textContent = String(title).toUpperCase();
  const rows = compareWith
    ? [
        ['Triangles', `${formatNumber(compareWith.triangleCount)} → ${formatNumber(stats.triangleCount)}`],
        ['Vertices', `${formatNumber(compareWith.vertexCount)} → ${formatNumber(stats.vertexCount)}`],
        ['Meshes', formatNumber(stats.meshCount)],
        ['Materials', formatNumber(stats.materialCount)],
      ]
    : [
        ['Triangles', formatNumber(stats.triangleCount)],
        ['Vertices', formatNumber(stats.vertexCount)],
        ['Meshes', formatNumber(stats.meshCount)],
        ['Materials', formatNumber(stats.materialCount)],
      ];
  if (Number.isFinite(bytes)) rows.push(['File size', formatBytes(bytes)]);
  el.hudStats.innerHTML = rows.map(([k, v]) => `<div class="gl-hud-row"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function renderModelCheck(stats) {
  const report = buildSafetyReport(stats);
  el.modelCheck.classList.remove('hidden');
  el.checkList.innerHTML = report.items
    .map(
      (item) => `<li class="gl-check is-${item.level}"><span class="gl-check-mark">${
        item.level === 'ok' ? '✓' : item.level === 'warn' ? '!' : '×'
      }</span><span>${item.text}</span></li>`
    )
    .join('');
  el.run.disabled = !report.canProceed || state.busy;
}

// --------------------------------------------------------------- generate

function setProgress(levelIndex, total, stageName, label) {
  const stageIdx = STAGE_ORDER.indexOf(stageName);
  const stageFraction = stageIdx >= 0 ? (stageIdx + 1) / STAGE_ORDER.length : 0;
  const pct = Math.min(99, Math.round(((levelIndex + stageFraction) / total) * 100));
  el.progressFill.style.width = `${pct}%`;
  el.progressPct.textContent = `${pct}%`;
  el.progressStage.textContent = `${label} — ${titleCase(stageName)} (${levelIndex + 1}/${total})`;
}

function setProgressComplete() {
  el.progressFill.style.width = '100%';
  el.progressPct.textContent = '100%';
  el.progressStage.textContent = 'Complete';
}

async function runGeneration() {
  if (state.busy || !state.originalBuffer || !state.levels.length) return;
  state.busy = true;
  el.run.disabled = true;
  el.runLabel.textContent = 'Generating…';
  el.progress.classList.remove('hidden');
  hideNotice();

  try {
    const levelConfigs = state.levels.map((lvl, i) => ({ id: lvl.key, label: `LOD${i}`, keep: lvl.keep }));

    const { results, warnings } = await generateLODs({
      originalBuffer: state.originalBuffer,
      originalStats: state.originalStats,
      levelConfigs,
      options: state.advanced,
      onProgress: setProgress,
    });

    for (const result of results) {
      result.validation = await validateLod({
        outputBuffer: result.outputBuffer,
        originalDocument: state.originalDocument,
        originalStats: state.originalStats,
        unmodified: result.unmodified,
      });
    }

    setProgressComplete();

    state.results = results;
    state.globalWarnings = warnings;
    // Default to the most aggressive level: the one most worth checking.
    state.selectedLodId = results[results.length - 1]?.id ?? null;

    renderLodTabs();
    if (state.selectedLodId) {
      const selected = results.find((r) => r.id === state.selectedLodId);
      await state.viewer.loadLod(selected.outputBuffer);
      el.viewportLodTag.textContent = `${selected.label} · ${Math.round(selected.keep * 100)}%`;
    }
    el.compareSeg.classList.remove('hidden');
    setActiveCompare('side');
    setCompareLayout('side');

    renderResults();
    renderBreakdownOptions();
    if (state.selectedLodId) renderBreakdown(state.selectedLodId);
  } catch (err) {
    console.error('[GenerateLODs] generation failed', err);
    showNotice(`LOD generation failed: ${err?.message || 'unknown error'}`);
    el.progress.classList.add('hidden');
  } finally {
    state.busy = false;
    el.run.disabled = false;
    el.runLabel.textContent = 'Generate LODs';
    setTimeout(() => el.progress.classList.add('hidden'), 1200);
  }
}

function renderResults() {
  if (!state.results) return;
  el.results.classList.remove('hidden');
  el.headlineNum.textContent = String(state.results.length);

  const before = state.originalStats.triangleCount;
  el.resultRows.innerHTML = state.results
    .map((r) => {
      const change = before ? ((before - r.stats.triangleCount) / before) * 100 : 0;
      const changeText = r.unmodified ? 'unmodified' : `${change >= 0 ? '−' : '+'}${Math.abs(change).toFixed(1)}%`;
      const cls =
        r.validation.status === 'PASS' ? 'is-pass' : r.validation.status === 'WARNING' ? 'is-warning' : 'is-fail';
      return `
      <tr class="${r.id === state.selectedLodId ? 'is-current-row' : ''}">
        <td>${r.label}</td>
        <td>${formatNumber(r.stats.triangleCount)}</td>
        <td>${changeText}</td>
        <td>${formatBytes(r.outputBuffer.byteLength)}</td>
        <td><span class="gl-status ${cls}">${r.validation.status}</span></td>
        <td><button class="gl-row-download" type="button" data-download="${r.id}">${ICON_DOWNLOAD}.glb</button></td>
      </tr>`;
    })
    .join('');

  const allWarnings = [...state.globalWarnings];
  for (const r of state.results) {
    if (r.validation.status === 'PASS') continue;
    r.validation.checks
      .filter((c) => c.status !== 'PASS')
      .forEach((c) => allWarnings.push(`${r.label}: ${c.message}`));
  }
  el.warnings.innerHTML = allWarnings.length ? allWarnings.map((w) => `<p class="gl-warning">${w}</p>`).join('') : '';
}

function renderBreakdownOptions() {
  if (!state.results?.length) return;
  el.breakdownPanel.classList.remove('hidden');
  el.breakdownLevel.innerHTML = state.results.map((r) => `<option value="${r.id}">${r.label}</option>`).join('');
  el.breakdownLevel.value = state.selectedLodId;
}

function renderBreakdown(levelId) {
  const r = state.results?.find((x) => x.id === levelId);
  if (!r) return;
  if (!r.meshReports.length) {
    el.breakdownRows.innerHTML =
      '<tr><td colspan="5">This level is an unmodified copy of the source — nothing to break down.</td></tr>';
    return;
  }
  el.breakdownRows.innerHTML = r.meshReports
    .map(
      (m) => `
      <tr>
        <td title="${escapeAttr(m.name)}">${m.name}</td>
        <td>${formatNumber(m.before)}</td>
        <td>${formatNumber(m.after)}</td>
        <td>${(m.reduction * 100).toFixed(1)}%</td>
        <td><span class="gl-status is-${m.status.toLowerCase()}" ${m.reason ? `title="${escapeAttr(m.reason)}"` : ''}>${m.status}</span></td>
      </tr>`
    )
    .join('');
}

async function downloadAllZip() {
  if (!state.results?.length) return;
  const base = state.file.name.replace(/\.(glb|gltf)$/i, '');
  const outputs = state.results.map((r) => ({
    filename: `${base}_${r.label}.glb`,
    blob: new Blob([r.outputBuffer], { type: 'model/gltf-binary' }),
  }));
  el.downloadAll.disabled = true;
  try {
    await new BatchExporter().downloadAllAsZip(outputs, `${base}_LODs.zip`);
  } catch (err) {
    console.error('[GenerateLODs] zip export failed', err);
    showNotice(`Could not build the .zip: ${err?.message || 'unknown error'}`);
  } finally {
    el.downloadAll.disabled = false;
  }
}

function restart() {
  state.file = null;
  state.originalBuffer = null;
  state.originalStats = null;
  state.originalDocument = null;
  state.boundingRadius = 0;
  state.results = null;
  state.selectedLodId = null;
  state.viewer.original.clear();
  state.viewer.lod.clear();
  el.stage.classList.add('hidden');
  el.dropzone.classList.remove('hidden');
  el.results.classList.add('hidden');
  el.breakdownPanel.classList.add('hidden');
  el.modelCheck.classList.add('hidden');
  el.compareSeg.classList.add('hidden');
  el.lodTabs.classList.add('hidden');
  el.run.disabled = true;
  renderLevels();
}

// ----------------------------------------------------------------- notice

function showNotice(message) {
  el.noticeText.textContent = message;
  el.notice.classList.remove('hidden');
}
function hideNotice() {
  el.notice.classList.add('hidden');
}
