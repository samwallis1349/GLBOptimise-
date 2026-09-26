import { StatusBadge } from './StatusBadge.js';
import { TOOLS, getCategoryById } from '../config/tools.js';
import { iconSvg } from '../utils/icons.js';

/**
 * Renders a single tool card from a tool registry entry
 * (see src/shared/config/tools.js).
 *
 * Anatomy, top to bottom: the tool's own artwork with a numbered pill and a
 * gradient landing into the body, then a two-tone title, a spec line, three
 * feature chips, the description, and a footer holding status + the call to
 * action. Everything on the card is derived from the registry entry — there
 * is no per-tool markup anywhere, and nothing here loads an asset the app
 * doesn't already ship.
 *
 * Three derivations do the work that would otherwise need hand-written HTML
 * per card:
 *
 *  - the index pill counts the tool's position in TOOLS, so reordering the
 *    registry renumbers every card automatically;
 *  - the title splits on its last word, which is the distinguishing one in
 *    every name the registry uses (Reduce *Polys*, Rig *Inspector*), and
 *    that word takes the accent colour;
 *  - the spec line reuses the `keywords` already stored for search rather
 *    than introducing a second copy of the same prose as the description.
 *
 * Hover lighting is not implemented here: shared/effects/CursorSpotlight.js
 * already tracks `.tool-card`, sets `--card-mx`/`--card-my` and toggles
 * `.is-lit`. This card is built to catch that light (see components.css)
 * rather than to run its own pointer listeners — 17 cards each with their
 * own listener is exactly the cost that system exists to avoid.
 *
 * Options: `index` overrides the numbered pill (for pages that show tools
 * in their own order), and `featured` renders the double-width variant
 * using the tool's wide `banner` artwork.
 *
 * @param {import('../config/tools.js').TOOLS[number]} tool
 * @param {{ index?: number, featured?: boolean }} [options]
 * @returns {HTMLElement}
 */
export function ToolCard(tool, { index: displayIndex, featured = false } = {}) {
  const category = getCategoryById(tool.category);
  const isAvailable = tool.status === 'available' || tool.status === 'beta';

  const card = document.createElement('a');
  const wide = featured && Boolean(tool.banner);
  card.className = `tool-card${wide ? ' tool-card--featured' : ''}`;
  card.href = tool.route;
  card.dataset.status = tool.status;
  if (category) card.style.setProperty('--card-accent', `var(${category.accent})`);

  const position = displayIndex ?? TOOLS.indexOf(tool) + 1;
  const index = String(position > 0 ? position : 0).padStart(2, '0');
  const image = wide ? tool.banner : tool.thumbnail;

  card.innerHTML = `
    <div class="tool-card__visual${image ? ' tool-card__visual--photo' : ''}">
      ${
        image
          ? `<img class="tool-card__visual-img" src="${escapeAttr(image)}" alt="" ${wide ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" />`
          : iconSvg(tool.icon, { class: 'tool-card__visual-icon' })
      }
      <span class="tool-card__scan" aria-hidden="true"></span>
      <span class="tool-card__index">${wide ? 'New · ' : ''}#${index}</span>
    </div>

    <div class="tool-card__body">
      <h3 class="tool-card__name">${accentTitle(tool.name)}</h3>
      ${specLine(tool) ? `<p class="tool-card__spec">${specLine(tool)}</p>` : ''}
      ${featureChips(tool)}
      <p class="tool-card__description">${escapeHtml(tool.description)}</p>
      <div class="tool-card__footer"></div>
    </div>
  `;

  const footer = card.querySelector('.tool-card__footer');
  footer.appendChild(StatusBadge(tool.status));

  const cta = document.createElement('span');
  cta.className = `tool-card__cta${isAvailable ? '' : ' tool-card__cta--soon'}`;
  cta.innerHTML = isAvailable
    ? `<span>Open Tool</span><svg class="tool-card__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"/><path d="m12 5 7 7-7 7"/></svg>`
    : '<span>Coming soon</span>';
  footer.appendChild(cta);

  return card;
}

/**
 * Splits a tool name so its last word carries the accent colour — the last
 * word is the distinguishing one in every registry name (Optimise *GLB*,
 * Model *Splitter*). An ampersand is pulled across with the word that
 * follows it so "GLB Builder & Merger" doesn't break as "… &" / "Merger".
 */
function accentTitle(name) {
  const words = String(name).trim().split(/\s+/);
  if (words.length < 2) return `<span class="accent">${escapeHtml(name)}</span>`;

  let tailCount = 1;
  if (words[words.length - 2] === '&') tailCount = 2;

  const head = words.slice(0, words.length - tailCount).join(' ');
  const tail = words.slice(words.length - tailCount).join(' ');
  return `${escapeHtml(head)} <span class="accent">${escapeHtml(tail)}</span>`;
}

/**
 * The small uppercase spec line under the title, built from the `keywords`
 * the registry already stores for search. Long keywords are skipped rather
 * than truncated — a spec line should read as terse labels, and a clipped
 * word reads as a bug.
 */
function specLine(tool) {
  const parts = (tool.keywords ?? [])
    .filter((word) => typeof word === 'string' && word.length <= 12)
    .slice(0, 3)
    .map((word) => escapeHtml(word));
  return parts.length ? parts.join(' <span class="tool-card__spec-dot">·</span> ') : '';
}

/**
 * Three compact benefit chips. Icons come from the app's own hand-authored
 * set (shared/utils/icons.js); a tool without `features` simply renders no
 * chip row rather than falling back to invented labels.
 */
function featureChips(tool) {
  const features = (tool.features ?? []).slice(0, 3);
  if (!features.length) return '';

  return `
    <ul class="tool-card__features">
      ${features
        .map(
          (feature) => `
        <li class="tool-card__feature">
          ${iconSvg(feature.icon, { class: 'tool-card__feature-icon' })}
          <span>${escapeHtml(feature.label)}</span>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
