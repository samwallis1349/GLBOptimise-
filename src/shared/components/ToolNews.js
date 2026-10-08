import { getToolNews } from '../config/toolNews.js';
import { getToolById } from '../config/tools.js';
import { TRIPO_AFFILIATE_URL } from '../config/affiliates.js';
import { iconSvg } from '../utils/icons.js';

/**
 * Renders the editorial News, Changelog & Pro Tips section on each tool page.
 *
 * @param {import('../config/tools.js').Tool} tool
 * @returns {HTMLElement|null}
 */
export function ToolNews(tool) {
  const news = getToolNews(tool);
  if (!news) return null;

  const section = document.createElement('section');
  section.className = 'tool-news container';
  section.setAttribute('aria-label', `${tool.name} News & Workflow Notes`);

  const related = (news.relatedTools || [])
    .map((id) => getToolById(id))
    .filter(Boolean);

  section.innerHTML = `
    <div class="tool-news__header">
      <div class="tool-news__eyebrow">Latest Updates & Workflow News</div>
      <h2 class="tool-news__title">${tool.name} News & Guides</h2>
      <p class="tool-news__subtitle">Technical changelog, industry engine guidelines, and recommended workflows for this tool.</p>
    </div>

    <div class="tool-news__grid">
      <!-- Card 1: Changelog / What's New -->
      <article class="tool-news__card tool-news__card--changelog">
        <div class="tool-news__card-header">
          <span class="tool-news__tag tool-news__tag--version">${news.version}</span>
          <span class="tool-news__date">${news.date}</span>
        </div>
        <h3 class="tool-news__card-title">${news.title}</h3>
        <p class="tool-news__card-text">${news.content}</p>
      </article>

      <!-- Card 2: Pro Tip / Best Practice -->
      <article class="tool-news__card tool-news__card--tip">
        <div class="tool-news__card-header">
          <span class="tool-news__tag tool-news__tag--tip">${iconSvg('zap', { class: 'tool-news__tag-icon' })} Pro Tip</span>
        </div>
        <h3 class="tool-news__card-title">${news.proTipTitle}</h3>
        <p class="tool-news__card-text">${news.proTip}</p>
      </article>

      <!-- Card 3: AI Model Generation Partner (Tripo 3D) -->
      <article class="tool-news__card tool-news__card--partner">
        <div class="tool-news__card-header">
          <span class="tool-news__tag tool-news__tag--partner">${iconSvg('wand-2', { class: 'tool-news__tag-icon' })} AI 3D Partner</span>
        </div>
        <h3 class="tool-news__card-title">Generate 3D Assets with Tripo AI</h3>
        <p class="tool-news__card-text">Turn text prompts or 2D concept images into textured 3D models in seconds, then drop them into AssetBench to optimize and inspect.</p>
        <div class="tool-news__card-action">
          <a class="btn btn--secondary tool-news__partner-btn" href="${TRIPO_AFFILIATE_URL}" target="_blank" rel="noopener noreferrer">
            Try Tripo AI <span aria-hidden="true">→</span>
          </a>
        </div>
      </article>
    </div>

    ${
      related.length
        ? `
      <div class="tool-news__related">
        <span class="tool-news__related-label">Related Tools on the Bench:</span>
        <div class="tool-news__chips">
          ${related
            .map(
              (r) => `
            <a class="tool-news__chip" href="${r.route}">
              ${iconSvg(r.icon, { class: 'tool-news__chip-icon' })}
              <span>${r.name}</span>
            </a>`
            )
            .join('')}
        </div>
      </div>
    `
        : ''
    }
  `;

  return section;
}
