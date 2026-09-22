import { AssetReportPage } from './AssetReportPage.js';

/** @param {HTMLElement} container */
export function mount(container) {
  container.innerHTML = '';
  container.appendChild(AssetReportPage());
}
