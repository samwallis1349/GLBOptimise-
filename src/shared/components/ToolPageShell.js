import { StatusBadge } from './StatusBadge.js';
import { TOOL_STATUS_LABELS } from '../config/app.js';

/**
 * Renders the shared header + placeholder body used by every tool page
 * that isn't fully built yet. A tool's own index.js decides whether to
 * render this (status 'coming-soon' / 'foundation-ready') or its real UI
 * (status 'available').
 *
 * @param {import('../config/tools.js').TOOLS[number]} tool
 * @param {{ extraNote?: string }} [options]
 * @returns {HTMLElement}
 */
export function ToolPageShell(tool, { extraNote } = {}) {
  const page = document.createElement('div');
  page.className = 'container section';

  const header = document.createElement('div');
  header.className = 'tool-page__header';
  header.innerHTML = `
    <div>
      <h1 class="tool-page__title">${tool.name}</h1>
      <p class="tool-page__description">${tool.description}</p>
    </div>
  `;
  header.appendChild(StatusBadge(tool.status));
  page.appendChild(header);

  const placeholder = document.createElement('div');
  placeholder.className = 'tool-page__placeholder';
  const statusLabel = TOOL_STATUS_LABELS[tool.status] ?? tool.status;
  placeholder.innerHTML = `
    <p><strong>${statusLabel}.</strong> This tool's page shell is wired into Asset Bench's
    navigation and shared components, but its processing engine has not been built yet.</p>
    ${extraNote ? `<p class="text-muted">${extraNote}</p>` : ''}
  `;
  page.appendChild(placeholder);

  return page;
}
