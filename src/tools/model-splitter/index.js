import { ModelSplitterPage } from './ModelSplitterPage.js';

/** @param {HTMLElement} container */
export function mount(container) {
  container.innerHTML = '';
  container.appendChild(ModelSplitterPage());
}
