import variablesCssUrl from './styles/variables.css?url';
import animationOptimiserCssUrl from './styles/animation-optimiser.css?url';
import toolIdentityCssUrl from '../../shared/components/toolIdentity.css?url';

import { readGlb } from './glb/createIO.js';
import { exportGlb } from './glb/export.js';
import { renderToolIdentity } from '../../shared/components/ToolIdentity.js';
import { downloadArrayBuffer } from './utils/download.js';
import { formatBytes, formatNumber, formatPercent, truncateMiddle } from './utils/formatting.js';
import { HARD_FILE_LIMIT } from './config/limits.js';
import { DEFAULT_PRESET, PRESETS, buildOptions } from './config/presets.js';

import { animationOptimiserMarkup } from './markup.js';
import { optimiseAnimations } from './AnimationOptimiserEngine.js';
import {
  measureAnimations,
  diffMeasurements,
  validateOptimisation,
} from './AnimationOptimiserAnalysis.js';
import { AnimationOptimiserViewer } from './AnimationOptimiserViewer.js';

const SCRUB_RESOLUTION = 1000;
const STAGES = ['READING', 'OPTIMISING', 'EXPORTING', 'VERIFYING', 'COMPLETE'];

function freshState() {
  return {
    file: null,
    originalBuffer: null,
    before: null,
    after: null,
    diff: null,
    engineReport: null,
    validation: null,
    resultBuffer: null,
    viewer: null,
    clipIndex: 0,
    preset: DEFAULT_PRESET,
    busy: false,
    scrubbing: false,
  };
}

let state = freshState();
let el = {};

/**
 * Mounts Animation Optimiser into `container`.
 *
 * A processing tool, unlike the two inspectors: it reads a file, rewrites its
 * animation data and hands back a new GLB. Two decisions shape the wiring
 * below. The optimisation always runs against a *freshly parsed* copy of the
 * upload rather than the document the "before" figures were measured from,
 * so re-running with different settings never compounds a previous pass. And
 * the "after" figures are measured by re-reading the exported bytes, not by
 * trusting the engine's own count — if the export were to lose something, the
 * numbers on screen would show it rather than hide it.
 *
 * @param {HTMLElement} container
 * @returns {() => void} cleanup, called automatically by the router.
 */
export function mount(container) {
  const stylesheets = [variablesCssUrl, animationOptimiserCssUrl, toolIdentityCssUrl].map(injectStylesheet);

  state = freshState();
  container.innerHTML = animationOptimiserMarkup();

  renderToolIdentity(document.getElementById('ao-identity'), {
    mark: 'anim-trim',
    eyebrow: 'Fewer keyframes. Same motion.',
    title: 'Animation',
    accentTitle: 'Optimiser',
    description: 'Reduce keyframes and optimise animation data — right in the browser.',
  });

  el = {
    dropzone: byId('ao-dropzone'),
    file: byId('ao-file'),
    choose: byId('ao-choose'),
    stage: byId('ao-stage'),
    viewport: byId('ao-viewport'),
    hudStats: byId('ao-hud-stats'),
    abHint: byId('ao-ab-hint'),

    play: byId('ao-play'),
    playIcon: byId('ao-play-icon'),
    prevClip: byId('ao-prev-clip'),
    nextClip: byId('ao-next-clip'),
    scrub: byId('ao-scrub'),
    time: byId('ao-time'),
    duration: byId('ao-duration'),
    clipSelect: byId('ao-clip-select'),
    loop: byId('ao-loop'),
    grid: byId('ao-grid'),
    resetCam: byId('ao-reset-cam'),

    settingsPanel: byId('ao-settings-panel'),
    fps: byId('ao-fps'),
    reduce: byId('ao-reduce'),
    collapse: byId('ao-collapse'),
    removeEmpty: byId('ao-remove-empty'),
    run: byId('ao-run'),
    runLabel: byId('ao-run-label'),
    progress: byId('ao-progress'),
    progressFill: byId('ao-progress-fill'),
    progressStage: byId('ao-progress-stage'),
    progressPct: byId('ao-progress-pct'),

    resultsPanel: byId('ao-results-panel'),
    statGrid: byId('ao-stat-grid'),
    clipTable: byId('ao-clip-table'),
    download: byId('ao-download'),
    downloadReport: byId('ao-download-report'),
    checkPanel: byId('ao-check-panel'),
    checkList: byId('ao-check-list'),

    howItWorksPanel: byId('ao-howitworks-panel'),
    infoPanel: byId('ao-info-panel'),
    restartPanel: byId('ao-restart-panel'),
    restart: byId('ao-restart'),

    notice: byId('ao-notice'),
    noticeText: byId('ao-notice-text'),
    noticeClose: byId('ao-notice-close'),
  };

  wireUpload();
  wireTransport();
  wireSettings();
  el.restart.addEventListener('click', restart);
  el.run.addEventListener('click', runOptimise);
  el.download.addEventListener('click', downloadResult);
  el.downloadReport.addEventListener('click', downloadReport);

  state.viewer = new AnimationOptimiserViewer(el.viewport);

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
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
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
    const parsedDocument = await readGlb(buffer);
    const before = measureAnimations(parsedDocument);

    state.file = file;
    state.originalBuffer = buffer;
    state.before = before;

    el.dropzone.classList.add('hidden');
    el.stage.classList.remove('hidden');

    await state.viewer.loadOriginal(buffer);

    el.howItWorksPanel.classList.add('hidden');
    el.infoPanel.classList.add('hidden');
    el.settingsPanel.classList.remove('hidden');
    el.restartPanel.classList.remove('hidden');

    renderClipOptions(before);
    renderHud();
    updateRunButton();

    if (before.clipCount === 0) {
      showNotice(`"${file.name}" loaded, but it contains no animation clips to optimise.`);
    } else {
      selectClip(0);
    }
  } catch (err) {
    showNotice(explainLoadFailure(err, file.name));
    console.error('[AnimationOptimiser] load failed', err);
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

// ------------------------------------------------------------- transport

function wireTransport() {
  el.play.addEventListener('click', () => setPlayIcon(state.viewer.toggle()));
  el.prevClip.addEventListener('click', () => cycleClip(-1));
  el.nextClip.addEventListener('click', () => cycleClip(1));

  el.clipSelect.addEventListener('change', () => selectClip(Number(el.clipSelect.value)));

  el.scrub.addEventListener('input', () => {
    state.scrubbing = true;
    const fraction = Number(el.scrub.value) / SCRUB_RESOLUTION;
    const seconds = fraction * state.viewer.duration;
    state.viewer.setTime(seconds);
    el.time.textContent = `${seconds.toFixed(2)}s`;
  });
  el.scrub.addEventListener('change', () => {
    state.scrubbing = false;
  });

  el.loop.addEventListener('change', () => state.viewer.setLoop(el.loop.checked));

  el.grid.addEventListener('click', () => {
    const next = el.grid.getAttribute('aria-pressed') !== 'true';
    el.grid.setAttribute('aria-pressed', String(next));
    el.grid.classList.toggle('is-active', next);
    state.viewer.setGridVisible(next);
  });
  el.resetCam.addEventListener('click', () => state.viewer.resetCamera());

  document.querySelectorAll('[data-variant]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      if (!state.viewer.showVariant(btn.dataset.variant)) return;
      document
        .querySelectorAll('[data-variant]')
        .forEach((b) => b.classList.toggle('is-active', b === btn));
      setPlayIcon(state.viewer.isPlaying);
      renderHud();
    })
  );
}

function renderClipOptions(measurement) {
  el.clipSelect.innerHTML = measurement.clips
    .map(
      (clip) =>
        `<option value="${clip.index}">${escapeHtml(truncateMiddle(clip.name, 24))} — ${clip.duration.toFixed(
          2
        )}s, ${formatNumber(clip.keyframeCount)} keys</option>`
    )
    .join('');
}

function selectClip(index) {
  state.clipIndex = index;
  el.clipSelect.value = String(index);
  state.viewer.selectClip(index, onPlaybackTick);
  state.viewer.setLoop(el.loop.checked);
  el.duration.textContent = `${state.viewer.duration.toFixed(2)}s`;
  el.time.textContent = '0.00s';
  el.scrub.value = '0';
  setPlayIcon(false);
  renderHud();
}

function cycleClip(direction) {
  const count = state.before?.clipCount ?? 0;
  if (!count) return;
  selectClip((state.clipIndex + direction + count) % count);
}

function onPlaybackTick(time, duration, done) {
  if (state.scrubbing) return;
  const safe = duration > 0 ? duration : 1;
  el.time.textContent = `${time.toFixed(2)}s`;
  el.scrub.value = String(Math.round((time / safe) * SCRUB_RESOLUTION));
  if (done) setPlayIcon(false);
}

function setPlayIcon(isPlaying) {
  el.play.setAttribute('aria-pressed', String(isPlaying));
  el.playIcon.innerHTML = isPlaying
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M17 4v16"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16l14-8L6 4Z"/></svg>';
}

/** Keyframe counts for whichever variant is currently on screen. */
function renderHud() {
  const showingOptimised = state.viewer.active === 'optimised';
  const source = showingOptimised && state.after ? state.after : state.before;
  if (!source) return;

  const clip = source.clips[state.clipIndex] ?? source.clips[0];
  const rows = [
    ['Showing', showingOptimised ? 'Optimised' : 'Original'],
    ['Clip keys', clip ? formatNumber(clip.keyframeCount) : '—'],
    ['Total keys', formatNumber(source.totalKeyframes)],
  ];
  if (state.diff) rows.push(['Saved', formatPercent(state.diff.keyframePercent, 1)]);

  el.hudStats.innerHTML = rows
    .map(([k, v]) => `<div class="ao-hud-row"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');
}

// -------------------------------------------------------------- settings

function wireSettings() {
  document.querySelectorAll('[data-preset]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.preset = btn.dataset.preset;
      document.querySelectorAll('[data-preset]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-checked', String(active));
      });
      invalidateResult();
    })
  );

  [el.fps, el.reduce, el.collapse, el.removeEmpty].forEach((control) =>
    control.addEventListener('change', invalidateResult)
  );
}

/**
 * A result stops describing the controls the moment they change, so it is
 * withdrawn rather than left on screen going quietly stale.
 */
function invalidateResult() {
  if (!state.resultBuffer) {
    updateRunButton();
    return;
  }
  state.resultBuffer = null;
  state.after = null;
  state.diff = null;
  state.validation = null;
  state.engineReport = null;

  state.viewer.clearOptimised();
  document.querySelector('[data-variant="optimised"]').disabled = true;
  document.querySelectorAll('[data-variant]').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.variant === 'original')
  );
  el.resultsPanel.classList.add('hidden');
  el.checkPanel.classList.add('hidden');
  el.abHint.classList.remove('hidden');
  renderHud();
  updateRunButton();
}

function currentOptions() {
  return buildOptions(state.preset, {
    targetFps: el.fps.value ? Number(el.fps.value) : null,
    collapseConstant: el.collapse.checked,
    removeEmptyClips: el.removeEmpty.checked,
    reduceKeyframes: el.reduce.checked,
  });
}

function updateRunButton() {
  const nothingToDo = !el.reduce.checked && !el.collapse.checked && !el.fps.value && !el.removeEmpty.checked;
  el.run.disabled = state.busy || !state.before || state.before.clipCount === 0 || nothingToDo;
  el.runLabel.textContent = nothingToDo ? 'Choose at least one option' : 'Optimise animations';
}

// ------------------------------------------------------------------ run

function setProgress(stage) {
  const index = STAGES.indexOf(stage);
  const pct = index >= 0 ? Math.round(((index + 1) / STAGES.length) * 100) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressPct.textContent = `${pct}%`;
  el.progressStage.textContent = stage.charAt(0) + stage.slice(1).toLowerCase();
}

async function runOptimise() {
  if (state.busy || !state.originalBuffer) return;

  state.busy = true;
  el.run.disabled = true;
  el.progress.classList.remove('hidden');
  hideNotice();
  state.viewer.pause();
  setPlayIcon(false);

  try {
    setProgress('READING');
    // A fresh parse every run: re-optimising must start from the upload, not
    // from the output of the previous pass.
    const workingDocument = await readGlb(state.originalBuffer);
    await nextFrame();

    setProgress('OPTIMISING');
    const options = currentOptions();
    const engineReport = await optimiseAnimations(workingDocument, options);
    await nextFrame();

    setProgress('EXPORTING');
    const outputBuffer = await exportGlb(workingDocument);
    await nextFrame();

    setProgress('VERIFYING');
    // Measured from the exported bytes, so the figures shown describe the
    // file the user will actually download.
    const verifiedDocument = await readGlb(outputBuffer);
    const after = measureAnimations(verifiedDocument);
    const diff = diffMeasurements(state.before, after);
    const validation = validateOptimisation({
      before: state.before,
      after,
      removeEmptyClips: options.removeEmptyClips,
    });

    setProgress('COMPLETE');

    state.resultBuffer = outputBuffer;
    state.after = after;
    state.diff = diff;
    state.validation = validation;
    state.engineReport = engineReport;

    await state.viewer.loadOptimised(outputBuffer);
    document.querySelector('[data-variant="optimised"]').disabled = false;
    el.abHint.classList.add('hidden');

    renderResults(diff, outputBuffer);
    renderChecks(validation.items);
    renderHud();
  } catch (err) {
    console.error('[AnimationOptimiser] optimise failed', err);
    showNotice(`Optimising failed: ${err?.message || 'unknown error'}`);
    el.progress.classList.add('hidden');
  } finally {
    state.busy = false;
    updateRunButton();
    setTimeout(() => el.progress.classList.add('hidden'), 1200);
  }
}

/** Yields to the renderer so the progress bar actually paints between stages. */
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// -------------------------------------------------------------- results

function renderResults(diff, outputBuffer) {
  el.resultsPanel.classList.remove('hidden');

  const sizeBefore = state.file?.size ?? 0;
  const sizeAfter = outputBuffer.byteLength;
  const sizeSaved = sizeBefore - sizeAfter;
  const sizePercent = sizeBefore > 0 ? (sizeSaved / sizeBefore) * 100 : 0;

  const tiles = [
    {
      label: 'Keyframes',
      value: formatNumber(diff.keyframesAfter),
      sub: `from ${formatNumber(diff.keyframesBefore)}`,
      state: diff.keyframesSaved > 0 ? 'good' : null,
    },
    {
      label: 'Keys removed',
      value: formatPercent(diff.keyframePercent, 1),
      sub: `${formatNumber(diff.keyframesSaved)} keys`,
      state: diff.keyframePercent > 0 ? 'good' : null,
    },
    {
      label: 'File size',
      value: formatBytes(sizeAfter),
      sub: `from ${formatBytes(sizeBefore)}`,
      state: sizeSaved > 0 ? 'good' : sizeSaved < 0 ? 'warn' : null,
    },
    {
      label: 'Size saved',
      value: formatPercent(sizePercent, 1),
      sub: sizeSaved >= 0 ? formatBytes(sizeSaved) : `+${formatBytes(-sizeSaved)}`,
      state: sizeSaved > 0 ? 'good' : sizeSaved < 0 ? 'warn' : null,
    },
    { label: 'Clips', value: formatNumber(diff.clipsAfter), sub: `from ${formatNumber(diff.clipsBefore)}` },
    {
      label: 'Channels',
      value: formatNumber(diff.channelsAfter),
      sub: `from ${formatNumber(diff.channelsBefore)}`,
    },
  ];

  el.statGrid.innerHTML = tiles
    .map(
      (tile) => `
      <div class="ao-stat-tile${tile.state ? ` is-${tile.state}` : ''}">
        <div class="ao-stat-value">${tile.value}</div>
        <div class="ao-stat-label">${tile.label}</div>
        ${tile.sub ? `<div class="ao-stat-sub">${tile.sub}</div>` : ''}
      </div>`
    )
    .join('');

  el.clipTable.innerHTML = `
    <div class="ao-clip-row ao-clip-row--head">
      <span>Clip</span><span>Before</span><span>After</span><span>Saved</span>
    </div>
    ${diff.rows
      .map(
        (row) => `
      <div class="ao-clip-row${row.removed ? ' is-removed' : ''}">
        <span class="ao-clip-name" title="${escapeAttr(row.name)}">${escapeHtml(
          truncateMiddle(row.name, 18)
        )}</span>
        <span>${formatNumber(row.keyframesBefore)}</span>
        <span>${row.removed ? '—' : formatNumber(row.keyframesAfter)}</span>
        <span class="${row.savedPercent > 0 ? 'ao-saved' : ''}">${
          row.removed ? 'removed' : formatPercent(row.savedPercent, 0)
        }</span>
      </div>`
      )
      .join('')}
  `;
}

function renderChecks(items) {
  el.checkPanel.classList.remove('hidden');
  el.checkList.innerHTML = items
    .map(
      (item) => `<li class="ao-check is-${item.level}"><span class="ao-check-mark">${
        item.level === 'ok' ? '✓' : item.level === 'warn' ? '!' : '×'
      }</span><span>${escapeHtml(item.text)}</span></li>`
    )
    .join('');
}

// ------------------------------------------------------------- downloads

function downloadResult() {
  if (!state.resultBuffer) return;
  const base = (state.file?.name || 'model').replace(/\.(glb|gltf)$/i, '');
  downloadArrayBuffer(state.resultBuffer, `${base}_optimised.glb`);
}

function downloadReport() {
  if (!state.diff) return;
  const options = currentOptions();
  const report = {
    filename: state.file?.name ?? null,
    generatedAt: new Date().toISOString(),
    generatedBy: 'Asset Bench — Animation Optimiser',
    settings: {
      preset: state.preset,
      presetLabel: PRESETS[state.preset]?.label ?? state.preset,
      positionToleranceMetres: options.positionTolerance,
      rotationToleranceDegrees: (options.rotationTolerance * 180) / Math.PI,
      scaleTolerance: options.scaleTolerance,
      targetFps: options.targetFps,
      reduceKeyframes: options.reduceKeyframes,
      collapseConstantChannels: options.collapseConstant,
      removeEmptyClips: options.removeEmptyClips,
    },
    totals: {
      keyframesBefore: state.diff.keyframesBefore,
      keyframesAfter: state.diff.keyframesAfter,
      keyframesSaved: state.diff.keyframesSaved,
      keyframePercent: Number(state.diff.keyframePercent.toFixed(2)),
      channelsBefore: state.diff.channelsBefore,
      channelsAfter: state.diff.channelsAfter,
      clipsBefore: state.diff.clipsBefore,
      clipsAfter: state.diff.clipsAfter,
      bytesBefore: state.file?.size ?? null,
      bytesAfter: state.resultBuffer?.byteLength ?? null,
      constantChannelsCollapsed: state.engineReport?.constantChannelsCollapsed ?? 0,
      channelsResampled: state.engineReport?.resampledChannels ?? 0,
      cubicSplineChannelsBaked: state.engineReport?.cubicBaked ?? 0,
    },
    checks: state.validation?.items ?? [],
    clips: state.diff.rows.map((row) => ({
      name: row.name,
      removed: row.removed,
      durationBefore: Number(row.duration.toFixed(4)),
      durationAfter: Number(row.durationAfter.toFixed(4)),
      keyframesBefore: row.keyframesBefore,
      keyframesAfter: row.keyframesAfter,
      channelsBefore: row.channelsBefore,
      channelsAfter: row.channelsAfter,
      frameRateBefore: row.frameRateBefore ? Number(row.frameRateBefore.toFixed(2)) : null,
      frameRateAfter: row.frameRateAfter ? Number(row.frameRateAfter.toFixed(2)) : null,
      savedPercent: Number(row.savedPercent.toFixed(2)),
    })),
  };

  const base = (state.file?.name || 'model').replace(/\.(glb|gltf)$/i, '');
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}_animation-optimiser-report.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ----------------------------------------------------------------- misc

function restart() {
  state.viewer.clear();

  const keptViewer = state.viewer;
  state = freshState();
  state.viewer = keptViewer;

  el.stage.classList.add('hidden');
  el.dropzone.classList.remove('hidden');
  el.settingsPanel.classList.add('hidden');
  el.resultsPanel.classList.add('hidden');
  el.checkPanel.classList.add('hidden');
  el.restartPanel.classList.add('hidden');
  el.howItWorksPanel.classList.remove('hidden');
  el.infoPanel.classList.remove('hidden');
  el.abHint.classList.remove('hidden');

  document.querySelector('[data-variant="optimised"]').disabled = true;
  document.querySelectorAll('[data-variant]').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.variant === 'original')
  );

  el.clipSelect.innerHTML = '';
  el.scrub.value = '0';
  el.time.textContent = '0.00s';
  el.duration.textContent = '0.00s';
  setPlayIcon(false);
  hideNotice();
}

function showNotice(message) {
  el.noticeText.textContent = message;
  el.notice.classList.remove('hidden');
}
function hideNotice() {
  el.notice.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
