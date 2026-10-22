import { APP_NAME } from '../config/app.js';

/**
 * Small "new version is live" toast. Earlier builds' files stay online for a
 * week after a deploy (scripts/keep-old-assets.mjs), so an open tab keeps
 * working; this just tells the visitor and lets them refresh when they're done.
 * Checks /version.json when the tab comes back into view and every 10 minutes.
 */

const CHECK_MS = 10 * 60 * 1000;
let shown = false;

async function check() {
  if (shown || document.visibilityState !== 'visible') return;
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { id } = await res.json();
    if (id && id !== __BUILD_ID__) show();
  } catch {
    /* offline or mid-deploy: try again next time */
  }
}

function show() {
  shown = true;
  const root = document.createElement('div');
  root.className = 'update-notice';
  root.setAttribute('role', 'status');
  root.innerHTML = `
    <p class="update-notice__text">
      <strong>${APP_NAME} has been updated.</strong>
      Your work here is safe. Refresh when you're ready to get the new version.
    </p>
    <div class="update-notice__actions">
      <button type="button" class="btn btn--primary update-notice__btn" data-update="refresh">Refresh</button>
      <button type="button" class="update-notice__dismiss" data-update="later" aria-label="Later, dismiss">✕</button>
    </div>`;
  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-update]')?.dataset.update;
    if (action === 'refresh') location.reload();
    else if (action === 'later') root.remove();
  });
  document.body.appendChild(root);
}

export function initUpdateNotice() {
  if (!import.meta.env.PROD) return;
  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', check);
}
