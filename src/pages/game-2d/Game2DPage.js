import { GAME_2D_GROUPS, getToolById } from '../../shared/config/tools.js';
import { escapeHtml } from '../../shared/components/ToolCard.js';
import { StatusBadge } from '../../shared/components/StatusBadge.js';
import { TOOL_PRICE_LABEL } from '../../shared/config/toolProducts.js';
import { PRICE_LABEL } from '../../shared/config/billing.js';
import { EXPORTS, engineNotesMarkup } from '../../shared/config/game2d.js';
import { getToolGuide } from '../../shared/config/toolGuides.js';
import { toolClip } from '../../shared/config/toolClips.js';

/**
 * /2d-games: one section per tool, each with its clip, a short how-to and
 * what it hands over. The how-to steps and questions come from
 * shared/config/toolGuides.js, the same text shown under the tool itself,
 * so the two never drift apart. Engine notes close the page.
 */
export function render(container) {
  container.innerHTML = '';

  const groups = GAME_2D_GROUPS.map((group) => ({
    ...group,
    tools: group.tools.map(getToolById).filter(Boolean),
  })).filter((group) => group.tools.length);

  const section = document.createElement('section');
  section.className = 'section container game-2d';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">2D &amp; Isometric Game Tools</h1>
        <p class="tool-page__description">Tools for sprite-based games, from isometric scenes to 2D sprite sheets. Each one runs in your browser, with a quick how-to below.</p>
        <p class="game-2d__price"><b>${TOOL_PRICE_LABEL}</b> per tool, paid once and yours to keep. Or every tool in <a href="/pricing">All Access, ${PRICE_LABEL}</a>.</p>
      </div>
    </div>
    <nav class="game-2d__index" aria-label="Tools on this page">
      ${groups.map((group) => `
        <div class="game-2d__index-group">
          <span class="game-2d__index-label">${escapeHtml(group.label)}</span>
          <ul>${group.tools.map((tool) => `<li><a href="#${tool.id}">${escapeHtml(tool.name)}</a></li>`).join('')}</ul>
        </div>`).join('')}
      <div class="game-2d__index-group">
        <span class="game-2d__index-label">Then</span>
        <ul><li><a href="#engines">Ready for your engine</a></li></ul>
      </div>
    </nav>
  `;

  const videos = [];
  for (const group of groups) {
    const block = document.createElement('div');
    block.className = 'game-2d__group';
    block.id = group.id;
    block.innerHTML = `
      <h2 class="section__heading">${escapeHtml(group.label)}</h2>
      <p class="tool-page__description">${escapeHtml(group.description)}</p>
    `;
    for (const tool of group.tools) {
      const article = ToolHowTo(tool);
      const video = article.querySelector('video');
      if (video) videos.push(video);
      block.appendChild(article);
    }
    section.appendChild(block);
  }

  // How Godot, Unity, Phaser and tile maps take the exports (shared/config/game2d.js).
  const engines = document.createElement('div');
  engines.className = 'game-2d__group';
  engines.id = 'engines';
  engines.innerHTML = `
    <h2 class="section__heading">Ready for your engine</h2>
    <p class="tool-page__description">Every sprite is rendered with the same camera and scale and stands on the same ground point, so sprites from different models line up on one grid.</p>
    ${engineNotesMarkup(escapeHtml)}
  `;
  section.appendChild(engines);

  container.appendChild(section);
  playInView(videos);
}

/** One tool's block: clip, name and price, numbered steps, what you get, questions. */
function ToolHowTo(tool) {
  const guide = getToolGuide(tool.id);
  const clip = toolClip(tool.id);
  const gives = EXPORTS.find((e) => e.tool === tool.id)?.gives;
  const price = tool.free ? 'Free' : `${TOOL_PRICE_LABEL} once`;

  const article = document.createElement('article');
  article.className = 'game-2d__tool';
  article.id = tool.id;
  article.setAttribute('aria-labelledby', `${tool.id}-title`);

  const media = clip
    ? `<video class="game-2d__clip" poster="${clip.poster}" data-src="${clip.src}" muted loop playsinline preload="none" aria-label="${escapeHtml(tool.name)} in 5 seconds"></video>`
    : tool.thumbnail
      ? `<img class="game-2d__clip" src="${tool.thumbnail}" alt="" loading="lazy" />`
      : '';

  const steps = guide?.steps?.length
    ? `<h4 class="game-2d__sub">How to use it</h4>
       <ol class="game-2d__steps">${guide.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
    : '';

  const faqs = guide?.faqs?.length
    ? `<details class="game-2d__faqs">
         <summary>Common questions (${guide.faqs.length})</summary>
         ${guide.faqs.map((f) => `<div class="game-2d__faq"><b>${escapeHtml(f.q)}</b><p>${escapeHtml(f.a)}</p></div>`).join('')}
       </details>`
    : '';

  article.innerHTML = `
    <div class="game-2d__media">${media}</div>
    <div class="game-2d__body">
      <div class="game-2d__head">
        <h3 class="game-2d__name" id="${tool.id}-title">${escapeHtml(tool.name)}</h3>
        <span class="game-2d__status"></span>
      </div>
      <p class="game-2d__lede">${escapeHtml(guide?.intro?.[0] ?? tool.description)}</p>
      ${steps}
      ${gives ? `<p class="game-2d__gives"><span>You get</span>${escapeHtml(gives)}</p>` : ''}
      <div class="game-2d__actions">
        <a class="btn btn--primary" href="${tool.route}">Open ${escapeHtml(tool.name)} →</a>
        <span class="game-2d__cost">${escapeHtml(price)}</span>
      </div>
      ${faqs}
    </div>
  `;
  const badge = StatusBadge(tool.status);
  if (badge) article.querySelector('.game-2d__status').appendChild(badge);
  return article;
}

/** Clips load and play only while on screen, like ToolClip does under each tool. */
function playInView(videos) {
  if (!videos.length || !('IntersectionObserver' in window)) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const observer = new IntersectionObserver((entries) => {
    for (const { target: video, isIntersecting } of entries) {
      if (!video.isConnected) { observer.unobserve(video); continue; }
      if (isIntersecting && !still) {
        if (!video.src) video.src = video.dataset.src;
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  }, { threshold: 0.4 });
  videos.forEach((video) => observer.observe(video));
}
