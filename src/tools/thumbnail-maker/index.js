import { ThumbnailMakerPage } from './ThumbnailMakerPage.js';

/** @param {HTMLElement} container */
export function mount(container) {
  container.innerHTML = '';
  container.appendChild(ThumbnailMakerPage());
}
