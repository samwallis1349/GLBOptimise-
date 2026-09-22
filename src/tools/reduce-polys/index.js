import variablesCssUrl from './styles/variables.css?url';
import reducePolysCssUrl from './styles/reduce-polys.css?url';
import toolIdentityCssUrl from '../../shared/components/toolIdentity.css?url';

import { readGlb } from './glb/createIO.js';
import { exportGlb } from './glb/export.js';
import { renderToolIdentity } from '../../shared/components/ToolIdentity.js';
import { downloadArrayBuffer } from './utils/download.js';
import { formatBytes, formatNumber } from './utils/formatting.js';
import { HARD_FILE_LIMIT } from './config/limits.js';

import { reducePolysMarkup } from './markup.js';
import { REDUCTION_PRESETS, ADVANCED_DEFAULTS, PRESERVATION_FACTS } from './presets.js';
import { analyseGeometry, buildSafetyReport } from './ReducePolysAnalysis.js';
import { reducePolys } from './ReducePolysEngine.js';
import { validateReduction } from './ReducePolysValidation.js';
import { ReducePolysViewer } from './ReducePolysViewer.js';

const STAGES = ['ANALYSING MODEL', 'PREPARING GEOMETRY', 'SIMPLIFYING', 'REBUILDING', 'VALIDATING', 'COMPLETE'];

function freshState() {
  return {
    file: null,
    originalBuffer: null,
    originalStats: null,
    reducedBuffer: null,
    reducedStats: null,
    mode: 'percent',
    keep: 0.5,
    targetTriangles: 50000,
    advanced: { ...ADVANCED_DEFAULTS },
    busy: false,
    viewer: null,
  };
}

let state = freshState();
let el = {};

/**
 * Mounts Reduce Polys into `container`. Real, working processing engine —
 * meshoptimizer-driven per-primitive simplification via glTF-Transform,
 * with a locked-camera before/after Three.js comparison viewer.
 *
 * @param {HTMLElement} container
 * @returns {() => void} cleanup, called automatically by the router before
 *   the next navigation.
 */
export function mount(container) {
  const stylesheets = [variablesCssUrl, reducePolysCssUrl, toolIdentityCssUrl].map(injectStylesheet);

  state = freshState();
  container.innerHTML = reducePolysMarkup();

  renderToolIdentity(document.getElementById('rp-identity'), {
    mark: 'poly-mesh',
    eyebrow: 'Lower geometry, same silhouette',
    title: 'Reduce',
    accentTitle: 'Polys',
    description: 'Lower geometry. Keep the shape. Improve performance.',
  });

  el = {
    dropzone: byId('rp-dropzone'),
    file: byId('rp-file'),
    choose: byId('rp-choose'),
    stage: byId('rp-stage'),
    viewports: byId('rp-viewports'),
    splitHandle: byId('rp-split-handle'),
    hudTitle: byId('rp-hud-title'),
    hudStats: byId('rp-hud-stats'),
    compareSeg: byId('rp-compare-seg'),
    grid: byId('rp-grid'),
    resetCam: byId('rp-reset-cam'),
    presets: byId('rp-presets'),
    keep: byId('rp-keep'),
    keepValue: byId('rp-keep-value'),
    keepExplain: byId('rp-keep-explain'),
    percentMode: byId('rp-percent-mode'),
    triangleMode: byId('rp-triangle-mode'),
    targetTris: byId('rp-target-tris'),
    targetNote: byId('rp-target-note'),
    beforeTris: byId('rp-before-tris'),
    targetOut: byId('rp-target-tris-out'),
    densityBefore: byId('rp-density-before'),
    densityAfter: byId('rp-density-after'),
    advToggle: byId('rp-adv-toggle'),
    advBody: byId('rp-adv-body'),
    run: byId('rp-run'),
    runLabel: byId('rp-run-label'),
    progress: byId('rp-progress'),
    progressFill: byId('rp-progress-fill'),
    progressStage: byId('rp-progress-stage'),
    progressPct: byId('rp-progress-pct'),
    modelCheck: byId('rp-model-check'),
    checkList: byId('rp-check-list'),
    results: byId('rp-results'),
    headlineNum: byId('rp-headline-num'),
    resultRows: byId('rp-result-rows'),
    validation: byId('rp-validation'),
    warnings: byId('rp-warnings'),
    download: byId('rp-download'),
    restart: byId('rp-restart'),
    breakdownPanel: byId('rp-breakdown-panel'),
    breakdownToggle: byId('rp-breakdown-toggle'),
    breakdownBody: byId('rp-breakdown-body'),
    breakdownRows: byId('rp-breakdown-rows'),
    notice: byId('rp-notice'),
    noticeText: byId('rp-notice-text'),
    noticeClose: byId('rp-notice-close'),
  };

  buildAdvancedPanel();
  wireUpload();
  wireControls();
  wireViewerBar();
  renderTargetPreview();

  state.viewer = new ReducePolysViewer({
    originalHost: byId('rp-viewport-original'),
    reducedHost: byId('rp-viewport-reduced'),
    splitHost: byId('rp-viewports'),
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
      return showNotice(`"${file.name}" contains no triangle geometry, so there is nothing to reduce.`);
    }

    state.file = file;
    state.originalBuffer = buffer;
    state.originalStats = stats;
    state.originalDocument = document_;
    state.reducedBuffer = null;
    state.reducedStats = null;

    el.dropzone.classList.add('hidden');
    el.stage.classList.remove('hidden');
    el.compareSeg.classList.add('hidden');
    el.results.classList.add('hidden');
    el.breakdownPanel.classList.add('hidden');

    await state.viewer.loadOriginal(buffer);
    renderHud('ORIGINAL', stats, file.size);
    renderModelCheck(stats);
    renderTargetPreview();
    el.run.disabled = false;
  } catch (err) {
    showNotice(explainLoadFailure(err, file.name));
    console.error('[ReducePolys] load failed', err);
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

  el.keep.addEventListener('input', () => {
    state.keep = Number(el.keep.value) / 100;
    syncPresetSelection();
    renderTargetPreview();
  });

  el.targetTris.addEventListener('input', () => {
    state.targetTriangles = Math.max(1, Number(el.targetTris.value) || 0);
    renderTargetPreview();
  });

  document.querySelectorAll('[data-target]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.targetTriangles = Number(chip.dataset.target);
      el.targetTris.value = state.targetTriangles;
      renderTargetPreview();
    })
  );

  document.querySelectorAll('[data-mode]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-active', b === btn));
      el.percentMode.hidden = state.mode !== 'percent';
      el.triangleMode.hidden = state.mode !== 'triangles';
      renderTargetPreview();
    })
  );

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

  el.run.addEventListener('click', runReduction);
  el.download.addEventListener('click', downloadResult);
  el.restart.addEventListener('click', restart);

  selectPreset('medium');
}

function selectPreset(id) {
  const preset = REDUCTION_PRESETS[id];
  if (preset?.keep) {
    state.keep = preset.keep;
    el.keep.value = String(Math.round(preset.keep * 100));
  }
  el.presets.querySelectorAll('[data-preset]').forEach((b) => {
    const on = b.dataset.preset === id;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  });
  renderTargetPreview();
}

/** Moving the slider by hand switches the preset row to Custom. */
function syncPresetSelection() {
  const match = Object.values(REDUCTION_PRESETS).find(
    (p) => p.keep !== null && Math.abs(p.keep - state.keep) < 0.005
  );
  const id = match ? match.id : 'custom';
  el.presets.querySelectorAll('[data-preset]').forEach((b) => {
    const on = b.dataset.preset === id;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-checked', String(on));
  });
}

function buildAdvancedPanel() {
  el.advBody.innerHTML = `
    <div>
      <div class="advanced-group-title">Simplifier settings</div>
      <div class="field-row">
        <span>Lock boundary vertices<small>Keeps open edges from shrinking</small></span>
        <label class="switch"><input type="checkbox" id="rp-lock-border" ${ADVANCED_DEFAULTS.lockBorder ? 'checked' : ''} /><span class="switch-track"></span></label>
      </div>
      <div class="field-row">
        <span>Simplification error<small>Max deviation, as a fraction of mesh size</small></span>
        <span class="rp-inline">
          <input class="slider" type="range" id="rp-error" min="1" max="200" step="1" value="${ADVANCED_DEFAULTS.error * 1000}" />
          <span id="rp-error-value" class="rp-mono">${ADVANCED_DEFAULTS.error.toFixed(3)}</span>
        </span>
      </div>
      <div class="field-row">
        <span>Remove unused resources<small>Prunes data left unreferenced after reduction</small></span>
        <label class="switch"><input type="checkbox" id="rp-cleanup" ${ADVANCED_DEFAULTS.cleanup ? 'checked' : ''} /><span class="switch-track"></span></label>
      </div>
    </div>
    <div>
      <div class="advanced-group-title">Preservation</div>
      <p class="rp-adv-note">
        These are not switches. They describe what the simplifier actually does, so nothing here
        claims a guarantee the engine can't make.
      </p>
      <ul class="rp-fact-list">
        ${PRESERVATION_FACTS.map(
          (f) => `
          <li class="rp-fact is-${f.state}">
            <span class="rp-fact-state">${f.state === 'inherent' ? 'Always preserved' : 'Not supported'}</span>
            <span class="rp-fact-label">${f.label}</span>
            <span class="rp-fact-note">${f.note}</span>
          </li>`
        ).join('')}
      </ul>
    </div>
  `;

  byId('rp-lock-border').addEventListener('change', (e) => {
    state.advanced.lockBorder = e.target.checked;
  });
  byId('rp-cleanup').addEventListener('change', (e) => {
    state.advanced.cleanup = e.target.checked;
  });
  const errorInput = byId('rp-error');
  errorInput.addEventListener('input', () => {
    state.advanced.error = Number(errorInput.value) / 1000;
    byId('rp-error-value').textContent = state.advanced.error.toFixed(3);
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

function setCompareLayout(mode) {
  el.viewports.dataset.layout = mode;
  el.splitHandle.hidden = mode !== 'split';
  if (mode === 'split') {
    state.viewer.setSplitPosition(50);
    el.splitHandle.style.left = '50%';
  }
  if (mode === 'reduced' && state.reducedStats) {
    renderHud('REDUCED', state.reducedStats, state.reducedBuffer?.byteLength);
  } else if (mode === 'original' && state.originalStats) {
    renderHud('ORIGINAL', state.originalStats, state.file?.size);
  } else if (state.reducedStats) {
    renderHud('COMPARE', state.reducedStats, state.reducedBuffer?.byteLength, state.originalStats);
  }
  // Layout changed size; nudge both renderers.
  window.dispatchEvent(new Event('resize'));
}

// ------------------------------------------------------------------ HUD

function renderHud(title, stats, bytes, compareWith = null) {
  el.hudTitle.textContent = title;
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
  el.hudStats.innerHTML = rows
    .map(([k, v]) => `<div class="rp-hud-row"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');
}

function renderModelCheck(stats) {
  const report = buildSafetyReport(stats);
  el.modelCheck.classList.remove('hidden');
  el.checkList.innerHTML = report.items
    .map(
      (item) => `<li class="rp-check is-${item.level}"><span class="rp-check-mark">${
        item.level === 'ok' ? '✓' : item.level === 'warn' ? '!' : '×'
      }</span><span>${item.text}</span></li>`
    )
    .join('');
  el.run.disabled = !report.canProceed || state.busy;
}

// -------------------------------------------------------- target preview

function currentRatio() {
  if (!state.originalStats) return state.keep;
  if (state.mode === 'triangles') {
    return Math.max(0.001, Math.min(1, state.targetTriangles / state.originalStats.triangleCount));
  }
  return state.keep;
}

function renderTargetPreview() {
  const original = state.originalStats?.triangleCount ?? null;
  const ratio = currentRatio();

  el.keepValue.textContent = `${Math.round(state.keep * 100)}%`;
  el.keepExplain.textContent = `${Math.round(state.keep * 100)}% keeps roughly ${Math.round(
    state.keep * 100
  )} of every 100 triangles.`;

  el.beforeTris.textContent = original === null ? '—' : formatNumber(original);
  const target = original === null ? null : Math.max(1, Math.round(original * ratio));
  el.targetOut.textContent = target === null ? '—' : `~${formatNumber(target)}`;

  if (state.mode === 'triangles' && original) {
    const reduction = (1 - ratio) * 100;
    el.targetNote.innerHTML = `Estimated reduction <strong>~${reduction.toFixed(1)}%</strong>. The result is approximate — topology and the error limit decide how far a mesh can collapse.`;
  }

  drawDensity(el.densityBefore, 1);
  drawDensity(el.densityAfter, ratio);
}

/**
 * Illustrative density swatch — an explicitly labelled preview of how much
 * coarser the mesh becomes. It is never presented as a measured result.
 */
function drawDensity(canvas, ratio) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const cols = Math.max(2, Math.round(14 * Math.sqrt(ratio)));
  const rows = Math.max(2, Math.round(6 * Math.sqrt(ratio)));
  const cellW = width / cols;
  const cellH = height / rows;

  const styles = getComputedStyle(document.documentElement);
  ctx.strokeStyle = (styles.getPropertyValue('--color-accent') || '#ffb547').trim();
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1;

  ctx.beginPath();
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * cellW;
      const y = r * cellH;
      // two triangles per cell, like a real triangulated quad
      ctx.moveTo(x, y); ctx.lineTo(x + cellW, y); ctx.lineTo(x, y + cellH); ctx.closePath();
      ctx.moveTo(x + cellW, y); ctx.lineTo(x + cellW, y + cellH); ctx.lineTo(x, y + cellH); ctx.closePath();
    }
  }
  ctx.stroke();
}

// -------------------------------------------------------------- reduction

function setProgress(stageName, detail) {
  const index = STAGES.indexOf(stageName);
  const pct = index >= 0 ? Math.round(((index + 1) / STAGES.length) * 100) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressPct.textContent = `${pct}%`;
  el.progressStage.textContent = detail?.name
    ? `${titleCase(stageName)} — ${detail.name} (${detail.mesh}/${detail.total})`
    : titleCase(stageName);
}

const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

async function runReduction() {
  if (state.busy || !state.originalBuffer) return;
  state.busy = true;
  el.run.disabled = true;
  el.runLabel.textContent = 'Reducing…';
  el.progress.classList.remove('hidden');
  hideNotice();

  try {
    // Work on a fresh parse so the original document is never mutated.
    const workingDocument = await readGlb(state.originalBuffer);

    const params = {
      document: workingDocument,
      options: state.advanced,
      onProgress: setProgress,
    };
    if (state.mode === 'triangles') params.targetTriangles = state.targetTriangles;
    else params.ratio = state.keep;

    const result = await reducePolys(params);

    setProgress('VALIDATING');
    const outputBuffer = await exportGlb(result.outputDocument);
    const validation = await validateReduction({
      outputBuffer,
      originalDocument: state.originalDocument,
      originalStats: result.originalStats,
      filename: state.file.name,
    });

    setProgress('COMPLETE');

    state.reducedBuffer = outputBuffer;
    state.reducedStats = validation.stats || result.reducedStats;

    await state.viewer.loadReduced(outputBuffer);
    el.compareSeg.classList.remove('hidden');
    setActiveCompare('side');
    setCompareLayout('side');

    renderResults(result, validation, outputBuffer);
    renderBreakdown(result.meshReports);
  } catch (err) {
    console.error('[ReducePolys] reduction failed', err);
    showNotice(`Reduction failed: ${err?.message || 'unknown error'}`);
    el.progress.classList.add('hidden');
  } finally {
    state.busy = false;
    el.run.disabled = false;
    el.runLabel.textContent = 'Reduce polys';
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
  const triReduction = before.triangleCount
    ? ((before.triangleCount - after.triangleCount) / before.triangleCount) * 100
    : 0;
  const sizeBefore = state.file.size;
  const sizeAfter = outputBuffer.byteLength;
  const sizeChange = ((sizeBefore - sizeAfter) / sizeBefore) * 100;

  el.results.classList.remove('hidden');
  el.headlineNum.textContent = `${triReduction >= 0 ? '−' : '+'}${Math.abs(triReduction).toFixed(1)}%`;

  // Geometry and file size are reported separately on purpose: a 75%
  // triangle cut does not mean a 75% smaller file, because textures and
  // other buffers are untouched by this tool.
  el.resultRows.innerHTML = [
    row('Original', `${formatNumber(before.triangleCount)} triangles`),
    row('Reduced', `${formatNumber(after.triangleCount)} triangles`),
    row('Triangle reduction', `${triReduction.toFixed(1)}%`, true),
    row('Vertices', `${formatNumber(before.vertexCount)} → ${formatNumber(after.vertexCount)}`),
    row('Meshes', `${formatNumber(before.meshCount)} → ${formatNumber(after.meshCount)}`),
    divider('File size is a separate measure — geometry is only part of a GLB.'),
    row('File size', `${formatBytes(sizeBefore)} → ${formatBytes(sizeAfter)}`),
    row(
      'File size change',
      sizeAfter <= sizeBefore ? `${sizeChange.toFixed(1)}% smaller` : `${Math.abs(sizeChange).toFixed(1)}% larger`
    ),
  ].join('');

  const cls = validation.status === 'PASS' ? 'ok' : validation.status === 'WARNING' ? 'warn' : 'fail';
  const failures = validation.checks.filter((c) => c.status !== 'PASS');
  el.validation.innerHTML = `
    <div class="rp-validation-head is-${cls}">
      ${validation.status === 'PASS' ? 'Validation passed' : validation.status === 'WARNING' ? 'Validation warning' : 'Validation failed'}
    </div>
    ${
      failures.length
        ? `<ul class="rp-validation-list">${failures
            .map((c) => `<li class="is-${c.status.toLowerCase()}">${c.message}</li>`)
            .join('')}</ul>`
        : `<p class="rp-validation-note">${validation.checks.length} checks passed, including a full reload in Three.js.</p>`
    }
  `;

  const warnings = [...result.warnings];
  if (sizeAfter > sizeBefore) {
    warnings.push(
      'The GLB got larger even though geometry was reduced. That can happen when the input was compressed and the output is not — the reduced geometry has been kept regardless, because polygon count is the point of this tool.'
    );
  }
  if (currentRatio() <= 0.15) {
    warnings.push('Very aggressive reduction may visibly change the model.');
  }
  el.warnings.innerHTML = warnings.length
    ? warnings.map((w) => `<p class="rp-warning">${w}</p>`).join('')
    : '';
}

const row = (label, value, strong = false) =>
  `<div class="rp-result-row${strong ? ' is-strong' : ''}"><span>${label}</span><strong>${value}</strong></div>`;
const divider = (note) => `<p class="rp-result-note">${note}</p>`;

function renderBreakdown(meshReports) {
  if (!meshReports?.length) return;
  el.breakdownPanel.classList.remove('hidden');
  el.breakdownRows.innerHTML = meshReports
    .map(
      (m) => `
      <tr>
        <td title="${escapeAttr(m.name)}">${m.name}</td>
        <td>${formatNumber(m.before)}</td>
        <td>${formatNumber(m.after)}</td>
        <td>${(m.reduction * 100).toFixed(1)}%</td>
        <td><span class="rp-status is-${m.status.toLowerCase()}" ${m.reason ? `title="${escapeAttr(m.reason)}"` : ''}>${m.status}</span></td>
      </tr>`
    )
    .join('');
}

function downloadResult() {
  if (!state.reducedBuffer) return;
  const base = state.file.name.replace(/\.(glb|gltf)$/i, '');
  downloadArrayBuffer(state.reducedBuffer, `${base}_reduced.glb`);
}

function restart() {
  state.file = null;
  state.originalBuffer = null;
  state.reducedBuffer = null;
  state.originalStats = null;
  state.reducedStats = null;
  state.originalDocument = null;
  state.viewer.original.clear();
  state.viewer.reduced.clear();
  el.stage.classList.add('hidden');
  el.dropzone.classList.remove('hidden');
  el.results.classList.add('hidden');
  el.breakdownPanel.classList.add('hidden');
  el.modelCheck.classList.add('hidden');
  el.compareSeg.classList.add('hidden');
  el.run.disabled = true;
  renderTargetPreview();
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
