import { GLBBuilderPage } from './GLBBuilderPage.js';

/** @param {HTMLElement} container */
export function mount(container) {
  container.innerHTML = '';
  container.appendChild(GLBBuilderPage());
}
