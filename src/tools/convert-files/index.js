import { ConvertFilesPage } from './ConvertFilesPage.js';

/** @param {HTMLElement} container */
export function mount(container) {
  container.innerHTML = '';
  container.appendChild(ConvertFilesPage());
}
