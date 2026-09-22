import { store } from '../app/state.js';

/** @returns {() => void} unsubscribe, so the tool can clean up on unmount */
export function initPresetPanel() {
  const options = Array.from(document.querySelectorAll('.preset-option'));
  const advancedToggle = document.getElementById('advanced-toggle');
  const advancedBody = document.getElementById('advanced-body');

  options.forEach((btn) => {
    btn.addEventListener('click', () => {
      store.set({ globalPreset: btn.dataset.preset });
    });
  });

  advancedToggle.addEventListener('click', () => {
    const isOpen = store.get().advancedOpen;
    store.set({ advancedOpen: !isOpen });
  });

  function render(state) {
    options.forEach((btn) => {
      const selected = btn.dataset.preset === state.globalPreset;
      btn.classList.toggle('selected', selected);
      btn.setAttribute('aria-checked', String(selected));
    });

    advancedToggle.setAttribute('aria-expanded', String(state.advancedOpen));
    advancedBody.classList.toggle('hidden', !state.advancedOpen);
  }

  const unsubscribe = store.subscribe(render);
  render(store.get());
  return unsubscribe;
}
