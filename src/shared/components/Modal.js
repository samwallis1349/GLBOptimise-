/**
 * Renders a modal into document.body and returns a `close()` function.
 *
 * @param {{ title: string, content: HTMLElement|string, actions?: HTMLElement[] }} options
 * @returns {() => void} close
 */
export function openModal({ title, content, actions = [] }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const heading = document.createElement('div');
  heading.className = 'modal__title';
  heading.textContent = title;
  modal.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'modal__body';
  if (typeof content === 'string') {
    body.textContent = content;
  } else {
    body.appendChild(content);
  }
  modal.appendChild(body);

  if (actions.length) {
    const actionsRow = document.createElement('div');
    actionsRow.className = 'modal__actions';
    actions.forEach((action) => actionsRow.appendChild(action));
    modal.appendChild(actionsRow);
  }

  overlay.appendChild(modal);

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') close();
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeydown);

  document.body.appendChild(overlay);
  return close;
}
