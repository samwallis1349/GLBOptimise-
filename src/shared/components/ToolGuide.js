import { getToolGuide } from '../config/toolGuides.js';

const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The guide's markup as a string. Shared with scripts/seo-pages.mjs, which
 * puts the same text into the static HTML, so crawlers and visitors read the
 * same words.
 *
 * @param {{ heading: string, intro: string[], steps?: string[], faqs?: { q: string, a: string }[] }} guide
 */
export function toolGuideMarkup(guide) {
  const steps = guide.steps?.length
    ? `<h3 class="tool-guide__subtitle">Step by step</h3>
       <ol class="tool-guide__steps">${guide.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
    : '';
  const faqs = guide.faqs?.length
    ? `<h3 class="tool-guide__subtitle">Questions</h3>
       <div class="tool-guide__faqs">${guide.faqs
         .map((f) => `<details class="tool-guide__faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
         .join('')}</div>`
    : '';
  return `<h2 class="tool-guide__title">${esc(guide.heading)}</h2>
    ${guide.intro.map((p) => `<p class="tool-guide__text">${esc(p)}</p>`).join('')}
    ${steps}
    ${faqs}`;
}

/**
 * "How to" guide and FAQs under a tool, for tools that have one in
 * shared/config/toolGuides.js.
 *
 * @param {import('../config/tools.js').TOOLS[number]} tool
 * @returns {HTMLElement|null}
 */
export function ToolGuide(tool) {
  const guide = getToolGuide(tool.id);
  if (!guide) return null;
  const section = document.createElement('section');
  section.className = 'tool-guide container';
  section.setAttribute('aria-label', `${tool.name} guide`);
  section.innerHTML = toolGuideMarkup(guide);
  return section;
}
