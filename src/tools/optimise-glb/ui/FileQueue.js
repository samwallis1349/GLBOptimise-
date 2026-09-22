import { store } from '../app/state.js';
import { formatBytes, truncateMiddle } from '../utils/formatting.js';
import { HARD_FILE_LIMIT } from '../config/limits.js';

const MAX_SIZE_MB = Math.round(HARD_FILE_LIMIT / 1024 / 1024);

const STATUS_ICON = {
  waiting: '<circle cx="12" cy="12" r="9"/>',
  analysing: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  ready: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  optimising: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  validating: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  complete: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  warning: '<path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/>',
  failed: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  cancelled: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  skipped: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>',
};

const STATUS_COLOR = {
  waiting: 'var(--color-text-muted)',
  analysing: 'var(--color-accent)',
  ready: 'var(--color-text-secondary)',
  optimising: 'var(--color-accent)',
  validating: 'var(--color-accent)',
  complete: 'var(--color-success)',
  warning: 'var(--color-warning)',
  failed: 'var(--color-danger)',
  cancelled: 'var(--color-text-muted)',
  skipped: 'var(--color-text-muted)',
};

const SPINNING = new Set(['analysing', 'optimising', 'validating']);

function statusIcon(status) {
  const spin = SPINNING.has(status) ? ' style="animation: spin 0.8s linear infinite; transform-origin: center;"' : '';
  return `<svg class="queue-row-icon" viewBox="0 0 24 24" fill="none" stroke="${STATUS_COLOR[status] || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${spin}>${STATUS_ICON[status] || STATUS_ICON.waiting}</svg>`;
}

/** @returns {() => void} unsubscribe, so the tool can clean up on unmount */
export function initFileQueue() {
  const container = document.getElementById('file-queue');
  const list = document.getElementById('file-queue-list');
  const summary = document.getElementById('queue-summary-text');
  const clearAllBtn = document.getElementById('clear-all-btn');

  clearAllBtn.addEventListener('click', () => {
    store.set({ models: [], selectedModelId: null });
  });

  const dropzoneTitle = document.getElementById('dropzone-title');
  const dropzoneHint = document.getElementById('dropzone-hint');
  const chooseBtnLabel = document.getElementById('choose-file-btn-label');

  function render(state) {
    const { models } = state;

    if (models.length <= 1) {
      container.classList.add('hidden');
      dropzoneTitle.textContent = 'Drop your GLB file here';
      dropzoneHint.textContent = `Supports .glb files · max ${MAX_SIZE_MB}MB`;
      chooseBtnLabel.textContent = 'Choose GLB File';
    } else {
      container.classList.remove('hidden');
      dropzoneTitle.textContent = 'Drop more GLB files here';
      dropzoneHint.textContent = `Supports multiple .glb files · max ${MAX_SIZE_MB}MB each`;
      chooseBtnLabel.textContent = 'Choose GLB Files';
    }

    const totalBytes = models.reduce((sum, m) => sum + m.bytes, 0);
    summary.textContent = `${models.length} FILE${models.length === 1 ? '' : 'S'} · ${formatBytes(totalBytes)}`;

    list.innerHTML = '';
    for (const model of models) {
      const row = document.createElement('div');
      row.className = 'queue-row' + (model.id === state.selectedModelId ? ' active' : '');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.dataset.tooltip = model.statusMessage || model.status;

      row.innerHTML = `
        ${statusIcon(model.status)}
        <span class="queue-row-name">${escapeHtml(truncateMiddle(model.name, 32))}</span>
        <span class="queue-row-size">${formatBytes(model.bytes)}</span>
        <button class="queue-row-remove" type="button" aria-label="Remove ${escapeHtml(model.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="12" height="12"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      `;

      row.addEventListener('click', (e) => {
        if (e.target.closest('.queue-row-remove')) return;
        store.set({ selectedModelId: model.id });
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          store.set({ selectedModelId: model.id });
        }
      });
      row.querySelector('.queue-row-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        const models = store.get().models.filter((m) => m.id !== model.id);
        const selectedModelId =
          store.get().selectedModelId === model.id ? (models[0]?.id ?? null) : store.get().selectedModelId;
        store.set({ models, selectedModelId });
      });

      list.appendChild(row);
    }
  }

  const unsubscribe = store.subscribe(render);
  render(store.get());
  return unsubscribe;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
