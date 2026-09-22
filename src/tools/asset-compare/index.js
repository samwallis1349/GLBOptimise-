import { AssetComparePage } from './AssetComparePage.js';

/** @param {HTMLElement} container */
export function mount(container) {
  container.innerHTML = '';
  container.appendChild(AssetComparePage());
}
