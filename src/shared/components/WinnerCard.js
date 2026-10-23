import { getCategoryById } from '../config/tools.js';
import { toolClip } from '../config/toolClips.js';
import { iconSvg } from '../utils/icons.js';
import { accentTitle, escapeHtml, featureChips } from './ToolCard.js';

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The full-width card for the most-used tool at the top of a tool grid. One
 * template for whichever tool wins: its 16:9 promo clip (playing muted while
 * on screen, poster first; the wide banner or thumbnail when a tool has no
 * clip) beside its title, description and an Open button. Everything comes
 * from the registry entry, so a new leader needs no new artwork.
 *
 * `badge` replaces the "Most used tool" label (the /tools page leads each category with this card).
 *
 * @param {import('../config/tools.js').TOOLS[number]} tool
 * @param {{ badge?: string }} [options]
 * @returns {HTMLElement}
 */
export function WinnerCard(tool, { badge = 'Most used tool' } = {}) {
  const category = getCategoryById(tool.category);
  const clip = toolClip(tool.id);
  const still = clip?.poster ?? tool.banner ?? tool.thumbnail;

  const card = document.createElement('article');
  card.className = 'winner-card';
  if (category) card.style.setProperty('--card-accent', `var(${category.accent})`);
  card.innerHTML = `
    <a class="winner-card__media" href="${tool.route}" tabindex="-1" aria-hidden="true">
      ${still ? `<img class="winner-card__still" src="${still}" alt="" fetchpriority="high" decoding="async">` : ''}
      ${clip ? '<video class="winner-card__video" muted loop playsinline preload="none"></video>' : ''}
      <span class="winner-card__live"${clip ? '' : ' hidden'}><i></i>Live preview</span>
    </a>
    <div class="winner-card__body">
      <div class="winner-card__badges">
        <span class="winner-card__badge">★ ${escapeHtml(badge)}</span>
        ${tool.free ? '<span class="winner-card__free">Free tool</span>' : ''}
      </div>
      <p class="winner-card__category">${iconSvg(tool.icon, { class: 'winner-card__icon' })}${escapeHtml(category?.label ?? 'Tool')}</p>
      <h3 class="winner-card__title"><a href="${tool.route}">${accentTitle(tool.name)}</a></h3>
      <p class="winner-card__description">${escapeHtml(tool.description)}</p>
      ${featureChips(tool)}
      <a class="btn btn--primary winner-card__cta" href="${tool.route}">Open ${escapeHtml(tool.name)}<span aria-hidden="true">→</span></a>
    </div>
  `;

  const video = card.querySelector('video');
  if (video && !reduceMotion && typeof IntersectionObserver === 'function') {
    video.addEventListener('playing', () => card.classList.add('is-playing'));
    const observer = new IntersectionObserver(([entry]) => {
      if (!card.isConnected) return observer.disconnect();
      if (entry.isIntersecting) {
        if (!video.src) video.src = clip.src;
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }, { threshold: 0.35 });
    observer.observe(card);
  }

  return card;
}
