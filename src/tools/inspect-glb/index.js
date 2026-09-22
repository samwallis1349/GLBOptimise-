import { InspectGLBPage } from './InspectGLBPage.js';

/** @param {HTMLElement} container */
export function mount(container) {
  container.innerHTML = '';
  container.appendChild(InspectGLBPage());
}
