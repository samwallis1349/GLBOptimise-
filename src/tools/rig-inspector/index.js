import variablesCssUrl from './styles/variables.css?url';
import rigInspectorCssUrl from './styles/rig-inspector.css?url';
import toolIdentityCssUrl from '../../shared/components/toolIdentity.css?url';

import { readGlb } from './glb/createIO.js';
import { renderToolIdentity } from '../../shared/components/ToolIdentity.js';
import { downloadJson } from './utils/download.js';
import { formatBytes, formatNumber, truncateMiddle } from './utils/formatting.js';
import { HARD_FILE_LIMIT } from './config/limits.js';

import { rigInspectorMarkup } from './markup.js';
import { analyseRig, buildRigChecks } from './RigAnalysis.js';
import { RigViewer } from './RigViewer.js';

function freshState() {
  return {
    file: null,
    buffer: null,
    analysis: null,
    checkReport: null,
    viewer: null,
    meshVisible: true,
    skeletonVisible: true,
  };
}

let state = freshState();
let el = {};

/**
 * Mounts Rig Inspector into `container`. Read-only, unlike the processing
 * tools: there is no run button or progress bar — a file is analysed the
 * moment it loads, and the result is a live bind-pose viewer, a rig summary,
 * a model-check list and a clickable skeleton hierarchy.
 *
 * @param {HTMLElement} container
 * @returns {() => void} cleanup, called automatically by the router before
 *   the next navigation.
 */
export function mount(container) {
  const stylesheets = [variablesCssUrl, rigInspectorCssUrl, toolIdentityCssUrl].map(injectStylesheet);

  state = freshState();
  container.innerHTML = rigInspectorMarkup();

  renderToolIdentity(document.getElementById('ri-identity'), {
    mark: 'rig-skeleton',
    eyebrow: 'See the skeleton before you ship it',
    title: 'Rig',
    accentTitle: 'Inspector',
    description: 'Inspect bones, weights and skinning — right in the browser.',
  });

  el = {
    dropzone: byId('ri-dropzone'),
    file: byId('ri-file'),
    choose: byId('ri-choose'),
    stage: byId('ri-stage'),
    viewport: byId('ri-viewport'),
    hudStats: byId('ri-hud-stats'),
    modelDetailsFile: byId('ri-model-details-file'),
    modelDetailsGrid: byId('ri-model-details-grid'),
    meshToggle: byId('ri-mesh-toggle'),
    skeletonToggle: byId('ri-skeleton-toggle'),
    grid: byId('ri-grid'),
    resetCam: byId('ri-reset-cam'),
    summaryPanel: byId('ri-summary-panel'),
    statGrid: byId('ri-stat-grid'),
    downloadReport: byId('ri-download-report'),
    modelCheck: byId('ri-model-check'),
    checkList: byId('ri-check-list'),
    hierarchyPanel: byId('ri-hierarchy-panel'),
    tree: byId('ri-tree'),
    restartPanel: byId('ri-restart-panel'),
    restart: byId('ri-restart'),
    howItWorksPanel: byId('ri-howitworks-panel'),
    infoPanel: byId('ri-info-panel'),
    notice: byId('ri-notice'),
    noticeText: byId('ri-notice-text'),
    noticeClose: byId('ri-notice-close'),
  };

  wireUpload();
  wireViewerBar();
  el.restart.addEventListener('click', restart);
  el.downloadReport.addEventListener('click', downloadReport);

  state.viewer = new RigViewer(el.viewport);

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
    const analysis = analyseRig(parsedDocument);
    const checkReport = buildRigChecks(analysis);

    state.file = file;
    state.buffer = buffer;
    state.analysis = analysis;
    state.checkReport = checkReport;

    el.dropzone.classList.add('hidden');
    el.stage.classList.remove('hidden');

    await state.viewer.load(buffer);
    state.meshVisible = true;
    state.skeletonVisible = state.viewer.hasSkeleton;
    el.meshToggle.checked = true;
    el.skeletonToggle.checked = state.viewer.hasSkeleton;
    el.skeletonToggle.disabled = !state.viewer.hasSkeleton;
    state.viewer.setMeshVisible(true);
    state.viewer.setSkeletonVisible(state.viewer.hasSkeleton);

    renderHud(analysis, file.size);
    renderModelDetails(analysis, file);
    renderSummary(analysis);
    renderChecks(checkReport.items);
    renderHierarchy(analysis, checkReport.hasRig);

    el.howItWorksPanel.classList.add('hidden');
    el.infoPanel.classList.add('hidden');
    el.restartPanel.classList.remove('hidden');
  } catch (err) {
    showNotice(explainLoadFailure(err, file.name));
    console.error('[RigInspector] load failed', err);
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

// ------------------------------------------------------------- viewer bar

function wireViewerBar() {
  document.querySelectorAll('[data-shade]').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-shade]').forEach((b) => b.classList.toggle('is-active', b === btn));
      state.viewer.setWireframeMode(btn.dataset.shade);
    })
  );

  el.meshToggle.addEventListener('change', () => {
    state.meshVisible = el.meshToggle.checked;
    state.viewer.setMeshVisible(state.meshVisible);
  });

  el.skeletonToggle.addEventListener('change', () => {
    state.skeletonVisible = el.skeletonToggle.checked;
    state.viewer.setSkeletonVisible(state.skeletonVisible);
  });

  el.grid.addEventListener('click', () => {
    const next = el.grid.getAttribute('aria-pressed') !== 'true';
    el.grid.setAttribute('aria-pressed', String(next));
    el.grid.classList.toggle('is-active', next);
    state.viewer.setGridVisible(next);
  });

  el.resetCam.addEventListener('click', () => state.viewer.resetCamera());
}

// ------------------------------------------------------------------ HUD

function renderHud(analysis, bytes) {
  const rows = [
    ['Skins', formatNumber(analysis.skinCount)],
    ['Joints', formatNumber(analysis.totalJoints)],
    ['Skinned vertices', formatNumber(analysis.skinnedVertexCount)],
  ];
  if (Number.isFinite(bytes)) rows.push(['File size', formatBytes(bytes)]);
  el.hudStats.innerHTML = rows
    .map(([k, v]) => `<div class="ri-hud-row"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');
}

// ------------------------------------------------------------ model details

/**
 * A formal, tabular readout of the loaded file — filename plus every
 * measured stat, label/value aligned like a spec sheet. Sits directly under
 * the preview so the numbers are visible next to what they describe,
 * without having to look across at the summary panel.
 */
function renderModelDetails(analysis, file) {
  el.modelDetailsFile.textContent = file.name;
  el.modelDetailsFile.title = file.name;

  const rows = [
    { label: 'File size', value: formatBytes(file.size) },
    { label: 'Skins', value: formatNumber(analysis.skinCount) },
    { label: 'Joints', value: formatNumber(analysis.totalJoints) },
    { label: 'Max hierarchy depth', value: formatNumber(analysis.maxDepth) },
    { label: 'Skinned primitives', value: formatNumber(analysis.skinnedPrimitiveCount) },
    { label: 'Skinned vertices', value: formatNumber(analysis.skinnedVertexCount) },
    {
      label: 'Unweighted vertices',
      value: formatNumber(analysis.unweightedVertexCount),
      state: analysis.unweightedVertexCount > 0 ? 'error' : null,
    },
    {
      label: 'Misnormalised vertices',
      value: formatNumber(analysis.misnormalizedVertexCount),
      state: analysis.misnormalizedVertexCount > 0 ? 'warn' : null,
    },
    { label: 'Animation clips', value: formatNumber(analysis.animationCount) },
  ];

  el.modelDetailsGrid.innerHTML = rows
    .map(
      (r) =>
        `<div class="ri-model-details-row${r.state ? ` is-${r.state}` : ''}"><dt>${r.label}</dt><dd>${r.value}</dd></div>`
    )
    .join('');
}

// -------------------------------------------------------------- summary

function renderSummary(analysis) {
  el.summaryPanel.classList.remove('hidden');

  const tiles = [
    { label: 'Skins', value: formatNumber(analysis.skinCount) },
    { label: 'Joints', value: formatNumber(analysis.totalJoints) },
    { label: 'Max hierarchy depth', value: formatNumber(analysis.maxDepth) },
    { label: 'Skinned primitives', value: formatNumber(analysis.skinnedPrimitiveCount) },
    { label: 'Skinned vertices', value: formatNumber(analysis.skinnedVertexCount) },
    {
      label: 'Unweighted vertices',
      value: formatNumber(analysis.unweightedVertexCount),
      state: analysis.unweightedVertexCount > 0 ? 'error' : null,
    },
  ];

  el.statGrid.innerHTML = tiles
    .map(
      (t) => `
      <div class="ri-stat-tile${t.state ? ` is-${t.state}` : ''}">
        <div class="ri-stat-value">${t.value}</div>
        <div class="ri-stat-label">${t.label}</div>
      </div>`
    )
    .join('');
}

// ------------------------------------------------------------ model check

function renderChecks(items) {
  el.modelCheck.classList.remove('hidden');
  el.checkList.innerHTML = items
    .map(
      (item) => `<li class="ri-check is-${item.level}"><span class="ri-check-mark">${
        item.level === 'ok' ? '✓' : item.level === 'warn' ? '!' : '×'
      }</span><span>${item.text}</span></li>`
    )
    .join('');
}

// -------------------------------------------------------------- hierarchy

function renderHierarchy(analysis, hasRig) {
  if (!hasRig) {
    el.hierarchyPanel.classList.add('hidden');
    return;
  }
  el.hierarchyPanel.classList.remove('hidden');

  el.tree.innerHTML = analysis.skins
    .map((skin) => {
      const dupSet = new Set(skin.duplicateNames);
      const rows = skin.joints
        .map((joint) => {
          const isDup = dupSet.has(joint.name);
          const indent = 10 + joint.depth * 16;
          return `
          <button class="ri-tree-row${isDup ? ' is-duplicate' : ''}" type="button"
                  style="padding-left:${indent}px" data-joint="${escapeAttr(joint.name)}"
                  title="${escapeAttr(joint.name)}${isDup ? ' — duplicate name within this skin' : ''}">
            <span class="ri-tree-row-name">${truncateMiddle(joint.name, 30)}</span>
            ${joint.childCount ? `<span class="ri-tree-row-count">${joint.childCount} child${joint.childCount === 1 ? '' : 'ren'}</span>` : ''}
          </button>`;
        })
        .join('');
      return `<div class="ri-tree-skin-name">${escapeAttr(skin.name)} · ${skin.jointCount} joint${skin.jointCount === 1 ? '' : 's'}</div>${rows}`;
    })
    .join('');

  el.tree.querySelectorAll('[data-joint]').forEach((btn) => {
    btn.addEventListener('click', () => state.viewer.highlightJoint(btn.dataset.joint));
  });
}

// -------------------------------------------------------------- report

function downloadReport() {
  if (!state.analysis) return;
  const { analysis, checkReport } = state;
  const report = {
    filename: state.file?.name || null,
    generatedAt: new Date().toISOString(),
    generatedBy: 'Asset Bench — Rig Inspector',
    summary: {
      skinCount: analysis.skinCount,
      totalJoints: analysis.totalJoints,
      maxDepth: analysis.maxDepth,
      skinnedPrimitiveCount: analysis.skinnedPrimitiveCount,
      skinnedVertexCount: analysis.skinnedVertexCount,
      unweightedVertexCount: analysis.unweightedVertexCount,
      misnormalizedVertexCount: analysis.misnormalizedVertexCount,
      eightInfluenceVertexCount: analysis.eightInfluenceVertexCount,
      animationCount: analysis.animationCount,
    },
    checks: checkReport.items,
    skins: analysis.skins.map((s) => ({
      name: s.name,
      jointCount: s.jointCount,
      hasExplicitSkeletonRoot: s.hasExplicitSkeletonRoot,
      rootName: s.rootName,
      disconnectedGroups: s.disconnectedGroups,
      duplicateNames: s.duplicateNames,
      joints: s.joints,
    })),
    meshes: analysis.meshEntries,
  };
  const base = (state.file?.name || 'model').replace(/\.(glb|gltf)$/i, '');
  downloadJson(report, `${base}_rig-report.json`);
}

// ----------------------------------------------------------------- misc

function restart() {
  state.file = null;
  state.buffer = null;
  state.analysis = null;
  state.checkReport = null;
  state.viewer.clear();
  el.stage.classList.add('hidden');
  el.dropzone.classList.remove('hidden');
  el.summaryPanel.classList.add('hidden');
  el.modelCheck.classList.add('hidden');
  el.hierarchyPanel.classList.add('hidden');
  el.restartPanel.classList.add('hidden');
  el.howItWorksPanel.classList.remove('hidden');
  el.infoPanel.classList.remove('hidden');
  document.querySelectorAll('[data-shade]').forEach((b) => b.classList.toggle('is-active', b.dataset.shade === 'solid'));
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
