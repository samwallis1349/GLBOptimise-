/**
 * Wraps a trigger element with a hover/focus tooltip bubble.
 *
 * @param {HTMLElement} triggerEl
 * @param {string} text
 * @returns {HTMLElement} wrapper element to insert into the DOM
 */
export function Tooltip(triggerEl, text) {
  const wrapper = document.createElement('span');
  wrapper.className = 'tooltip';

  triggerEl.setAttribute('tabindex', triggerEl.getAttribute('tabindex') ?? '0');

  const bubble = document.createElement('span');
  bubble.className = 'tooltip__bubble';
  bubble.setAttribute('role', 'tooltip');
  bubble.textContent = text;

  wrapper.append(triggerEl, bubble);
  return wrapper;
}
