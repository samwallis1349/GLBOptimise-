import { getCategoryById, getToolDimension } from '../config/tools.js';
import { toolClip } from '../config/toolClips.js';
import { iconSvg } from '../utils/icons.js';
import { accentTitle, dimensionTag, escapeHtml, featureChips } from './ToolCard.js';
import { isToolWidgetOpen, onToolWidgetChange, openPopoutPreviewModal, openToolWidget, resizeToolWidget, WIDGET_SIZES } from './ToolWidget.js';

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
  card.dataset.dim = getToolDimension(tool).id;
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
        ${dimensionTag(tool)}
        ${tool.free ? '<span class="winner-card__free">Free tool</span>' : ''}
      </div>
      <p class="winner-card__category">${iconSvg(tool.icon, { class: 'winner-card__icon' })}${escapeHtml(category?.label ?? 'Tool')}</p>
      <h3 class="winner-card__title"><a href="${tool.route}">${accentTitle(tool.name)}</a></h3>
      <p class="winner-card__description">${escapeHtml(tool.description)}</p>
      ${featureChips(tool)}
      <div class="winner-card__actions">
        <a class="btn btn--primary winner-card__cta" href="${tool.route}">Open ${escapeHtml(tool.name)}<span aria-hidden="true">→</span></a>
        <div class="winner-card__widget-group">
          <button type="button" class="btn btn--secondary winner-card__popout" title="Pop out ${escapeHtml(tool.name)} as a resizable desktop widget outside the browser (closes when webpage is left)" aria-pressed="${isToolWidgetOpen(tool.id)}">
            ${iconSvg('popout', { class: 'winner-card__popout-icon' })}
            <span class="winner-card__popout-label">${isToolWidgetOpen(tool.id) ? 'Widget active' : 'Pop out widget'}</span>
          </button>
          <div class="winner-card__sizes" role="group" aria-label="Widget window size">
            ${Object.values(WIDGET_SIZES)
              .map(
                (s) =>
                  `<button type="button" class="winner-card__size-btn" data-wsize="${s.id}" title="Resize widget window: ${s.title}" aria-pressed="${s.id === 'm'}">${s.label}</button>`,
              )
              .join('')}
          </div>
          <button type="button" class="btn btn--secondary winner-card__preview-popout" title="Open interactive Popout Widget Preview popup">Preview</button>
        </div>
      </div>
    </div>
  `;

  let selectedSize = 'm';
  const popoutBtn = card.querySelector('.winner-card__popout');
  const popoutLabel = card.querySelector('.winner-card__popout-label');
  popoutBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openToolWidget(tool, { detach: true, size: selectedSize });
  });
  card.querySelector('.winner-card__preview-popout')?.addEventListener('click', (e) => {
    e.preventDefault();
    openPopoutPreviewModal(tool.id);
  });

  card.querySelectorAll('.winner-card__size-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      selectedSize = btn.dataset.wsize || 'm';
      card.querySelectorAll('.winner-card__size-btn').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.wsize === selectedSize));
      });
      if (isToolWidgetOpen(tool.id)) {
        resizeToolWidget(selectedSize);
      } else {
        openToolWidget(tool, { detach: true, size: selectedSize });
      }
    });
  });

  const syncWidgetState = ({ open, tool: active, detached, size }) => {
    if (!card.isConnected) return;
    const isThisOpen = open && active?.id === tool.id;
    popoutBtn?.setAttribute('aria-pressed', String(isThisOpen));
    if (popoutLabel) {
      popoutLabel.textContent = isThisOpen ? (detached ? 'External widget active' : 'Widget active') : 'Pop out widget';
    }
    if (size) {
      selectedSize = size;
      card.querySelectorAll('.winner-card__size-btn').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.wsize === size));
      });
    }
  };
  onToolWidgetChange(syncWidgetState);

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
