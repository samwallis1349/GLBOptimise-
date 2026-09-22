import variablesCssUrl from './styles/variables.css?url';
import layoutCssUrl from './styles/layout.css?url';
import componentsCssUrl from './styles/components.css?url';
import toolIdentityCssUrl from '../../shared/components/toolIdentity.css?url';

import { store, nextModelId } from './app/state.js';
import { analyseGlb } from './glb/analyse.js';
import { classifyModel } from './glb/classify.js';
import { optimiseModel } from './glb/optimise.js';
import { downloadArrayBuffer } from './utils/download.js';
import { outputFilenameFor } from './utils/files.js';

import { OptimiseGLBPage } from './OptimiseGLBPage.js';
import { initUploadPanel } from './ui/UploadPanel.js';
import { initFileQueue } from './ui/FileQueue.js';
import { initPresetPanel } from './ui/PresetPanel.js';
import { initAdvancedPanel } from './ui/AdvancedPanel.js';
import { initResultsPanel } from './ui/ResultsPanel.js';
import { initModelCheck } from './ui/ModelCheck.js';
import { renderToolIdentity } from '../../shared/components/ToolIdentity.js';

/**
 * Mounts Optimise GLB into `container`. This tool has a real, working
 * processing engine (glTF Transform pipeline + Three.js preview) — see
 * glb/optimise.js — unlike the other seven tool shells, which only
 * render a placeholder.
 *
 * @param {HTMLElement} container
 * @returns {() => void} cleanup, called automatically by the router
 *   before the next navigation.
 */
export function mount(container) {
  const stylesheets = [variablesCssUrl, layoutCssUrl, componentsCssUrl, toolIdentityCssUrl].map(injectStylesheet);

  container.innerHTML = '';
  container.appendChild(OptimiseGLBPage());
  renderToolIdentity(document.getElementById('tool-identity'), {
    mark: 'glb-cube',
    eyebrow: 'Make your assets game ready',
    title: 'Optimise',
    accentTitle: 'GLB',
    description: 'Reduce file size. Keep quality. Game ready.',
  });

  const cleanupFns = [
    initFileQueue(),
    initPresetPanel(),
    initAdvancedPanel(),
    initResultsPanel(),
    initModelCheck(),
    initOptimiseButton(),
    initDownloadButton(),
  ].filter(Boolean);

  initUploadPanel({ onFilesSelected: addFiles, onValidationIssues: reportIssues });

  return () => {
    cleanupFns.forEach((fn) => fn());
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

// ---------------------------------------------------------------------------
// File intake -> analysis
// ---------------------------------------------------------------------------

function addFiles(files) {
  const newEntries = files.map((file) => ({
    id: nextModelId(),
    file,
    name: file.name,
    bytes: file.size,
    status: 'waiting',
    statusMessage: null,
    analysis: null,
    classification: null,
    originalBuffer: null,
    optimisedBuffer: null,
    optimisedAnalysis: null,
    comparison: null,
    operationReport: null,
    validation: null,
    presetOverride: '',
  }));

  store.update((s) => {
    s.models = [...s.models, ...newEntries];
    if (!s.selectedModelId && newEntries[0]) s.selectedModelId = newEntries[0].id;
  });

  for (const entry of newEntries) {
    analyseEntry(entry.id);
  }
}

async function analyseEntry(id) {
  store.patchModel(id, { status: 'analysing', statusMessage: 'Reading file…' });
  const model = store.getModel(id);
  if (!model) return;

  try {
    const arrayBuffer = await model.file.arrayBuffer();
    const analysis = await analyseGlb(arrayBuffer, { filename: model.name, bytes: model.bytes });
    const classification = classifyModel(analysis);

    store.patchModel(id, {
      status: 'ready',
      statusMessage: classification.flags.join(', '),
      analysis,
      classification,
      originalBuffer: arrayBuffer,
    });

    if (!store.get().selectedModelId) {
      store.set({ selectedModelId: id });
    }
  } catch (err) {
    store.patchModel(id, {
      status: 'failed',
      statusMessage: `Could not read this GLB: ${err?.message || 'unknown error'}`,
    });
  }
}

function reportIssues(issues) {
  for (const issue of issues) {
    console.warn('[AssetBench]', issue.message);
  }
  const errorIssues = issues.filter((i) => i.level !== 'warning');
  if (errorIssues.length) {
    window.alert(errorIssues.map((i) => i.message).join('\n'));
  }
}

// ---------------------------------------------------------------------------
// Optimise pipeline
// ---------------------------------------------------------------------------

function initOptimiseButton() {
  const btn = document.getElementById('optimise-btn');
  const label = document.getElementById('optimise-btn-label');
  const progressPanel = document.getElementById('progress-panel');
  const progressFill = document.getElementById('progress-fill');
  const progressStageText = document.getElementById('progress-stage-text');
  const progressPercentText = document.getElementById('progress-percent-text');

  const STAGES = [
    'Checking model…',
    'Cleaning…',
    'Optimising textures…',
    'Optimising geometry…',
    'Writing GLB…',
    'Validating…',
    'Complete',
  ];

  function onClick() {
    return handleOptimise();
  }
  btn.addEventListener('click', onClick);

  async function handleOptimise() {
    const state = store.get();
    const model = state.models.find((m) => m.id === state.selectedModelId);
    if (!model || !model.analysis || !model.originalBuffer) return;

    btn.disabled = true;
    label.textContent = 'Optimising…';
    progressPanel.classList.remove('hidden');
    store.patchModel(model.id, { status: 'optimising', statusMessage: 'Optimising…' });

    try {
      const result = await optimiseModel({
        originalBuffer: model.originalBuffer,
        originalAnalysis: model.analysis,
        presetId: model.presetOverride || state.globalPreset,
        advancedOverrides: state.advanced,
        onlyWhenSmaller: state.advanced.onlyWhenSmaller,
        onProgress: (stage) => {
          const idx = STAGES.indexOf(stage);
          const pct = idx >= 0 ? Math.round(((idx + 1) / STAGES.length) * 100) : 0;
          progressStageText.textContent = stage;
          progressPercentText.textContent = `${pct}%`;
          progressFill.style.width = `${pct}%`;
        },
      });

      if (!result.success) {
        store.patchModel(model.id, {
          status: 'failed',
          statusMessage: `Validation failed: ${result.validation.checks.find((c) => c.status === 'FAIL')?.message || 'unknown reason'}`,
          operationReport: result.report,
          validation: result.validation,
        });
      } else {
        const hasWarnings = result.validation.status === 'WARNING' || result.report.warnings.length > 0;
        store.patchModel(model.id, {
          status: hasWarnings ? 'warning' : 'complete',
          statusMessage: hasWarnings ? 'Completed with warnings' : 'Optimised successfully',
          optimisedBuffer: result.buffer,
          optimisedAnalysis: result.analysis,
          comparison: result.comparison,
          operationReport: result.report,
          validation: result.validation,
        });
      }
    } catch (err) {
      store.patchModel(model.id, {
        status: 'failed',
        statusMessage: `Optimisation failed: ${err?.message || 'unknown error'}`,
      });
      console.error('[AssetBench] optimisation error', err);
    } finally {
      btn.disabled = false;
      label.textContent = 'Optimise GLB';
      setTimeout(() => progressPanel.classList.add('hidden'), 1200);
    }
  }

  function updateOptimiseButtonState() {
    const state = store.get();
    const model = state.models.find((m) => m.id === state.selectedModelId);
    const ready = Boolean(model && model.analysis && !state.processing.active);
    btn.disabled = !ready;
  }

  const unsubscribe = store.subscribe(updateOptimiseButtonState);
  updateOptimiseButtonState();

  return () => {
    btn.removeEventListener('click', onClick);
    unsubscribe();
  };
}

function initDownloadButton() {
  const btn = document.getElementById('download-btn');

  function onClick() {
    const state = store.get();
    const model = state.models.find((m) => m.id === state.selectedModelId);
    if (!model || !model.optimisedBuffer) return;
    downloadArrayBuffer(model.optimisedBuffer, outputFilenameFor(model.name));
  }
  btn.addEventListener('click', onClick);

  function render(state) {
    const model = state.models.find((m) => m.id === state.selectedModelId);
    btn.classList.toggle('hidden', !(model && model.optimisedBuffer));
  }

  const unsubscribe = store.subscribe(render);
  render(store.get());

  return () => {
    btn.removeEventListener('click', onClick);
    unsubscribe();
  };
}
