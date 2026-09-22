import variablesCssUrl from './styles/variables.css?url';
import stripAnimationsCssUrl from './styles/strip-animations.css?url';
import toolIdentityCssUrl from '../../shared/components/toolIdentity.css?url';

import { readGlb } from './glb/createIO.js';
import { exportGlb } from './glb/export.js';
import { renderToolIdentity } from '../../shared/components/ToolIdentity.js';
import { downloadArrayBuffer } from './utils/download.js';
import { formatBytes, formatNumber } from './utils/formatting.js';
import { HARD_FILE_LIMIT } from './config/limits.js';

import { stripAnimationsMarkup } from './markup.js';
import { analyseAnimations, PATH_LABELS } from './StripAnimationsAnalysis.js';
import { stripAnimations } from './StripAnimationsEngine.js';
import { validateStrip } from './StripAnimationsValidation.js';
import { StripAnimationsViewer } from './StripAnimationsViewer.js';
import { triggerSuccessBurst } from '../../shared/effects/SuccessBurst.js';
import { countUp } from '../../shared/effects/CountUp.js';

function freshState() {
  return {
    file: null,
    originalBuffer: null,
    originalDocument: null,
    analysis: null,
    /** clip index -> 'keep' | 'remove' */
    clipStatus: new Map(),
    filter: 'all',
    search: '',
    selectedIndex: null,
    playingIndex: null,
    busy: false,
    viewer: null,
    resultBuffer: null,
    resultValidation: null,
    resultRemovedNames: [],
    resultPreservedNames: [],
  };
}

let state = freshState();
let el = {};

/**
 * Mounts Strip Animations into `container`.
 * @param {HTMLElement} container
 * @returns {() => void} cleanup, called automatically by the router before
 *   the next navigation.
 */
export function mount(container) {
  const stylesheets = [variablesCssUrl, stripAnimationsCssUrl, toolIdentityCssUrl].map(injectStylesheet);

  state = freshState();
  container.innerHTML = stripAnimationsMarkup();

  renderToolIdentity(document.getElementById('sa-identity'), {
    mark: 'strip-clip',
    eyebrow: 'Inspect, preview, remove',
    title: 'Strip',
    accentTitle: 'Animations',
    description: 'Remove unwanted animation clips. Keep the rig intact.',
  });

  el = {
    dropzone: byId('sa-dropzone'),
    file: byId('sa-file'),
    choose: byId('sa-choose'),
    stage: byId('sa-stage'),
    viewport: byId('sa-viewport'),
    hudTitle: byId('sa-hud-title'),
    hudStats: byId('sa-hud-stats'),
    grid: byId('sa-grid'),
    resetCam: byId('sa-reset-cam'),

    playPause: byId('sa-play-pause'),
    playIcon: byId('sa-play-icon'),
    stop: byId('sa-stop'),
    loop: byId('sa-loop'),
    speed: byId('sa-speed'),
    transportTime: byId('sa-transport-time'),
    timeline: byId('sa-timeline'),
    timelineTrack: byId('sa-timeline-track'),
    timelineFill: byId('sa-timeline-fill'),
    timelineDensity: byId('sa-timeline-density'),
    timelineStart: byId('sa-timeline-start'),
    timelineEnd: byId('sa-timeline-end'),

    search: byId('sa-search'),
    filters: document.querySelectorAll('[data-filter]'),
    keepAll: byId('sa-keep-all'),
    removeAll: byId('sa-remove-all'),
    invert: byId('sa-invert'),
    summaryKeep: byId('sa-summary-keep'),
    summaryRemove: byId('sa-summary-remove'),
    summaryKeyframes: byId('sa-summary-keyframes'),
    clipList: byId('sa-clip-list'),

    detailsPanel: byId('sa-details-panel'),
    detailsTitle: byId('sa-details-title'),
    detailsGrid: byId('sa-details-grid'),

    modelCheck: byId('sa-model-check'),
    checkList: byId('sa-check-list'),

    modelInfoPanel: byId('sa-model-info-panel'),
    modelInfo: byId('sa-model-info'),

    run: byId('sa-run'),
    runLabel: byId('sa-run-label'),
    progress: byId('sa-progress'),
    progressFill: byId('sa-progress-fill'),
    progressStage: byId('sa-progress-stage'),
    progressPct: byId('sa-progress-pct'),

    results: byId('sa-results'),
    headlineNum: byId('sa-headline-num'),
    resultRows: byId('sa-result-rows'),
    removedList: byId('sa-removed-list'),
    preservedList: byId('sa-preserved-list'),
    validation: byId('sa-validation'),
    warnings: byId('sa-warnings'),
    download: byId('sa-download'),
    restart: byId('sa-restart'),

    notice: byId('sa-notice'),
    noticeText: byId('sa-notice-text'),
    noticeClose: byId('sa-notice-close'),
  };

  wireUpload();
  wireFilters();
  wireQuickActions();
  wireTransport();
  wireViewerBar();
  wireActions();

  state.viewer = new StripAnimationsViewer(el.viewport);

  return () => {
    stopPlayback();
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
    const analysis = analyseAnimations(document_);

    if (analysis.clipCount === 0) {
      return showNotice(`"${file.name}" contains no animation clips — there is nothing to strip.`);
    }

    state.file = file;
    state.originalBuffer = buffer;
    state.originalDocument = document_;
    state.analysis = analysis;
    state.clipStatus = new Map(analysis.clips.map((c) => [c.index, 'keep']));
    state.selectedIndex = null;
    state.resultBuffer = null;
    state.resultValidation = null;

    el.dropzone.classList.add('hidden');
    el.stage.classList.remove('hidden');
    el.results.classList.add('hidden');
    el.detailsPanel.classList.add('hidden');
    disableTransport();

    await state.viewer.load(buffer);
    renderHud();
    renderModelCheck();
    renderModelInfo();
    renderClipList();
    renderSummary();
    updateRunButton();
  } catch (err) {
    showNotice(explainLoadFailure(err, file.name));
    console.error('[StripAnimations] load failed', err);
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

// ------------------------------------------------------------------ HUD

function renderHud() {
  const m = state.analysis.model;
  el.hudTitle.textContent = 'MODEL';
  const rows = [
    ['Animations', formatNumber(m.animationCount)],
    ['Keyframes', formatNumber(m.totalKeyframes)],
    ['Bones', formatNumber(m.boneCount)],
    ['Meshes', formatNumber(m.meshCount)],
  ];
  el.hudStats.innerHTML = rows
    .map(([k, v]) => `<div class="sa-hud-row"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');
}

function renderModelCheck() {
  const { clips } = state.analysis;
  const items = [];

  const duplicateCount = clips.filter((c) => c.warnings.some((w) => w.level === 'duplicate')).length;
  if (duplicateCount) {
    items.push({ level: 'warn', text: `${duplicateCount} clip(s) share a name with another clip — check indices, not names, before removing.` });
  } else {
    items.push({ level: 'ok', text: 'No duplicate clip names detected.' });
  }

  const emptyCount = clips.filter((c) => c.isEmpty).length;
  if (emptyCount) {
    items.push({ level: 'warn', text: `${emptyCount} clip(s) have no usable keyframes and do nothing on the model.` });
  }

  const morphCount = clips.filter((c) => c.isMorphAnimation).length;
  if (morphCount) {
    items.push({ level: 'ok', text: `${morphCount} clip(s) animate morph targets. Removing them will not delete the morph targets themselves — only their animation data.` });
  }

  if (state.analysis.model.boneCount > 0) {
    items.push({ level: 'ok', text: `${state.analysis.model.boneCount} bone(s) will be preserved regardless of which clips are removed.` });
  }

  el.modelCheck.classList.remove('hidden');
  el.checkList.innerHTML = items
    .map(
      (item) => `<li class="sa-check is-${item.level}"><span class="sa-check-mark">${
        item.level === 'ok' ? '✓' : '!'
      }</span><span>${item.text}</span></li>`
    )
    .join('');
}

function renderModelInfo() {
  const m = state.analysis.model;
  el.modelInfoPanel.classList.remove('hidden');
  el.modelInfo.innerHTML = `
    <div class="sa-model-filename" title="${escapeAttr(state.file.name)}" style="grid-column:1 / -1">${escapeHtml(state.file.name)}</div>
    ${infoRow('File size', formatBytes(state.file.size))}
    ${infoRow('Animations', formatNumber(m.animationCount))}
    ${infoRow('Total keyframes', formatNumber(m.totalKeyframes))}
    ${infoRow('Skins', formatNumber(m.skinCount))}
    ${infoRow('Bones', formatNumber(m.boneCount))}
    ${infoRow('Meshes', formatNumber(m.meshCount))}
    ${infoRow('Materials', formatNumber(m.materialCount))}
  `;
}

const infoRow = (label, value) => `<div class="sa-model-info-row"><dt>${label}</dt><dd>${value}</dd></div>`;

// -------------------------------------------------------------- clip list

function filteredClips() {
  const q = state.search.trim().toLowerCase();
  return state.analysis.clips.filter((clip) => {
    const status = state.clipStatus.get(clip.index);
    if (state.filter !== 'all' && status !== state.filter) return false;
    if (q && !clip.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderClipList() {
  const clips = filteredClips();
  if (clips.length === 0) {
    el.clipList.innerHTML = `<p class="sa-clip-empty">No clips match the current filter.</p>`;
    return;
  }

  el.clipList.innerHTML = clips.map((clip) => clipRowHtml(clip)).join('');

  el.clipList.querySelectorAll('.sa-clip-row').forEach((row) => {
    const index = Number(row.dataset.index);
    row.addEventListener('click', (e) => {
      if (e.target.closest('.sa-clip-toggle') || e.target.closest('.sa-clip-play')) return;
      selectClip(index);
    });
    row.querySelector('.sa-clip-play').addEventListener('click', (e) => {
      e.stopPropagation();
      selectClip(index);
      togglePlayback(index);
    });
    row.querySelectorAll('.sa-clip-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setClipStatus(index, btn.dataset.status);
      });
    });
  });
}

function clipRowHtml(clip) {
  const status = state.clipStatus.get(clip.index);
  const selected = state.selectedIndex === clip.index;
  const isPlaying = state.playingIndex === clip.index && state.viewer.isPlaying;

  const badges = [];
  if (clip.warnings.some((w) => w.level === 'duplicate')) badges.push(`<span class="sa-clip-flag" title="Duplicate name">Duplicate</span>`);
  if (clip.isEmpty) badges.push(`<span class="sa-clip-flag" title="No usable keyframes">Empty</span>`);
  if (clip.isMorphAnimation) badges.push(`<span class="sa-clip-flag is-morph" title="Animates morph targets">Morph</span>`);

  return `
    <div class="sa-clip-row${selected ? ' is-selected' : ''}${status === 'remove' ? ' is-marked-remove' : ''}" data-index="${clip.index}">
      <button class="sa-clip-play" type="button" title="${isPlaying ? 'Pause' : 'Play'} preview" aria-label="Preview ${escapeAttr(clip.name)}">
        ${isPlaying
          ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4v16l14-8L6 4Z"/></svg>'}
      </button>
      <div class="sa-clip-main">
        <div class="sa-clip-name-row">
          <span class="sa-clip-name" title="${escapeAttr(clip.name)}">${escapeHtml(clip.name)}</span>
          ${badges.join('')}
        </div>
        <div class="sa-clip-meta">
          <span>${clip.duration.toFixed(2)}s</span>
          <span>${formatNumber(clip.trackCount)} tracks</span>
          <span>${formatNumber(clip.keyframeCount)} keys</span>
        </div>
      </div>
      <div class="sa-clip-toggle" role="group" aria-label="Keep or remove ${escapeAttr(clip.name)}">
        <button class="sa-clip-toggle-btn is-keep${status === 'keep' ? ' is-active' : ''}" data-status="keep" type="button">Keep</button>
        <button class="sa-clip-toggle-btn is-remove${status === 'remove' ? ' is-active' : ''}" data-status="remove" type="button">Remove</button>
      </div>
    </div>`;
}

function setClipStatus(index, status) {
  state.clipStatus.set(index, status);
  renderClipList();
  renderSummary();
  updateRunButton();
}

function renderSummary() {
  const clips = state.analysis.clips;
  const removing = clips.filter((c) => state.clipStatus.get(c.index) === 'remove');
  const keeping = clips.length - removing.length;
  const keyframes = removing.reduce((sum, c) => sum + c.keyframeCount, 0);

  el.summaryKeep.textContent = formatNumber(keeping);
  el.summaryRemove.textContent = formatNumber(removing.length);
  el.summaryKeyframes.textContent = formatNumber(keyframes);
}

function updateRunButton() {
  const removingCount = [...state.clipStatus.values()].filter((s) => s === 'remove').length;
  el.run.disabled = state.busy || !state.analysis || removingCount === 0;
  el.runLabel.textContent = removingCount === 0
    ? 'Remove selected animations'
    : `Remove ${removingCount} animation${removingCount === 1 ? '' : 's'}`;
}

// ------------------------------------------------------------------ selection & details

function selectClip(index) {
  state.selectedIndex = index;
  renderClipList();
  renderDetails();
}

function renderDetails() {
  const clip = state.analysis.clips.find((c) => c.index === state.selectedIndex);
  if (!clip) {
    el.detailsPanel.classList.add('hidden');
    return;
  }

  el.detailsPanel.classList.remove('hidden');
  el.detailsTitle.textContent = clip.name;

  const items = [
    ['Duration', `${clip.duration.toFixed(3)}s`],
    ['Tracks', formatNumber(clip.trackCount)],
    ['Keyframes', formatNumber(clip.keyframeCount)],
    ['Animated nodes', formatNumber(clip.animatedNodeCount)],
    ['Position tracks', formatNumber(clip.positionTracks)],
    ['Rotation tracks', formatNumber(clip.rotationTracks)],
    ['Scale tracks', formatNumber(clip.scaleTracks)],
    ['Morph tracks', formatNumber(clip.morphTracks)],
    ['Interpolation', clip.interpolations.length ? clip.interpolations.join(', ') : '—'],
    ['Index', `#${clip.index}`],
  ];
  el.detailsGrid.innerHTML = items
    .map(([cap, val]) => `<div class="sa-details-item"><span class="sa-details-cap">${cap}</span><span class="sa-details-val">${val}</span></div>`)
    .join('');

  drawTimelineDensity(clip);
  el.timelineEnd.textContent = `${clip.duration.toFixed(2)}s`;
  el.timelineStart.textContent = '0.00s';
  el.timelineFill.style.width = '0%';

  enableTransport();
  el.transportTime.textContent = `0.00s / ${clip.duration.toFixed(2)}s`;
}

function drawTimelineDensity(clip) {
  const canvas = el.timelineDensity;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (clip.duration <= 0) return;

  const styles = getComputedStyle(document.documentElement);
  ctx.strokeStyle = (styles.getPropertyValue('--color-accent') || '#ffb547').trim();
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1;
  ctx.beginPath();

  // One tick per keyframe time across all tracks — capped so very dense
  // clips (100k+ keyframes) still draw as a single fast path, not one
  // canvas op per sample.
  const times = [];
  for (const channel of clip.animation.listChannels()) {
    const input = channel.getSampler()?.getInput();
    const array = input?.getArray();
    if (!array) continue;
    for (let i = 0; i < array.length; i += 1) times.push(array[i]);
  }
  const step = Math.max(1, Math.floor(times.length / 2000));
  for (let i = 0; i < times.length; i += step) {
    const x = (times[i] / clip.duration) * width;
    ctx.moveTo(x, 4);
    ctx.lineTo(x, height - 4);
  }
  ctx.stroke();
}

// ------------------------------------------------------------------ filters

function wireFilters() {
  el.filters.forEach((btn) =>
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      el.filters.forEach((b) => b.classList.toggle('is-active', b === btn));
      renderClipList();
    })
  );

  el.search.addEventListener('input', () => {
    state.search = el.search.value;
    renderClipList();
  });
}

function wireQuickActions() {
  el.keepAll.addEventListener('click', () => {
    if (!state.analysis) return;
    for (const clip of state.analysis.clips) state.clipStatus.set(clip.index, 'keep');
    renderClipList();
    renderSummary();
    updateRunButton();
  });

  el.removeAll.addEventListener('click', () => {
    if (!state.analysis) return;
    if (!window.confirm(`Mark all ${state.analysis.clipCount} animation clip(s) for removal? The model will end up with no animations unless you change this before running.`)) {
      return;
    }
    for (const clip of state.analysis.clips) state.clipStatus.set(clip.index, 'remove');
    renderClipList();
    renderSummary();
    updateRunButton();
  });

  el.invert.addEventListener('click', () => {
    if (!state.analysis) return;
    for (const clip of state.analysis.clips) {
      const current = state.clipStatus.get(clip.index);
      state.clipStatus.set(clip.index, current === 'remove' ? 'keep' : 'remove');
    }
    renderClipList();
    renderSummary();
    updateRunButton();
  });
}

// ------------------------------------------------------------------ playback

function togglePlayback(index) {
  if (state.playingIndex === index && state.viewer.isPlaying) {
    state.viewer.pause();
    el.playIcon.parentElement.innerHTML = playIconSvg();
    renderClipList();
    return;
  }
  if (state.playingIndex === index) {
    state.viewer.resume();
    setPlayIcon(true);
    renderClipList();
    return;
  }

  state.playingIndex = index;
  const started = state.viewer.play(index, (time, duration, done) => {
    const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
    el.timelineFill.style.width = `${pct}%`;
    el.transportTime.textContent = `${time.toFixed(2)}s / ${duration.toFixed(2)}s`;
    if (done) {
      setPlayIcon(false);
      renderClipList();
    }
  });
  if (started) {
    setPlayIcon(true);
    renderClipList();
  }
}

function setPlayIcon(isPlaying) {
  el.playPause.innerHTML = isPlaying ? pauseIconSvg() : playIconSvg();
}
const playIconSvg = () => '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M5 3v18l15-9L5 3Z"/></svg>';
const pauseIconSvg = () => '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

function stopPlayback() {
  state.viewer?.stop();
  state.playingIndex = null;
}

function wireTransport() {
  el.playPause.addEventListener('click', () => {
    if (state.selectedIndex === null) return;
    togglePlayback(state.selectedIndex);
  });

  el.stop.addEventListener('click', () => {
    stopPlayback();
    setPlayIcon(false);
    el.timelineFill.style.width = '0%';
    const clip = state.analysis?.clips.find((c) => c.index === state.selectedIndex);
    if (clip) el.transportTime.textContent = `0.00s / ${clip.duration.toFixed(2)}s`;
    renderClipList();
  });

  el.loop.addEventListener('click', () => {
    const next = el.loop.getAttribute('aria-pressed') !== 'true';
    el.loop.setAttribute('aria-pressed', String(next));
    el.loop.classList.toggle('is-active', next);
    state.viewer.setLoop(next);
  });

  el.speed.addEventListener('change', () => {
    state.viewer.setSpeed(Number(el.speed.value));
  });

  el.timelineTrack.addEventListener('click', (e) => {
    const clip = state.analysis?.clips.find((c) => c.index === state.selectedIndex);
    if (!clip || state.playingIndex !== clip.index) return;
    const rect = el.timelineTrack.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * clip.duration;
    state.viewer.setTime(time);
    el.timelineFill.style.width = `${pct * 100}%`;
    el.transportTime.textContent = `${time.toFixed(2)}s / ${clip.duration.toFixed(2)}s`;
  });
}

function enableTransport() {
  el.playPause.disabled = false;
  el.stop.disabled = false;
  el.loop.disabled = false;
  el.speed.disabled = false;
}
function disableTransport() {
  el.playPause.disabled = true;
  el.stop.disabled = true;
  el.loop.disabled = true;
  el.speed.disabled = true;
  el.timelineFill.style.width = '0%';
  el.transportTime.textContent = 'No clip selected';
  setPlayIcon(false);
}

// ------------------------------------------------------------- viewer bar

function wireViewerBar() {
  document.querySelectorAll('[data-shade]').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-shade]').forEach((b) => b.classList.toggle('is-active', b === btn));
      state.viewer.setWireframeMode(btn.dataset.shade);
    })
  );

  el.grid.addEventListener('click', () => {
    const next = el.grid.getAttribute('aria-pressed') !== 'true';
    el.grid.setAttribute('aria-pressed', String(next));
    el.grid.classList.toggle('is-active', next);
    state.viewer.setGridVisible(next);
  });

  el.resetCam.addEventListener('click', () => state.viewer.resetCamera());
}

// -------------------------------------------------------------- strip & validate

function wireActions() {
  el.run.addEventListener('click', runStrip);
  el.download.addEventListener('click', downloadResult);
  el.restart.addEventListener('click', restart);
}

const STAGES = ['REMOVING CLIPS', 'REBUILDING', 'VALIDATING', 'COMPLETE'];
function setProgress(stageName) {
  const index = STAGES.indexOf(stageName);
  const pct = index >= 0 ? Math.round(((index + 1) / STAGES.length) * 100) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressPct.textContent = `${pct}%`;
  el.progressStage.textContent = stageName.charAt(0) + stageName.slice(1).toLowerCase();
}

async function runStrip() {
  if (state.busy || !state.originalBuffer) return;

  const removeIndices = state.analysis.clips
    .filter((c) => state.clipStatus.get(c.index) === 'remove')
    .map((c) => c.index);
  if (removeIndices.length === 0) return;

  if (removeIndices.length === state.analysis.clipCount) {
    const proceed = window.confirm(
      `This will remove all ${state.analysis.clipCount} animation clip(s). The exported model will have no animations, though its rig (skeleton, bones, skin) is preserved. Continue?`
    );
    if (!proceed) return;
  }

  state.busy = true;
  el.run.disabled = true;
  el.progress.classList.remove('hidden');
  hideNotice();
  stopPlayback();

  try {
    setProgress('REMOVING CLIPS');
    // Work on a fresh parse so the original document (and its analysis,
    // still used for names/counts) is never mutated.
    const workingDocument = await readGlb(state.originalBuffer);

    const keptNames = state.analysis.clips
      .filter((c) => !removeIndices.includes(c.index))
      .map((c) => c.name);
    const removedNames = state.analysis.clips
      .filter((c) => removeIndices.includes(c.index))
      .map((c) => c.name);

    setProgress('REBUILDING');
    await stripAnimations(workingDocument, removeIndices);

    const outputBuffer = await exportGlb(workingDocument);

    setProgress('VALIDATING');
    const validation = await validateStrip({
      outputBuffer,
      originalAnalysis: state.analysis,
      expectedKeptNames: keptNames,
      expectedRemovedCount: removeIndices.length,
      filename: state.file.name,
    });

    setProgress('COMPLETE');

    state.resultBuffer = outputBuffer;
    state.resultValidation = validation;
    state.resultRemovedNames = removedNames;
    state.resultPreservedNames = keptNames;

    renderResults(removeIndices.length, outputBuffer, validation);
  } catch (err) {
    console.error('[StripAnimations] strip failed', err);
    showNotice(`Removing animations failed: ${err?.message || 'unknown error'}`);
    el.progress.classList.add('hidden');
  } finally {
    state.busy = false;
    updateRunButton();
    setTimeout(() => el.progress.classList.add('hidden'), 1200);
  }
}

function renderResults(removedCount, outputBuffer, validation) {
  el.results.classList.remove('hidden');
  countUp(el.headlineNum, 0, removedCount, { duration: 500 });

  if (validation.status === 'PASS') {
    triggerSuccessBurst({ origin: el.viewport });
  }

  const sizeBefore = state.file.size;
  const sizeAfter = outputBuffer.byteLength;
  const before = state.analysis;
  const after = validation.stats;

  el.resultRows.innerHTML = [
    row('Animations', `${formatNumber(before.clipCount)} → ${formatNumber(after.clipCount)}`),
    row('Keyframes', `${formatNumber(before.totalKeyframes)} → ${formatNumber(after.totalKeyframes)}`),
    row('Bones', `${formatNumber(before.model.boneCount)} → ${formatNumber(after.model.boneCount)}`, true),
    row('Meshes', `${formatNumber(before.model.meshCount)} → ${formatNumber(after.model.meshCount)}`),
    row('File size', `${formatBytes(sizeBefore)} → ${formatBytes(sizeAfter)}`),
  ].join('');

  el.removedList.innerHTML = state.resultRemovedNames.length
    ? `<span class="sa-details-cap" style="width:100%">Removed</span>` + state.resultRemovedNames.map((n) => `<span class="sa-pill is-removed">${escapeHtml(n)}</span>`).join('')
    : '';
  el.preservedList.innerHTML = state.resultPreservedNames.length
    ? `<span class="sa-details-cap" style="width:100%">Preserved</span>` + state.resultPreservedNames.map((n) => `<span class="sa-pill is-preserved">${escapeHtml(n)}</span>`).join('')
    : '<p class="sa-clip-empty" style="padding:var(--space-2) 0">No animation clips remain in the output.</p>';

  const cls = validation.status === 'PASS' ? 'ok' : validation.status === 'WARNING' ? 'warn' : 'fail';
  const failures = validation.checks.filter((c) => c.status !== 'PASS');
  el.validation.innerHTML = `
    <div class="sa-validation-head is-${cls}">
      ${validation.status === 'PASS' ? 'Validation passed' : validation.status === 'WARNING' ? 'Validation warning' : 'Validation failed'}
    </div>
    ${
      failures.length
        ? `<ul class="sa-validation-list">${failures.map((c) => `<li class="is-${c.status.toLowerCase()}">${c.message}</li>`).join('')}</ul>`
        : `<p class="sa-validation-note">${validation.checks.length} checks passed, including a full reload in Three.js.</p>`
    }
  `;
  el.warnings.innerHTML = '';
}

const row = (label, value, strong = false) =>
  `<div class="sa-result-row${strong ? ' is-strong' : ''}"><span>${label}</span><strong>${value}</strong></div>`;

function downloadResult() {
  if (!state.resultBuffer) return;
  const base = state.file.name.replace(/\.(glb|gltf)$/i, '');
  downloadArrayBuffer(state.resultBuffer, `${base}_stripped.glb`);
}

function restart() {
  stopPlayback();
  state.file = null;
  state.originalBuffer = null;
  state.originalDocument = null;
  state.analysis = null;
  state.clipStatus = new Map();
  state.selectedIndex = null;
  state.resultBuffer = null;
  state.viewer.clear();

  el.stage.classList.add('hidden');
  el.dropzone.classList.remove('hidden');
  el.results.classList.add('hidden');
  el.detailsPanel.classList.add('hidden');
  el.modelCheck.classList.add('hidden');
  el.modelInfoPanel.classList.add('hidden');
  el.clipList.innerHTML = `<p class="sa-clip-empty">Upload a model to see its animation clips.</p>`;
  disableTransport();
  el.run.disabled = true;
  el.runLabel.textContent = 'Remove selected animations';
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
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { PATH_LABELS };
