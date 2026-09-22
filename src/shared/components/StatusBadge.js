import { TOOL_STATUS_LABELS } from '../config/app.js';

/**
 * Renders a status pill. Accepts either a tool registry status
 * ('available' | 'foundation-ready' | 'coming-soon') or a file/job status
 * (e.g. 'READY', 'PROCESSING', 'FAILED') and lowercases it for the CSS
 * class + label lookup.
 *
 * @param {string} status
 * @param {string} [label] optional override for the displayed text
 * @returns {HTMLElement}
 */
export function StatusBadge(status, label) {
  const el = document.createElement('span');
  const key = status.toLowerCase();
  el.className = `status-badge status-badge--${key}`;
  el.textContent = label ?? TOOL_STATUS_LABELS[key] ?? status;
  return el;
}
