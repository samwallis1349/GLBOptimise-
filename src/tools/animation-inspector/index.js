import variablesCssUrl from './styles/variables.css?url';
import animationInspectorCssUrl from './styles/animation-inspector.css?url';
import toolIdentityCssUrl from '../../shared/components/toolIdentity.css?url';

import { readGlb } from './glb/createIO.js';
import { renderToolIdentity } from '../../shared/components/ToolIdentity.js';
import { downloadJson } from './utils/download.js';
import { formatBytes, formatNumber, truncateMiddle } from './utils/formatting.js';
import { HARD_FILE_LIMIT } from './config/limits.js';

import { animationInspectorMarkup } from './markup.js';
import { analyseAnimations, buildAnimationChecks, PATH_META } from './AnimationAnalysis.js';
import { AnimationViewer } from './AnimationViewer.js';
import { CurveEditor } from './CurveEditor.js';

const SCRUB_RESOLUTION = 1000;

function freshState() {
  return {
    file: null,
    analysis: null,
    checkReport: null,
    viewer: null,
    curves: null,
    activeClip: null,
    activeNodeName: null,
    scrubbing: false,
  };
}

let state = freshState();
let el = {};

/**
 * Mounts Animation Inspector into `container`.
 *
 * Read-only, like Rig Inspector: there is no run button and nothing is ever
 * written back. A file is analysed the moment it loads, and the result is a
 * playable clip list, a live 3D preview, a per-node curve view and an issue
 * list. The one piece of state that matters is the selected clip — the
 * viewport, the transport, the curve editor and the clip-info panel all read
 * from it, so selection is funnelled through `selectClip()` rather than each
 * panel tracking its own idea of what's current.
 *
 * @param {HTMLElement} container
 * @returns {() => void} cleanup, called automatically by the router before
 *   the next navigation.
 */
export function mount(container) {
  const stylesheets = [variablesCssUrl, animationInspectorCssUrl, toolIdentityCssUrl].map(injectStylesheet);

  state = freshState();
  container.innerHTML = animationInspectorMarkup();

  renderToolIdentity(document.getElementById('ai-identity'), {
    mark: 'anim-curve',
    eyebrow: 'Preview. Analyse. Perfect.',
    title: 'Animation',
    accentTitle: 'Inspector',
    description: 'View and analyse animation clips — right in the browser.',
  });

  el = {
    dropzone: byId('ai-dropzone'),
    file: byId('ai-file'),
    choose: byId('ai-choose'),
    stage: byId('ai-stage'),
    viewport: byId('ai-viewport'),
    viewportTag: byId('ai-viewport-tag'),
    hudStats: byId('ai-hud-stats'),

    prevClip: byId('ai-prev-clip'),
    nextClip: byId('ai-next-clip'),
    stepBack: byId('ai-step-back'),
    stepFwd: byId('ai-step-fwd'),
    play: byId('ai-play'),
    playIcon: byId('ai-play-icon'),
    scrub: byId('ai-scrub'),
    time: byId('ai-time'),
    duration: byId('ai-duration'),
    fps: byId('ai-fps'),
    loop: byId('ai-loop'),
    speed: byId('ai-speed'),
    grid: byId('ai-grid'),
    resetCam: byId('ai-reset-cam'),

    nodeSelect: byId('ai-node-select'),
    curveCanvas: byId('ai-curve-canvas'),
    curveLegend: byId('ai-curve-legend'),

    howItWorksPanel: byId('ai-howitworks-panel'),
    infoPanel: byId('ai-info-panel'),
    clipsPanel: byId('ai-clips-panel'),
    clipList: byId('ai-clip-list'),
    clipCount: byId('ai-clip-count'),
    clipInfoPanel: byId('ai-clipinfo-panel'),
    clipInfo: byId('ai-clip-info'),
    modelCheck: byId('ai-model-check'),
    checkList: byId('ai-check-list'),
    actionsPanel: byId('ai-actions-panel'),
    downloadReport: byId('ai-download-report'),
    restart: byId('ai-restart'),

    notice: byId('ai-notice'),
    noticeText: byId('ai-notice-text'),
    noticeClose: byId('ai-notice-close'),
  };

  wireUpload();
  wireTransport();
  el.restart.addEventListener('click', restart);
  el.downloadReport.addEventListener('click', downloadReport);

  state.viewer = new AnimationViewer(el.viewport);
  state.curves = new CurveEditor(el.curveCanvas);

  return () => {
    state.viewer?.dispose();
    state.curves?.dispose();
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
    const analysis = analyseAnimations(parsedDocument, file.size);
    const checkReport = buildAnimationChecks(analysis);

    state.file = file;
    state.analysis = analysis;
    state.checkReport = checkReport;

    el.dropzone.classList.add('hidden');
    el.stage.classList.remove('hidden');

    await state.viewer.load(buffer);

    el.howItWorksPanel.classList.add('hidden');
    el.infoPanel.classList.add('hidden');
    el.clipsPanel.classList.remove('hidden');
    el.modelCheck.classList.remove('hidden');
    el.actionsPanel.classList.remove('hidden');

    renderHud(analysis);
    renderClipList(analysis);
    renderChecks(checkReport.items);

    if (analysis.clipCount > 0) selectClip(0);
    else {
      el.clipInfoPanel.classList.add('hidden');
      el.viewportTag.textContent = 'No animation in this file';
      showNotice(`"${file.name}" loaded, but it contains no animation clips.`);
    }
  } catch (err) {
    showNotice(explainLoadFailure(err, file.name));
    console.error('[AnimationInspector] load failed', err);
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

// ------------------------------------------------------------- selection

/** Single funnel for "which clip is current" — every panel re-reads from here. */
function selectClip(index) {
  const clip = state.analysis?.clips[index];
  if (!clip) return;

  state.activeClip = clip;
  state.viewer.selectClip(index, onPlaybackTick);
  state.viewer.setLoop(el.loop.checked);
  state.viewer.setSpeed(Number(el.speed.value) || 1);

  el.viewportTag.textContent = truncateMiddle(clip.name, 34);
  el.duration.textContent = `${clip.duration.toFixed(2)}s`;
  el.fps.textContent = clip.frameRate > 0 ? `${Math.round(clip.frameRate)} fps` : '— fps';
  el.scrub.value = '0';
  el.time.textContent = '0.00s';
  setPlayIcon(false);

  markActiveClipRow(index);
  renderNodeOptions(clip);
  renderClipInfo(clip);
  renderHud(state.analysis, clip);
  state.curves.setTime(0);
}

function markActiveClipRow(index) {
  el.clipList.querySelectorAll('.ai-clip-row').forEach((row) => {
    row.classList.toggle('is-active', Number(row.dataset.clip) === index);
  });
}

/**
 * Populates the node picker for the selected clip and shows the first node's
 * curves. Nodes are ordered by hierarchy depth so the root sits at the top —
 * which is usually the node you want to look at first.
 */
function renderNodeOptions(clip) {
  const byNode = new Map();
  for (const track of clip.tracks) {
    if (!byNode.has(track.nodeName)) byNode.set(track.nodeName, []);
    byNode.get(track.nodeName).push(track);
  }

  const nodes = [...byNode.entries()]
    .map(([nodeName, tracks]) => ({
      nodeName,
      tracks,
      depth: Math.min(...tracks.map((t) => t.depth)),
      keyCount: tracks.reduce((sum, t) => sum + t.keyCount, 0),
    }))
    .sort((a, b) => a.depth - b.depth || a.nodeName.localeCompare(b.nodeName));

  el.nodeSelect.innerHTML = nodes
    .map((node) => {
      const paths = node.tracks
        .map((t) => (PATH_META[t.path] || PATH_META.translation).short)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join('·');
      return `<option value="${escapeAttr(node.nodeName)}">${escapeHtml(
        truncateMiddle(node.nodeName, 30)
      )} — ${paths}, ${formatNumber(node.keyCount)} keys</option>`;
    })
    .join('');

  state.nodeTracks = byNode;
  const first = nodes[0]?.nodeName ?? null;
  state.activeNodeName = first;
  if (first) {
    el.nodeSelect.value = first;
    showNodeCurves(first, clip);
  } else {
    state.curves.clear();
    el.curveLegend.innerHTML = '';
  }
}

function showNodeCurves(nodeName, clip) {
  const tracks = state.nodeTracks?.get(nodeName) ?? [];
  state.activeNodeName = nodeName;
  state.curves.setTracks(tracks, clip.duration);
  renderCurveLegend();
}

function renderCurveLegend() {
  const summary = state.curves.getSummary();
  if (!summary.length) {
    el.curveLegend.innerHTML = '<span class="ai-legend-empty">No animated channels on this node</span>';
    return;
  }
  el.curveLegend.innerHTML = summary
    .map((entry) => {
      const range =
        Math.abs(entry.max - entry.min) < 1e-9
          ? 'constant'
          : `${entry.min.toFixed(2)} → ${entry.max.toFixed(2)}`;
      return `<span class="ai-legend-item">
        <span class="ai-legend-swatch" style="background:${entry.colour}"></span>
        <span class="ai-legend-label">${entry.label}</span>
        <span class="ai-legend-range">${range}</span>
      </span>`;
    })
    .join('');
}

// ------------------------------------------------------------- transport

function wireTransport() {
  el.play.addEventListener('click', () => {
    if (!state.activeClip) return;
    setPlayIcon(state.viewer.toggle());
  });

  el.stepBack.addEventListener('click', () => stepFrame(-1));
  el.stepFwd.addEventListener('click', () => stepFrame(1));

  el.prevClip.addEventListener('click', () => cycleClip(-1));
  el.nextClip.addEventListener('click', () => cycleClip(1));

  el.scrub.addEventListener('input', () => {
    if (!state.activeClip) return;
    state.scrubbing = true;
    const fraction = Number(el.scrub.value) / SCRUB_RESOLUTION;
    const seconds = fraction * state.activeClip.duration;
    state.viewer.setTime(seconds);
    syncPlayhead(seconds, state.activeClip.duration);
  });
  el.scrub.addEventListener('change', () => {
    state.scrubbing = false;
  });

  el.loop.addEventListener('change', () => state.viewer.setLoop(el.loop.checked));
  el.speed.addEventListener('change', () => state.viewer.setSpeed(Number(el.speed.value) || 1));

  el.nodeSelect.addEventListener('change', () => {
    if (state.activeClip) showNodeCurves(el.nodeSelect.value, state.activeClip);
  });

  el.grid.addEventListener('click', () => {
    const next = el.grid.getAttribute('aria-pressed') !== 'true';
    el.grid.setAttribute('aria-pressed', String(next));
    el.grid.classList.toggle('is-active', next);
    state.viewer.setGridVisible(next);
  });

  el.resetCam.addEventListener('click', () => state.viewer.resetCamera());
}

function stepFrame(direction) {
  if (!state.activeClip) return;
  state.viewer.pause();
  setPlayIcon(false);
  state.viewer.stepFrames(direction, state.activeClip.frameRate);
  syncPlayhead(state.viewer.time, state.activeClip.duration);
}

function cycleClip(direction) {
  if (!state.analysis?.clipCount) return;
  const current = state.activeClip?.index ?? 0;
  const next = (current + direction + state.analysis.clipCount) % state.analysis.clipCount;
  selectClip(next);
}

/** Fires every rendered frame while a clip is playing. */
function onPlaybackTick(time, duration, done) {
  if (state.scrubbing) return;
  syncPlayhead(time, duration);
  if (done) setPlayIcon(false);
}

function syncPlayhead(time, duration) {
  const safeDuration = duration > 0 ? duration : 1;
  el.time.textContent = `${time.toFixed(2)}s`;
  if (!state.scrubbing) {
    el.scrub.value = String(Math.round((time / safeDuration) * SCRUB_RESOLUTION));
  }
  state.curves.setTime(time);
}

function setPlayIcon(isPlaying) {
  el.play.setAttribute('aria-pressed', String(isPlaying));
  el.play.classList.toggle('is-playing', isPlaying);
  el.playIcon.innerHTML = isPlaying
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M17 4v16"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16l14-8L6 4Z"/></svg>';
}

// ---------------------------------------------------------------- panels

function renderHud(analysis, clip = null) {
  const rows = [
    ['Clips', formatNumber(analysis.clipCount)],
    ['Animated nodes', formatNumber(analysis.animatedNodeCount)],
  ];
  if (clip) {
    rows.push(['Tracks', formatNumber(clip.trackCount)]);
    rows.push(['Keyframes', formatNumber(clip.keyframeCount)]);
  }
  el.hudStats.innerHTML = rows
    .map(([k, v]) => `<div class="ai-hud-row"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');
}

function renderClipList(analysis) {
  el.clipCount.textContent = `${analysis.clipCount} clip${analysis.clipCount === 1 ? '' : 's'}`;

  if (!analysis.clipCount) {
    el.clipList.innerHTML = '<p class="ai-empty">No animation clips in this file.</p>';
    return;
  }

  el.clipList.innerHTML = analysis.clips
    .map((clip) => {
      const worst = worstLevel(clip.issues);
      const badge = worst
        ? `<span class="ai-clip-flag is-${worst}" title="${escapeAttr(
            clip.issues.find((i) => i.level === worst)?.text ?? ''
          )}">${worst === 'error' ? '×' : worst === 'warn' ? '!' : 'i'}</span>`
        : '';
      return `
      <button class="ai-clip-row" type="button" data-clip="${clip.index}" title="${escapeAttr(clip.name)}">
        <span class="ai-clip-play" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z"/></svg>
        </span>
        <span class="ai-clip-text">
          <span class="ai-clip-name">${escapeHtml(truncateMiddle(clip.name, 26))}</span>
          <span class="ai-clip-meta">${clip.duration.toFixed(2)}s · ${
            clip.frameRate > 0 ? `${Math.round(clip.frameRate)}fps` : 'no rate'
          } · ${formatNumber(clip.trackCount)} tracks</span>
        </span>
        ${badge}
      </button>`;
    })
    .join('');

  el.clipList.querySelectorAll('[data-clip]').forEach((row) => {
    row.addEventListener('click', () => selectClip(Number(row.dataset.clip)));
  });
}

function worstLevel(issues) {
  if (issues.some((i) => i.level === 'error')) return 'error';
  if (issues.some((i) => i.level === 'warn')) return 'warn';
  if (issues.some((i) => i.level === 'info')) return 'info';
  return null;
}

function renderClipInfo(clip) {
  el.clipInfoPanel.classList.remove('hidden');

  const rootMotion = clip.rootMotion.present
    ? `Yes — ${truncateMiddle(clip.rootMotion.nodeName ?? '', 18)}`
    : 'No';

  const rows = [
    ['Name', escapeHtml(truncateMiddle(clip.name, 24)), null],
    ['Length', `${clip.duration.toFixed(2)}s`, null],
    ['Frame rate', clip.frameRate > 0 ? `${Math.round(clip.frameRate)} fps` : '—', clip.uniformSampleRate ? null : 'warn'],
    ['Frames', formatNumber(clip.frameCount), null],
    ['Loops cleanly', clip.loop.clean ? 'Yes' : 'No', clip.loop.clean ? null : 'warn'],
    ['Root motion', rootMotion, null],
    ['Tracks', formatNumber(clip.trackCount), clip.brokenTracks ? 'error' : null],
    ['Keyframes', formatNumber(clip.keyframeCount), null],
    ['Interpolation', clip.interpolations.join(', ') || '—', null],
    ['File size', formatBytes(state.analysis.fileBytes), null],
    ['Format', state.analysis.format, null],
  ];

  el.clipInfo.innerHTML = rows
    .map(
      ([label, value, level]) => `
      <div class="ai-info-row${level ? ` is-${level}` : ''}">
        <dt>${label}</dt>
        <dd>${value}</dd>
      </div>`
    )
    .join('');
}

function renderChecks(items) {
  el.checkList.innerHTML = items
    .map(
      (item) => `<li class="ai-check is-${item.level}"><span class="ai-check-mark">${
        item.level === 'ok' ? '✓' : item.level === 'warn' ? '!' : item.level === 'info' ? 'i' : '×'
      }</span><span>${escapeHtml(item.text)}</span></li>`
    )
    .join('');
}

// ---------------------------------------------------------------- report

function downloadReport() {
  if (!state.analysis) return;
  const { analysis, checkReport } = state;
  const report = {
    filename: state.file?.name || null,
    generatedAt: new Date().toISOString(),
    generatedBy: 'Asset Bench — Animation Inspector',
    summary: {
      clipCount: analysis.clipCount,
      totalTracks: analysis.totalTracks,
      totalKeyframes: analysis.totalKeyframes,
      totalDuration: Number(analysis.totalDuration.toFixed(4)),
      animatedNodeCount: analysis.animatedNodeCount,
      longestClipName: analysis.longestClipName,
      skinCount: analysis.skinCount,
      jointCount: analysis.jointCount,
      hasMorphTargets: analysis.hasMorphTargets,
      fileBytes: analysis.fileBytes,
    },
    checks: checkReport.items,
    clips: analysis.clips.map((clip) => ({
      index: clip.index,
      name: clip.name,
      duration: Number(clip.duration.toFixed(4)),
      startTime: Number(clip.startTime.toFixed(4)),
      frameRate: clip.frameRate > 0 ? Number(clip.frameRate.toFixed(2)) : null,
      uniformSampleRate: clip.uniformSampleRate,
      frameCount: clip.frameCount,
      trackCount: clip.trackCount,
      brokenTracks: clip.brokenTracks,
      keyframeCount: clip.keyframeCount,
      animatedNodeCount: clip.animatedNodeCount,
      interpolations: clip.interpolations,
      channelsByPath: clip.counts,
      loopsCleanly: clip.loop.clean,
      loopWorstDelta: Number(clip.loop.worstDelta.toFixed(6)),
      loopWorstTrack: clip.loop.worstTrack,
      rootMotion: clip.rootMotion,
      issues: clip.issues.map(({ level, code, text }) => ({ level, code, text })),
      tracks: clip.tracks.map((t) => ({
        node: t.nodeName,
        path: t.path,
        interpolation: t.interpolation,
        keyframes: t.keyCount,
        constant: t.isConstant,
        loopDelta: Number(t.loopDelta.toFixed(6)),
      })),
    })),
  };
  const base = (state.file?.name || 'model').replace(/\.(glb|gltf)$/i, '');
  downloadJson(report, `${base}_animation-report.json`);
}

// ----------------------------------------------------------------- misc

function restart() {
  state.viewer.clear();
  state.curves.clear();

  state.file = null;
  state.analysis = null;
  state.checkReport = null;
  state.activeClip = null;
  state.activeNodeName = null;
  state.nodeTracks = null;

  el.stage.classList.add('hidden');
  el.dropzone.classList.remove('hidden');
  el.clipsPanel.classList.add('hidden');
  el.clipInfoPanel.classList.add('hidden');
  el.modelCheck.classList.add('hidden');
  el.actionsPanel.classList.add('hidden');
  el.howItWorksPanel.classList.remove('hidden');
  el.infoPanel.classList.remove('hidden');

  el.curveLegend.innerHTML = '';
  el.nodeSelect.innerHTML = '';
  el.scrub.value = '0';
  el.time.textContent = '0.00s';
  el.duration.textContent = '0.00s';
  el.fps.textContent = '— fps';
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

function escapeAttr(value) {
  return String(value).replace(/"/g, '&quot;');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
