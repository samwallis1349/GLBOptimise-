import { TRIPO_BANNER_TOOLS, TRIPO_GUIDE_PATH, TRIPO_LINK_ATTRS, TRIPO_TOOLS } from '../config/tripo.js';
import { trackApiEvent } from './ApiLaunchModal.js';

/**
 * Small "Need a 3D model?" card under the tools in TRIPO_TOOLS: a little
 * prompt-to-model scene (a prompt types itself, a wireframe cube spins up;
 * CSS only, in guides.css), one line of copy and a button that goes to Tripo
 * through the affiliate link (labelled as such), plus a link to the Tripo
 * game-ready guide. Clicks on the button count as `tripo_tool_click`.
 *
 * @param {import('../config/tools.js').TOOLS[number]} tool
 * @returns {HTMLElement | null}
 */
export function TripoCard(tool) {
  if (!TRIPO_TOOLS.has(tool.id) || TRIPO_BANNER_TOOLS.has(tool.id)) return null;

  const card = document.createElement('aside');
  card.className = 'tripo-card';
  card.innerHTML = `
    <span class="tripo-card__scene" aria-hidden="true">
      <span class="tripo-card__prompt"><span>a mossy stone golem</span></span>
      <span class="tripo-card__arrow">→</span>
      <span class="tripo-card__cube"><i></i><i></i><i></i><i></i><i></i><i></i></span>
    </span>
    <p class="tripo-card__text">
      <strong>Need a 3D model?</strong>
      <span>Generate one from text or an image with Tripo, then bring it back here to make it game-ready.</span>
      <a class="tripo-card__guide" href="${TRIPO_GUIDE_PATH}">How to make Tripo models game-ready →</a>
    </p>
    <span class="tripo-card__action">
      <a class="btn btn--primary tripo-card__button" ${TRIPO_LINK_ATTRS}>Try Tripo <span aria-hidden="true">↗</span></a>
      <small class="affiliate-note">Affiliate link</small>
    </span>
  `;
  card.querySelector('.tripo-card__button').addEventListener('click', () => trackApiEvent('tripo_tool_click'));
  return card;
}
