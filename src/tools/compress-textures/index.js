import variablesCssUrl from './styles/variables.css?url';
import compressTexturesCssUrl from './styles/compress-textures.css?url';
import toolIdentityCssUrl from '../../shared/components/toolIdentity.css?url';

import { readGlb } from './glb/createIO.js';
import { exportGlb } from './glb/export.js';
import { renderToolIdentity } from '../../shared/components/ToolIdentity.js';
import { downloadArrayBuffer } from './utils/download.js';
import { formatBytes, formatNumber } from './utils/formatting.js';
import { HARD_FILE_LIMIT } from './config/limits.js';
import { CompareViewer } from './viewer/CompareViewer.js';

import { compressTexturesMarkup } from './markup.js';
import {
  RESOLUTION_PRESETS,
  FORMATS,
  ADVANCED_DEFAULTS,
  UNAVAILABLE_FORMATS,
  detectFormatSupport,
  ROLES,
} from './presets.js';
import { analyseTextures, buildTextureReport } from './CompressTexturesAnalysis.js';
import { compressTextures, planForTexture, targetSize } from './CompressTexturesEngine.js';
import { validateCompression } from './CompressTexturesValidation.js';

const STAGES = ['ANALYSING', 'COMPRESSING', 'REBUILDING', 'VALIDATING', 'COMPLETE'];

function freshState() {
  return {
    file: null,
    originalBuffer: null,
    analysis: null,
    outputBuffer: null,
    settings: {
      maxSize: RESOLUTION_PRESETS['1024'].max,
      resolutionId: '1024',
      format: 'webp',
      ...ADVANCED_DEFAULTS,
    },
    overrides: {},
    support: {},
    selectedTexture: 0,
    zoom: 'fit',
    busy: false,
    viewer: null,
    reports: null,
  };
}

let state = freshState();

let el = {};
const byId = (id) => document.getElementById(id);

/**
 * Mounts Compress Textures into `container`. Real, working processing
 * engine — decode/resize/re-encode via canvas (WebP/JPEG/PNG) or
 * basis_universal-wasm (KTX2/Basis) — with a locked-camera before/after
 * Three.js comparison viewer and a per-pixel texture inspector.
 *
 * @param {HTMLElement} container
 * @returns {() => void} cleanup, called automatically by the router before
 *   the next navigation.
 */
export async function mount(container) {
  const stylesheets = [variablesCssUrl, compressTexturesCssUrl, toolIdentityCssUrl].map(injectStylesheet);

  state = freshState();
  container.innerHTML = compressTexturesMarkup();

  renderToolIdentity(byId('ct-identity'), {
    mark: 'texture-grid',
    eyebrow: 'Lower resolution, smaller downloads',
    title: 'Compress',
    accentTitle: 'Textures',
    description: 'Drop texture resolution. Keep the model. Ship smaller.',
  });

  el = {
    dropzone: byId('ct-dropzone'),
    file: byId('ct-file'),
    choose: byId('ct-choose'),
    stage: byId('ct-stage'),
    viewports: byId('ct-viewports'),
    splitHandle: byId('ct-split-handle'),
    hudTitle: byId('ct-hud-title'),
    hudStats: byId('ct-hud-stats'),
    compareSeg: byId('ct-compare-seg'),
    grid: byId('ct-grid'),
    resetCam: byId('ct-reset-cam'),
    inspector: byId('ct-inspector'),
    inspectorTitle: byId('ct-inspector-title'),
    canvasBefore: byId('ct-canvas-before'),
    canvasAfter: byId('ct-canvas-after'),
    capBefore: byId('ct-cap-before'),
    capAfter: byId('ct-cap-after'),
    resolutions: byId('ct-resolutions'),
    formats: byId('ct-formats'),
    formatNote: byId('ct-format-note'),
    quality: byId('ct-quality'),
    qualityInput: byId('ct-quality-input'),
    qualityValue: byId('ct-quality-value'),
    estBefore: byId('ct-est-before'),
    estAfter: byId('ct-est-after'),
    advToggle: byId('ct-adv-toggle'),
    advBody: byId('ct-adv-body'),
    run: byId('ct-run'),
    runLabel: byId('ct-run-label'),
    progress: byId('ct-progress'),
    progressFill: byId('ct-progress-fill'),
    progressStage: byId('ct-progress-stage'),
    progressPct: byId('ct-progress-pct'),
    check: byId('ct-check'),
    checkList: byId('ct-check-list'),
    results: byId('ct-results'),
    headlineNum: byId('ct-headline-num'),
    resultRows: byId('ct-result-rows'),
    validation: byId('ct-validation'),
    warnings: byId('ct-warnings'),
    download: byId('ct-download'),
    restart: byId('ct-restart'),
    tablePanel: byId('ct-table-panel'),
    tableRows: byId('ct-table-rows'),
    notice: byId('ct-notice'),
    noticeText: byId('ct-notice-text'),
    noticeClose: byId('ct-notice-close'),
  };

  // Ask the browser what it can really encode before offering any of it.
  state.support = await detectFormatSupport();
  applyFormatSupport();

  buildAdvancedPanel();
  wireUpload();
  wireControls();
  wireViewerBar();
  renderEstimate();
  renderFormatNote();

  state.viewer = new CompareViewer({
    originalHost: byId('ct-viewport-original'),
    reducedHost: byId('ct-viewport-compressed'),
    splitHost: byId('ct-viewports'),
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

/** Disables any format this browser failed to encode in the probe. */
function applyFormatSupport() {
  for (const [id, result] of Object.entries(state.support)) {
    const button = el.formats.querySelector(`[data-format="${id}"]`);
    if (!button || result.supported) continue;
    button.disabled = true;
    button.classList.add('is-unavailable');
    button.classList.remove('selected');
    button.setAttribute('aria-checked', 'false');
    button.title = result.reason || 'Not supported by this browser.';
    const blurb = button.querySelector('.ct-format-blurb');
    if (blurb) blurb.textContent = 'Unavailable in this browser';
  }
  if (state.support[state.settings.format] && !state.support[state.settings.format].supported) {
    selectFormat('keep');
  }
}

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
    const analysis = analyseTextures(document_);

    state.file = file;
    state.originalBuffer = buffer;
    state.analysis = analysis;
    state.overrides = {};
    state.outputBuffer = null;
    state.reports = null;
    state.selectedTexture = 0;

    el.dropzone.classList.add('hidden');
    el.stage.classList.remove('hidden');
    el.compareSeg.classList.add('hidden');
    el.results.classList.add('hidden');
    setCompareLayout('single');

    await state.viewer.loadOriginal(buffer);
    renderHud('ORIGINAL', analysis, file.size);
    renderCheck();
    renderTable();
    renderEstimate();

    if (analysis.textureCount > 0) {
      el.inspector.classList.remove('hidden');
      el.tablePanel.classList.remove('hidden');
      selectTexture(0);
    } else {
      el.inspector.classList.add('hidden');
      el.tablePanel.classList.add('hidden');
      showNotice(`"${file.name}" has no textures, so there is nothing for this tool to do.`);
    }
  } catch (err) {
    showNotice(explainLoadFailure(err, file.name));
    console.error('[CompressTextures] load failed', err);
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
  el.resolutions.addEventListener('click', (e) => {
    const button = e.target.closest('[data-res]');
    if (button) selectResolution(button.dataset.res);
  });

  el.formats.addEventListener('click', (e) => {
    const button = e.target.closest('[data-format]');
    if (button && !button.disabled) selectFormat(button.dataset.format);
  });

  el.qualityInput.addEventListener('input', () => {
    state.settings.quality = Number(el.qualityInput.value) / 100;
    el.qualityValue.textContent = el.qualityInput.value;
  });

  el.advToggle.addEventListener('click', () => {
    const open = el.advToggle.getAttribute('aria-expanded') === 'true';
    el.advToggle.setAttribute('aria-expanded', String(!open));
    el.advBody.classList.toggle('hidden', open);
  });

  document.querySelectorAll('[data-zoom]').forEach((button) =>
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-zoom]').forEach((b) => b.classList.toggle('is-active', b === button));
      state.zoom = button.dataset.zoom;
      selectTexture(state.selectedTexture);
    })
  );

  el.run.addEventListener('click', runCompression);
  el.download.addEventListener('click', downloadResult);
  el.restart.addEventListener('click', restart);
}

function selectResolution(id) {
  const preset = RESOLUTION_PRESETS[id];
  if (!preset) return;
  state.settings.resolutionId = id;
  state.settings.maxSize = preset.max;
  el.resolutions.querySelectorAll('[data-res]').forEach((b) => {
    const on = b.dataset.res === id;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  });
  renderEstimate();
  renderCheck();
  renderTable();
  selectTexture(state.selectedTexture);
}

function selectFormat(id) {
  if (!FORMATS[id]) return;
  state.settings.format = id;
  el.formats.querySelectorAll('[data-format]').forEach((b) => {
    const on = b.dataset.format === id;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  });
  // The quality slider only means something for canvas-encoded lossy formats.
  el.quality.classList.toggle('hidden', !(id === 'webp' || id === 'jpeg'));
  renderFormatNote();
  renderTable();
}

function renderFormatNote() {
  const format = FORMATS[state.settings.format];
  const notes = {
    keep: 'Textures are resized but keep their current format. Lossless — the safest option for data maps.',
    webp: 'Good compression with alpha support. Every current browser and most engines read it.',
    jpeg: 'No alpha channel. Any texture with transparency is written as WebP instead, and the table will say so.',
    ktx2: 'Stays compressed in video memory, not just on disk — the only option here that reduces VRAM. Encoding takes roughly 1–3 seconds per texture, and the file will require KHR_texture_basisu support.',
  };
  el.formatNote.innerHTML = notes[format.id] || '';
}

function buildAdvancedPanel() {
  el.advBody.innerHTML = `
    <div>
      <div class="advanced-group-title">Resizing</div>
      <div class="field-row">
        <span>Round down to power of two<small>Some engines only mipmap power-of-two textures</small></span>
        <label class="switch"><input type="checkbox" id="ct-pot" /><span class="switch-track"></span></label>
      </div>
    </div>

    <div>
      <div class="advanced-group-title">Data maps</div>
      <div class="field-row">
        <span>Allow lossy compression of data maps<small>Normal, ORM, transmission and similar</small></span>
        <label class="switch"><input type="checkbox" id="ct-recompress" /><span class="switch-track"></span></label>
      </div>
      <p class="ct-adv-note">
        Off by default. These textures store numbers, not colour, so lossy compression shows up as
        wrong lighting rather than a softer image. Individual textures can still be overridden in the table.
      </p>
    </div>

    <div>
      <div class="advanced-group-title">KTX2 / Basis</div>
      <div class="field-row">
        <span>Mode<small>ETC1S is far smaller; UASTC keeps more detail</small></span>
        <select class="select" id="ct-ktx2-mode">
          <option value="etc1s" selected>ETC1S (smallest)</option>
          <option value="uastc">UASTC (highest quality)</option>
        </select>
      </div>
      <div class="field-row">
        <span>ETC1S quality<small>1–255, higher is better looking and larger</small></span>
        <span class="ct-inline">
          <input class="slider" type="range" id="ct-ktx2-quality" min="1" max="255" step="1" value="${ADVANCED_DEFAULTS.ktx2Quality}" />
          <span id="ct-ktx2-quality-value" class="ct-mono">${ADVANCED_DEFAULTS.ktx2Quality}</span>
        </span>
      </div>
      <div class="field-row">
        <span>Generate mipmaps<small>Written into the KTX2 file itself</small></span>
        <label class="switch"><input type="checkbox" id="ct-mipmaps" checked /><span class="switch-track"></span></label>
      </div>
    </div>

    <div>
      <div class="advanced-group-title">Not offered</div>
      <ul class="ct-fact-list">
        ${UNAVAILABLE_FORMATS.map(
          (f) => `
          <li class="ct-fact">
            <span class="ct-fact-state">Unavailable</span>
            <span class="ct-fact-label">${f.label}</span>
            <span class="ct-fact-note">${f.reason}</span>
          </li>`
        ).join('')}
      </ul>
    </div>
  `;

  byId('ct-pot').addEventListener('change', (e) => {
    state.settings.powerOfTwo = e.target.checked;
    renderEstimate();
    renderTable();
  });
  byId('ct-recompress').addEventListener('change', (e) => {
    state.settings.recompressDataMaps = e.target.checked;
    renderTable();
  });
  byId('ct-ktx2-mode').addEventListener('change', (e) => {
    state.settings.ktx2Mode = e.target.value;
  });
  const ktx2Quality = byId('ct-ktx2-quality');
  ktx2Quality.addEventListener('input', () => {
    state.settings.ktx2Quality = Number(ktx2Quality.value);
    byId('ct-ktx2-quality-value').textContent = ktx2Quality.value;
  });
  byId('ct-mipmaps').addEventListener('change', (e) => {
    state.settings.mipmaps = e.target.checked;
  });
}

// ------------------------------------------------------------- viewer bar

function wireViewerBar() {
  document.querySelectorAll('[data-compare]').forEach((button) =>
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-compare]').forEach((b) => b.classList.toggle('is-active', b === button));
      setCompareLayout(button.dataset.compare);
    })
  );

  el.grid.addEventListener('click', () => {
    const next = el.grid.getAttribute('aria-pressed') !== 'true';
    el.grid.setAttribute('aria-pressed', String(next));
    el.grid.classList.toggle('is-active', next);
    state.viewer.setGridVisible(next);
  });

  el.resetCam.addEventListener('click', () => state.viewer.resetCamera());

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

function setCompareLayout(mode) {
  el.viewports.dataset.layout = mode;
  el.splitHandle.hidden = mode !== 'split';
  if (mode === 'split') {
    state.viewer.setSplitPosition(50);
    el.splitHandle.style.left = '50%';
  }
  const after = state.validation?.stats;
  if (mode === 'compressed' && after) {
    renderHud('COMPRESSED', after, state.outputBuffer?.byteLength);
  } else if (mode === 'original' || !after) {
    renderHud('ORIGINAL', state.analysis, state.file?.size);
  } else {
    // Side-by-side and split show both models, so the panel shows both sets
    // of numbers rather than labelling the originals "compare".
    renderHud('COMPARE', after, state.outputBuffer?.byteLength, state.analysis);
  }
  window.dispatchEvent(new Event('resize'));
}

// ------------------------------------------------------------------ HUD

function renderHud(title, stats, bytes, compareWith = null) {
  el.hudTitle.textContent = title;
  const pair = (before, after) => `${before} → ${after}`;
  const rows = compareWith
    ? [
        ['Textures', formatNumber(stats.textureCount)],
        ['Texture data', pair(formatBytes(compareWith.totalBytes), formatBytes(stats.totalBytes))],
        ['Est. VRAM', pair(formatBytes(compareWith.estimatedVramBytes), formatBytes(stats.estimatedVramBytes))],
      ]
    : [
    ['Textures', formatNumber(stats.textureCount)],
    ['Texture data', formatBytes(stats.totalBytes)],
    ['Largest', stats.largest ? `${stats.largest.width || '?'}px` : '—'],
    ['Est. VRAM', formatBytes(stats.estimatedVramBytes)],
  ];
  if (Number.isFinite(bytes)) rows.push(['File size', formatBytes(bytes)]);
  el.hudStats.innerHTML = rows
    .map(([k, v]) => `<div class="ct-hud-row"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');
}

function renderCheck() {
  if (!state.analysis) return;
  const report = buildTextureReport(state.analysis, state.settings);
  el.check.classList.remove('hidden');
  el.checkList.innerHTML = report.items
    .map(
      (item) => `<li class="ct-check is-${item.level}"><span class="ct-check-mark">${
        item.level === 'ok' ? '✓' : item.level === 'warn' ? '!' : '×'
      }</span><span>${item.text}</span></li>`
    )
    .join('');
  el.run.disabled = !report.canProceed || state.busy;
}

// -------------------------------------------------------------- estimate

function renderEstimate() {
  if (!state.analysis) {
    el.estBefore.textContent = '—';
    el.estAfter.textContent = '—';
    return;
  }

  let before = 0;
  let after = 0;
  for (const item of state.analysis.items) {
    if (!item.width) continue;
    before += item.width * item.height;
    const plan = planForTexture(item, state.settings, state.overrides[item.index]);
    if (plan.action === 'skip') {
      after += item.width * item.height;
    } else {
      after += plan.size.width * plan.size.height;
    }
  }

  el.estBefore.textContent = `${formatMegapixels(before)} MP`;
  el.estAfter.textContent = `${formatMegapixels(after)} MP`;
}

const formatMegapixels = (pixels) => (pixels / 1e6).toFixed(pixels < 1e6 ? 2 : 1);

// -------------------------------------------------------------- the table

function renderTable() {
  if (!state.analysis || state.analysis.textureCount === 0) return;

  el.tableRows.innerHTML = state.analysis.items
    .map((item) => {
      const override = state.overrides[item.index] || {};
      const plan = planForTexture(item, state.settings, override);
      const report = state.reports?.find((r) => r.name === item.name);

      const target =
        plan.action === 'skip'
          ? '—'
          : `${plan.size.width}×${plan.size.height}`;

      const resultCell = report
        ? `<span class="ct-status is-${report.status.toLowerCase()}" ${report.reason ? `title="${escapeAttr(report.reason)}"` : ''}>${report.status}</span>
           <span class="ct-result-bytes">${formatBytes(report.beforeBytes)} → ${formatBytes(report.afterBytes)}</span>`
        : plan.action === 'skip'
          ? `<span class="ct-status is-skipped" title="${escapeAttr(plan.reason)}">Will skip</span>`
          : `<span class="ct-pending">→ ${target} ${FORMATS[plan.format]?.label || plan.format}</span>`;

      // A data map gets an explicit per-texture opt-in rather than a silent rule.
      const overrideCell =
        plan.action === 'skip'
          ? '<span class="ct-dash">—</span>'
          : item.role.lossySafe
            ? `<select class="ct-mini-select" data-override-format="${item.index}">
                 <option value="">Use setting</option>
                 ${Object.values(FORMATS)
                   .filter((f) => state.support[f.id]?.supported !== false)
                   .map((f) => `<option value="${f.id}"${override.format === f.id ? ' selected' : ''}>${f.label}</option>`)
                   .join('')}
               </select>`
            : `<label class="ct-mini-check" title="${escapeAttr(item.role.note)}">
                 <input type="checkbox" data-override-recompress="${item.index}" ${plan.allowLossy ? 'checked' : ''} />
                 <span>Allow lossy</span>
               </label>`;

      return `
        <tr data-texture="${item.index}" class="${item.index === state.selectedTexture ? 'is-selected' : ''}">
          <td class="ct-name" title="${escapeAttr(item.name)}">${item.name}</td>
          <td><span class="ct-role is-${item.role.id}" title="${escapeAttr(item.role.note)}">${item.role.label}</span></td>
          <td>${item.width ? `${item.width}×${item.height}` : '?'}</td>
          <td>${formatBytes(item.bytes)}</td>
          <td>${overrideCell}</td>
          <td>${resultCell}</td>
        </tr>`;
    })
    .join('');

  el.tableRows.querySelectorAll('tr').forEach((row) =>
    row.addEventListener('click', (e) => {
      if (e.target.closest('select, input, label')) return;
      selectTexture(Number(row.dataset.texture));
    })
  );

  el.tableRows.querySelectorAll('[data-override-format]').forEach((select) =>
    select.addEventListener('change', () => {
      const index = Number(select.dataset.overrideFormat);
      state.overrides[index] = { ...state.overrides[index], format: select.value || undefined };
      renderEstimate();
      renderTable();
    })
  );

  el.tableRows.querySelectorAll('[data-override-recompress]').forEach((input) =>
    input.addEventListener('change', () => {
      const index = Number(input.dataset.overrideRecompress);
      state.overrides[index] = { ...state.overrides[index], recompress: input.checked };
      renderTable();
    })
  );
}

// ---------------------------------------------------------- the inspector

async function selectTexture(index) {
  const item = state.analysis?.items?.[index];
  if (!item) return;
  state.selectedTexture = index;

  el.tableRows?.querySelectorAll('tr').forEach((row) =>
    row.classList.toggle('is-selected', Number(row.dataset.texture) === index)
  );

  el.inspectorTitle.innerHTML = `${item.name} <span class="ct-role is-${item.role.id}">${item.role.label}</span>`;

  // Before: the actual original pixels.
  if (item.decodable) {
    try {
      const bitmap = await createImageBitmap(new Blob([item.texture.getImage()], { type: item.mime }));
      drawToCanvas(el.canvasBefore, bitmap);
      el.capBefore.textContent = `${item.width}×${item.height} · ${formatBytes(item.bytes)} · ${item.mime.replace('image/', '')}`;
      bitmap.close?.();
    } catch {
      clearCanvas(el.canvasBefore);
      el.capBefore.textContent = 'Could not be decoded for preview.';
    }
  } else {
    clearCanvas(el.canvasBefore);
    el.capBefore.textContent = item.skipReason || 'Not previewable.';
  }

  // After: only ever the real compressed bytes, never a simulation.
  const report = state.reports?.find((r) => r.name === item.name);
  const compressed = state.compressedImages?.[item.name];
  if (compressed) {
    try {
      const bitmap = await createImageBitmap(new Blob([compressed.bytes], { type: compressed.mime }));
      drawToCanvas(el.canvasAfter, bitmap);
      el.capAfter.textContent = `${compressed.width}×${compressed.height} · ${formatBytes(compressed.bytes.byteLength)} · ${compressed.mime.replace('image/', '')}`;
      bitmap.close?.();
    } catch {
      clearCanvas(el.canvasAfter);
      el.capAfter.textContent = report
        ? `${report.afterSize} · ${formatBytes(report.afterBytes)} · ${report.format.replace('image/', '')} — not previewable in a browser`
        : 'Not previewable.';
    }
  } else {
    clearCanvas(el.canvasAfter);
    const plan = planForTexture(item, state.settings, state.overrides[item.index]);
    el.capAfter.textContent =
      plan.action === 'skip'
        ? 'Will be skipped'
        : `Not compressed yet — target ${plan.size.width}×${plan.size.height}`;
  }
}

function drawToCanvas(canvas, bitmap) {
  const wrap = canvas.parentElement;
  const box = wrap.clientWidth || 260;
  let scale;
  if (state.zoom === 'fit') scale = Math.min(box / bitmap.width, 1);
  else scale = Number(state.zoom);

  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  // Nearest-neighbour when magnifying, so compression artefacts are visible
  // as they really are rather than smoothed away by the browser.
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
}

function clearCanvas(canvas) {
  canvas.width = 1;
  canvas.height = 1;
  canvas.getContext('2d').clearRect(0, 0, 1, 1);
}

// ------------------------------------------------------------ compression

function setProgress(stageName, detail) {
  const index = STAGES.indexOf(stageName);
  const pct = index >= 0 ? Math.round(((index + 1) / STAGES.length) * 100) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressPct.textContent = `${pct}%`;
  el.progressStage.textContent = detail?.name
    ? `${titleCase(stageName)} — ${detail.name} (${detail.texture}/${detail.total})`
    : titleCase(stageName);
}

const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

async function runCompression() {
  if (state.busy || !state.originalBuffer) return;
  state.busy = true;
  el.run.disabled = true;
  el.runLabel.textContent = 'Compressing…';
  el.progress.classList.remove('hidden');
  hideNotice();

  try {
    // Fresh parse: the user's loaded document is never mutated, so "Start
    // again" and repeated runs always work from the true original.
    const workingDocument = await readGlb(state.originalBuffer);

    const result = await compressTextures({
      document: workingDocument,
      settings: state.settings,
      overrides: state.overrides,
      onProgress: setProgress,
    });

    setProgress('VALIDATING');
    const outputBuffer = await exportGlb(result.outputDocument);
    const validation = await validateCompression({
      outputBuffer,
      originalStats: result.originalStats,
      filename: state.file.name,
    });

    setProgress('COMPLETE');

    state.outputBuffer = outputBuffer;
    state.reports = result.reports;
    state.validation = validation;

    // Keep the real compressed bytes so the inspector shows the actual
    // result rather than a re-render of the original.
    state.compressedImages = {};
    for (const texture of result.reducedStats.items) {
      state.compressedImages[texture.name] = {
        bytes: texture.texture.getImage(),
        mime: texture.mime,
        width: texture.width,
        height: texture.height,
      };
    }

    await state.viewer.loadReduced(outputBuffer);
    el.compareSeg.classList.remove('hidden');
    setActiveCompare('side');
    setCompareLayout('side');

    renderResults(result, validation, outputBuffer);
    renderTable();
    selectTexture(state.selectedTexture);
  } catch (err) {
    console.error('[CompressTextures] compression failed', err);
    showNotice(`Compression failed: ${err?.message || 'unknown error'}`);
    el.progress.classList.add('hidden');
  } finally {
    state.busy = false;
    el.run.disabled = false;
    el.runLabel.textContent = 'Compress textures';
    setTimeout(() => el.progress.classList.add('hidden'), 1200);
  }
}

function setActiveCompare(mode) {
  document.querySelectorAll('[data-compare]').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.compare === mode)
  );
}

function renderResults(result, validation, outputBuffer) {
  const before = result.originalStats;
  const after = validation.stats || result.reducedStats;

  const textureChange = before.totalBytes
    ? ((before.totalBytes - after.totalBytes) / before.totalBytes) * 100
    : 0;
  const fileBefore = state.file.size;
  const fileAfter = outputBuffer.byteLength;
  const fileChange = ((fileBefore - fileAfter) / fileBefore) * 100;
  const vramChange = before.estimatedVramBytes
    ? ((before.estimatedVramBytes - after.estimatedVramBytes) / before.estimatedVramBytes) * 100
    : 0;

  el.results.classList.remove('hidden');
  el.headlineNum.textContent = `${textureChange >= 0 ? '−' : '+'}${Math.abs(textureChange).toFixed(1)}%`;

  const compressed = result.reports.filter((r) => r.status === 'Compressed').length;
  const skipped = result.reports.filter((r) => r.status === 'Skipped').length;
  const failed = result.reports.filter((r) => r.status === 'Failed').length;

  el.resultRows.innerHTML = [
    row('Textures compressed', `${compressed} of ${result.reports.length}`),
    skipped ? row('Skipped', String(skipped)) : '',
    failed ? row('Failed', String(failed)) : '',
    row('Texture data', `${formatBytes(before.totalBytes)} → ${formatBytes(after.totalBytes)}`),
    row('Texture reduction', `${textureChange.toFixed(1)}%`, true),
    divider('GPU memory is a separate measure from file size — it depends on pixel count and format, not on how well the file zips.'),
    row('Est. video memory', `${formatBytes(before.estimatedVramBytes)} → ${formatBytes(after.estimatedVramBytes)}`),
    row('VRAM reduction', `${vramChange.toFixed(1)}%`),
    divider('Whole-file size includes geometry, which this tool does not touch.'),
    row('File size', `${formatBytes(fileBefore)} → ${formatBytes(fileAfter)}`),
    row(
      'File size change',
      fileAfter <= fileBefore ? `${fileChange.toFixed(1)}% smaller` : `${Math.abs(fileChange).toFixed(1)}% larger`
    ),
  ]
    .filter(Boolean)
    .join('');

  const cls = validation.status === 'PASS' ? 'ok' : validation.status === 'WARNING' ? 'warn' : 'fail';
  const failures = validation.checks.filter((c) => c.status !== 'PASS');
  el.validation.innerHTML = `
    <div class="ct-validation-head is-${cls}">
      ${validation.status === 'PASS' ? 'Validation passed' : validation.status === 'WARNING' ? 'Validation warning' : 'Validation failed'}
    </div>
    ${
      failures.length
        ? `<ul class="ct-validation-list">${failures
            .map((c) => `<li class="is-${c.status.toLowerCase()}">${c.message}</li>`)
            .join('')}</ul>`
        : `<p class="ct-validation-note">${validation.checks.length} checks passed, including a full reload in Three.js.</p>`
    }
  `;

  const warnings = [...result.warnings];
  if (fileAfter > fileBefore) {
    warnings.push(
      'The GLB got larger. That usually means the source textures were already better compressed than the output format manages at this quality — the original file is the better one to ship.'
    );
  }
  el.warnings.innerHTML = warnings.length
    ? warnings.map((w) => `<p class="ct-warning">${w}</p>`).join('')
    : '';

  // Downloading a file that failed validation would be handing over something
  // known to be broken.
  el.download.disabled = validation.status === 'FAIL';
}

const row = (label, value, strong = false) =>
  `<div class="ct-result-row${strong ? ' is-strong' : ''}"><span>${label}</span><strong>${value}</strong></div>`;
const divider = (note) => `<p class="ct-result-note">${note}</p>`;

function downloadResult() {
  if (!state.outputBuffer) return;
  const base = state.file.name.replace(/\.(glb|gltf)$/i, '');
  downloadArrayBuffer(state.outputBuffer, `${base}_textures.glb`);
}

function restart() {
  state.file = null;
  state.originalBuffer = null;
  state.analysis = null;
  state.outputBuffer = null;
  state.reports = null;
  state.validation = null;
  state.compressedImages = null;
  state.overrides = {};
  state.viewer.original.clear();
  state.viewer.reduced.clear();
  el.stage.classList.add('hidden');
  el.dropzone.classList.remove('hidden');
  el.results.classList.add('hidden');
  el.check.classList.add('hidden');
  el.inspector.classList.add('hidden');
  el.tablePanel.classList.add('hidden');
  el.compareSeg.classList.add('hidden');
  el.run.disabled = true;
  renderEstimate();
}

// ----------------------------------------------------------------- notice

function showNotice(message) {
  el.noticeText.textContent = message;
  el.notice.classList.remove('hidden');
}
function hideNotice() {
  el.notice.classList.add('hidden');
}

function escapeAttr(value) {
  return String(value).replace(/"/g, '&quot;');
}

export { ROLES, targetSize };
