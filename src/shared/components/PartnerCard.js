import { PARTNER_COMMISSION, PARTNER_SIGNUP_URL, PARTNER_TOOLS } from '../config/partners.js';
import { trackApiEvent } from './ApiLaunchModal.js';

/**
 * "Earn 26% recommending Asset Bench" (27 Oct): our own affiliate programme's sign-up, under the tools in
 * PARTNER_TOOLS, in the Tripo card's place (same layout, its classes from guides.css), with a small commission badge
 * where Tripo has its prompt scene. The button opens the Lemon Squeezy affiliate sign-up; clicks count as
 * `partner_join_click`.
 *
 * @param {import('../config/tools.js').TOOLS[number]} tool
 * @returns {HTMLElement | null}
 */
export function PartnerCard(tool) {
  if (!PARTNER_TOOLS.has(tool.id)) return null;

  const card = document.createElement('aside');
  card.className = 'tripo-card partner-card';
  card.innerHTML = `
    <span class="tripo-card__scene partner-card__scene" aria-hidden="true">
      <span class="partner-card__link">🔗 your link</span>
      <span class="tripo-card__arrow">→</span>
      <span class="partner-card__coin">${PARTNER_COMMISSION}</span>
    </span>
    <p class="tripo-card__text">
      <strong>Earn ${PARTNER_COMMISSION} recommending Asset Bench</strong>
      <span>Share your own link with your audience, students or team, and get ${PARTNER_COMMISSION} of every tool unlock it brings in. Tracked and paid through Lemon Squeezy.</span>
    </p>
    <span class="tripo-card__action">
      <a class="btn btn--primary tripo-card__button" href="${PARTNER_SIGNUP_URL}" target="_blank" rel="noopener">Become an affiliate <span aria-hidden="true">↗</span></a>
      <small class="affiliate-note">Free to join</small>
    </span>
  `;
  card.querySelector('.tripo-card__button').addEventListener('click', () => trackApiEvent('partner_join_click'));
  return card;
}
