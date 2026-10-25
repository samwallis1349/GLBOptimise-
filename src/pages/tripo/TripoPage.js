import { TRIPO_LINK_ATTRS, tripoStepsMarkup } from '../../shared/config/tripo.js';
import { escapeHtml } from '../../shared/components/ToolCard.js';
import { trackApiEvent } from '../../shared/components/ApiLaunchModal.js';

/** /tripo-to-game-ready: from a Tripo model to one that runs well in a game, using the Asset Bench tools. */
export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container tripo-guide';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">Make Tripo models <span class="accent">game-ready</span></h1>
        <p class="tool-page__description">Tripo turns a text prompt or an image into a textured 3D model in about a minute. Those models are often heavier than a game can carry, with dense meshes and large textures. These steps take one from Tripo to your engine, in your browser.</p>
        <div class="tripo-guide__actions">
          <a class="btn btn--primary" data-tripo="guide-hero" ${TRIPO_LINK_ATTRS}>Generate a model in Tripo ↗</a>
          <a class="btn btn--secondary" href="/mobile-ready-checker">Check a model you already have</a>
        </div>
        <p class="tripo-guide__disclosure"><small class="affiliate-note">Affiliate link</small> Links to Tripo on this page are affiliate links: if you sign up or buy through one, Asset Bench may earn a commission, at no cost to you.</p>
      </div>
    </div>
    ${tripoStepsMarkup(escapeHtml)}
  `;

  section.addEventListener('click', (e) => {
    if (e.target.closest('[data-tripo]')) trackApiEvent('tripo_guide_click');
  });

  container.appendChild(section);
}
