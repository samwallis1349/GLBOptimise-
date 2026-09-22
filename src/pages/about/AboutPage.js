import { APP_NAME, APP_TAGLINE } from '../../shared/config/app.js';

export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">About ${APP_NAME}</h1>
        <p class="tool-page__description">${APP_TAGLINE}</p>
      </div>
    </div>
    <div class="panel" style="max-width: 640px;">
      <p>
        ${APP_NAME} is a growing collection of small, focused, browser-based
        tools for preparing 3D assets for games and realtime applications.
        Every tool runs entirely in your browser — models never leave your
        device.
      </p>
      <p class="text-secondary" style="margin-top: var(--space-4);">
        The suite is under active development. New tools are added one at a
        time, each sharing the same design system, upload pipeline, and
        cross-tool model handoff.
      </p>
    </div>
  `;

  container.appendChild(section);
}
