import { store } from '../app/state.js';
import { evaluateRecommendations } from '../config/recommendations.js';

const WARNING_ICON = '<path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/>';

/** @returns {() => void} unsubscribe, so the tool can clean up on unmount */
export function initModelCheck() {
  const unsubscribe = store.subscribe((state) => render(state));
  render(store.get());
  return unsubscribe;
}

function render(state) {
  const list = document.getElementById('model-check-list');
  const model = state.models.find((m) => m.id === state.selectedModelId) || null;

  if (!model || !model.analysis) {
    list.innerHTML = '<div class="check-empty">Load a model to see optimisation opportunities.</div>';
    return;
  }

  const isBatch = state.models.length > 1;
  const items = isBatch ? buildBatchItems(state.models) : buildSingleItems(model.analysis);

  if (!items.length) {
    list.innerHTML = '<div class="check-empty">No optimisation opportunities detected — this model looks efficient already.</div>';
    return;
  }

  // Rebuilt from scratch on every render, so each card carries its own
  // stable data-layout-id — the layout editor's MutationObserver spots them
  // as they appear and reapplies any saved position.
  list.innerHTML = items
    .map(
      (item, index) => `
        <div class="check-item"
             data-layout-editable data-layout-lock-children
             data-layout-id="check-item:${escapeAttr(item.id || index)}"
             data-layout-name="Check: ${escapeAttr(item.title)}">
          <svg class="check-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${WARNING_ICON}</svg>
          <div class="check-item-body">
            <div class="check-item-title">${item.title}</div>
            <div class="check-item-desc">${item.description}</div>
            <div class="check-item-action">
              <button class="og-btn og-btn-secondary" type="button" disabled data-tooltip="Coming soon — a dedicated MeshKit tool, no re-upload needed">
                ${item.action}
              </button>
            </div>
          </div>
        </div>`
    )
    .join('');
}

function escapeAttr(value) {
  return String(value).replace(/"/g, '&quot;');
}

function buildSingleItems(analysis) {
  return evaluateRecommendations(analysis);
}

function buildBatchItems(models) {
  const withHighRes = models.filter(
    (m) => m.analysis && evaluateRecommendations(m.analysis).some((r) => r.id === 'HIGH_RES_TEXTURE')
  );
  const withHighGeo = models.filter(
    (m) => m.analysis && evaluateRecommendations(m.analysis).some((r) => r.id === 'HIGH_GEOMETRY')
  );

  const items = [];
  if (withHighRes.length) {
    items.push({
      id: 'BATCH_HIGH_RES_TEXTURE',
      title: `${withHighRes.length} MODEL${withHighRes.length === 1 ? '' : 'S'} CONTAIN 4K TEXTURES`,
      description: `${withHighRes.map((m) => m.name).join(', ')}`,
      action: 'Compress Textures →',
    });
  }
  if (withHighGeo.length) {
    items.push({
      id: 'BATCH_HIGH_GEOMETRY',
      title: `${withHighGeo.length} MODEL${withHighGeo.length === 1 ? '' : 'S'} EXCEED 100K TRIANGLES`,
      description: `${withHighGeo.map((m) => m.name).join(', ')}`,
      action: 'Reduce Polys →',
    });
  }
  return items;
}
