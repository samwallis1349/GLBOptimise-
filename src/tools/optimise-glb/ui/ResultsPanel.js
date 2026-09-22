import { store } from '../app/state.js';
import { Viewer } from '../viewer/Viewer.js';
import { loadGlbForPreview } from '../viewer/loadModel.js';
import { formatBytes, formatNumber, formatPercent } from '../utils/formatting.js';

let originalViewer = null;
let optimisedViewer = null;
let renderToken = 0;

const ICON_TRIANGLE = '<path d="M12 2 2 21h20Z"/>';
const ICON_LAYERS = '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>';
const ICON_CUBE = '<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 7v10l9 5 9-5V7"/><path d="M12 12v10"/>';
const ICON_FILM = '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/>';

// Compact icon + bare value chips — no "Label:" prefix, since the file size
// is already shown as the preview-stage badge.
function statRow(iconPath, value) {
  return `<div class="stat-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg><span>${value}</span></div>`;
}

/** @returns {() => void} cleanup — disposes both Three.js viewers and unsubscribes */
export function initResultsPanel() {
  originalViewer = new Viewer(document.getElementById('original-preview-stage'));
  optimisedViewer = new Viewer(document.getElementById('optimised-preview-stage'));

  const unsubscribe = store.subscribe((state) => render(state));
  render(store.get());

  return () => {
    unsubscribe();
    originalViewer?.dispose();
    optimisedViewer?.dispose();
    originalViewer = null;
    optimisedViewer = null;
    // Preview-loaded markers are cached on the model objects themselves (see
    // render() below), but they're only valid for the viewer instance that
    // was live when they were set. Clear them so a later remount (fresh
    // Viewer instances) reloads previews instead of assuming they're current.
    for (const model of store.get().models) {
      delete model._originalPreviewFor;
      delete model._optimisedPreviewFor;
    }
  };
}

async function render(state) {
  const model = state.models.find((m) => m.id === state.selectedModelId) || null;
  const checkSection = document.getElementById('model-check');

  // The results strip stays on screen so the page reads as the full
  // workflow — upload, settings, before/after, reduction. With nothing
  // loaded the cards show empty states rather than placeholder numbers.
  if (!model || !model.analysis) {
    checkSection.classList.add('hidden');
    resetToEmptyState();
    return;
  }

  checkSection.classList.remove('hidden');

  const myToken = ++renderToken;

  // --- Original ---
  document.getElementById('original-preview-empty').classList.add('hidden');
  const origBadge = document.getElementById('original-size-badge');
  origBadge.textContent = model.analysis.file.formattedSize;
  origBadge.classList.remove('hidden');
  renderStats('original-stats', model.analysis);

  if (model._originalPreviewFor !== model.id && model.originalBuffer) {
    try {
      const scene = await loadGlbForPreview(model.originalBuffer);
      if (myToken !== renderToken) return;
      originalViewer.setModel(scene);
      model._originalPreviewFor = model.id;
    } catch {
      /* preview is best-effort; stats/validation don't depend on it */
    }
  }

  // --- Optimised ---
  const optEmpty = document.getElementById('optimised-preview-empty');
  const optBadge = document.getElementById('optimised-size-badge');
  const reductionFigure = document.getElementById('reduction-figure');
  const reductionBar = document.getElementById('reduction-bar');
  const reductionCompare = document.getElementById('reduction-compare');

  if (model.optimisedBuffer && model.optimisedAnalysis) {
    optEmpty.classList.add('hidden');
    optBadge.textContent = model.optimisedAnalysis.file.formattedSize;
    optBadge.classList.remove('pill-neutral', 'hidden');
    optBadge.classList.add('pill-accent');
    renderStats('optimised-stats', model.optimisedAnalysis);

    if (model._optimisedPreviewFor !== `${model.id}:${model.optimisedBuffer.byteLength}`) {
      try {
        const scene = await loadGlbForPreview(model.optimisedBuffer);
        if (myToken !== renderToken) return;
        optimisedViewer.setModel(scene);
        model._optimisedPreviewFor = `${model.id}:${model.optimisedBuffer.byteLength}`;
      } catch {
        /* best-effort preview */
      }
    }
  } else {
    optEmpty.classList.remove('hidden');
    optBadge.textContent = '';
    optBadge.classList.remove('pill-accent');
    optBadge.classList.add('pill-neutral', 'hidden');
    document.getElementById('optimised-stats').innerHTML = '';
    optimisedViewer.clear();
  }

  if (model.comparison) {
    const c = model.comparison;
    reductionFigure.classList.remove('is-empty');
    reductionFigure.textContent = formatPercent(Math.max(0, c.percentSmaller));
    reductionBar.style.width = `${Math.max(0, Math.min(100, c.percentSmaller))}%`;
    reductionCompare.innerHTML = [
      compareRow('Original size', formatBytes(c.originalBytes)),
      compareRow('Optimised size', formatBytes(c.optimisedBytes)),
      pairRow('Triangles', c.triangles.before, c.triangles.after),
      pairRow('Textures', c.textures.before, c.textures.after),
      pairRow('Materials', c.materials.before, c.materials.after),
      pairRow('Animations', c.animations.before, c.animations.after),
    ].join('');
  } else {
    reductionFigure.textContent = '—';
    reductionFigure.classList.add('is-empty');
    reductionBar.style.width = '0%';
    reductionCompare.innerHTML = '';
  }
}

/** Clears every result surface back to "nothing loaded yet". */
function resetToEmptyState() {
  renderToken += 1;
  document.getElementById('original-preview-empty').classList.remove('hidden');
  document.getElementById('optimised-preview-empty').classList.remove('hidden');
  const origBadge = document.getElementById('original-size-badge');
  origBadge.textContent = '';
  origBadge.classList.add('hidden');
  const optBadge = document.getElementById('optimised-size-badge');
  optBadge.textContent = '';
  optBadge.classList.add('hidden', 'pill-neutral');
  optBadge.classList.remove('pill-accent');
  document.getElementById('original-stats').innerHTML = '';
  document.getElementById('optimised-stats').innerHTML = '';
  const figure = document.getElementById('reduction-figure');
  figure.textContent = '—';
  figure.classList.add('is-empty');
  document.getElementById('reduction-bar').style.width = '0%';
  document.getElementById('reduction-compare').innerHTML = '';
  originalViewer?.clear();
  optimisedViewer?.clear();
}

function renderStats(containerId, analysis) {
  const el = document.getElementById(containerId);
  el.innerHTML = [
    statRow(ICON_TRIANGLE, formatNumber(analysis.geometry.triangleCount)),
    statRow(ICON_LAYERS, `${analysis.textures.count} texture${analysis.textures.count === 1 ? '' : 's'}`),
    statRow(ICON_CUBE, `${analysis.materials.count} material${analysis.materials.count === 1 ? '' : 's'}`),
    analysis.animations.count > 0
      ? statRow(ICON_FILM, `${analysis.animations.count} animation${analysis.animations.count === 1 ? '' : 's'}`)
      : '',
  ].join('');
}

function compareRow(label, value) {
  return `<div class="stat-compare"><span>${label}</span><strong>${value}</strong></div>`;
}

/** "42,312 → 24,118" when a count changed, "8 (kept)" when it didn't. */
function pairRow(label, before, after) {
  const value = before === after ? `${formatNumber(before)} (kept)` : `${formatNumber(before)} → ${formatNumber(after)}`;
  return compareRow(label, value);
}
