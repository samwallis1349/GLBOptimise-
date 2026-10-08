import { TRIPO_AFFILIATE_URL } from '../config/affiliates.js';

const DISMISSED_KEY = 'assetbench_welcome_tripo_v1';

/**
 * Initializes the welcome modal for first-time visitors.
 * Delays presentation slightly to allow initial page layout to settle.
 */
export function initWelcomeModal() {
  if (typeof window === 'undefined') return;

  try {
    if (localStorage.getItem(DISMISSED_KEY) || sessionStorage.getItem(DISMISSED_KEY)) {
      return;
    }
  } catch {
    // If storage is disabled, proceed
  }

  // Brief delay after initial page render so it doesn't interrupt first paint
  setTimeout(() => {
    if (document.querySelector('.welcome-modal-overlay')) return;
    openWelcomeModal();
  }, 1200);
}

/**
 * Opens the Tripo AI affiliate welcome modal dialog.
 */
export function openWelcomeModal() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Welcome to AssetBench — Tripo 3D Generator');

  overlay.innerHTML = `
    <div class="welcome-modal">
      <button class="welcome-modal__close" type="button" aria-label="Close modal">✕</button>
      <a class="welcome-modal__link" href="${TRIPO_AFFILIATE_URL}" target="_blank" rel="noopener noreferrer">
        <img class="welcome-modal__img" src="/images/tripo-promo.webp" alt="Welcome to AssetBench — Start generating game-ready 3D models with Tripo AI" width="1200" height="1607" />
      </a>
    </div>
  `;

  function close() {
    overlay.classList.add('welcome-modal-overlay--closing');
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
      sessionStorage.setItem(DISMISSED_KEY, 'true');
    } catch {}
    setTimeout(() => {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
    }, 220);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  const closeBtn = overlay.querySelector('.welcome-modal__close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    close();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const link = overlay.querySelector('.welcome-modal__link');
  link.addEventListener('click', () => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
      sessionStorage.setItem(DISMISSED_KEY, 'true');
    } catch {}
    close();
  });

  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add('welcome-modal-overlay--open');
  });

  return close;
}
