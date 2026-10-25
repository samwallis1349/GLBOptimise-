import { StatusBadge } from './StatusBadge.js';
import { iconSvg } from '../utils/icons.js';
import { toolClip } from '../config/toolClips.js';
import { getToolDimension } from '../config/tools.js';
import { accentTitle, dimensionTag, escapeHtml, featureChips } from './ToolCard.js';

const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One tool tile on the /tools bento grid: the tool's 16:9 clip poster on top
 * (its square thumbnail when it has no clip), then its icon tab, name,
 * status, chips, description and Open Tool.
 *
 * Pointing at the card plays the tool's clip (public/media/clips) over the
 * poster. The video element is only made on the first hover, so the page
 * downloads no video until someone points at a card; touch screens and
 * reduced-motion visitors keep the still.
 *
 * Cards sit under their category's heading, so they don't repeat the
 * category. The 2D / 3D tag sits on the poster and `data-dim` colours the
 * border (bento.css). The page sets each card's span (--span-c / --span-r) and adds
 * `bento-card--wide` when a card fills a short last row.
 *
 * @param {import('../config/tools.js').TOOLS[number]} tool
 * @returns {HTMLElement}
 */
export function BentoCard(tool) {
  const isAvailable = tool.status === 'available' || tool.status === 'beta';
  const clip = toolClip(tool.id);
  const still = clip?.poster ?? tool.thumbnail;

  const card = document.createElement('a');
  card.className = 'bento-card';
  card.href = tool.route;
  card.dataset.status = tool.status;
  card.dataset.dim = getToolDimension(tool).id;

  const mcp = tool.mcp?.length ? `<span class="bento-card__mcp" title="Also in the AssetBench MCP server: ${escapeHtml(tool.mcp.join(', '))}">MCP</span>` : '';
  const cta = isAvailable
    ? `<span class="bento-card__cta"><span>Open Tool</span><span aria-hidden="true">→</span></span>`
    : '<span class="bento-card__cta bento-card__cta--soon"><span>Coming soon</span></span>';

  card.innerHTML = `
    <div class="bento-card__art">
      ${
        still
          ? `<img class="bento-card__still" src="${still}" alt="" width="640" height="360" loading="lazy" decoding="async" />`
          : iconSvg(tool.icon, { class: 'bento-card__art-icon' })
      }
      ${dimensionTag(tool)}
      ${clip && canHover && !reduceMotion ? '<span class="bento-card__play" aria-hidden="true">▶ Preview</span>' : ''}
      ${tool.free ? '<span class="bento-card__free">Free tool</span>' : ''}
    </div>
    <div class="bento-card__body">
      <div class="bento-card__top">
        <span class="bento-card__tab" aria-hidden="true">${iconSvg(tool.icon, { class: 'bento-card__tab-icon' })}</span>
        <h3 class="bento-card__name">${accentTitle(tool.name)}</h3>
        <span class="bento-card__badges">${mcp}</span>
      </div>
      ${featureChips(tool)}
      <p class="bento-card__description" title="${escapeHtml(tool.description).replace(/"/g, '&quot;')}">${escapeHtml(tool.description)}</p>
      <div class="bento-card__footer">${cta}</div>
    </div>
  `;

  card.querySelector('.bento-card__badges').appendChild(StatusBadge(tool.status));
  if (clip && canHover && !reduceMotion) playOnHover(card, clip.src);
  return card;
}

/**
 * Spans for a bento grid on 12 columns: the first tool takes the big panel
 * (8 × 2), the next two stack beside it, and the rest follow three to a row,
 * so every card is the same size. A short last row widens to fill: one card
 * spans all 12, two take 6 each (both drawn side by side, see bento.css).
 */
export function layoutSpans(count) {
  const spans = [{ cols: 8, rows: 2 }, { cols: 4, rows: 1 }, { cols: 4, rows: 1 }].slice(0, count);
  const rest = count - spans.length;
  const lastRow = rest % 3;
  for (let i = 0; i < rest; i += 1) {
    const inLastRow = lastRow && i >= rest - lastRow;
    spans.push({ cols: inLastRow ? 12 / lastRow : 4, rows: 1 });
  }
  return spans;
}

/** Plays the clip over the poster while the pointer is on the card, from the start each time. */
function playOnHover(card, src) {
  const art = card.querySelector('.bento-card__art');
  let video = null;
  card.addEventListener('pointerenter', () => {
    if (!video) {
      video = document.createElement('video');
      video.className = 'bento-card__clip';
      video.src = src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('aria-hidden', 'true');
      video.addEventListener('playing', () => card.classList.add('is-playing'));
      art.appendChild(video);
    }
    video.currentTime = 0;
    video.play().catch(() => {});
  });
  card.addEventListener('pointerleave', () => {
    if (!video) return;
    video.pause();
    card.classList.remove('is-playing');
  });
}
