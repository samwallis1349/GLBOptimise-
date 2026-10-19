const DISMISSED_KEY = 'assetbench_api_launch_v2';

const PRODUCTS = [
  ['GLB optimisation', 'one call makes a model game-ready for a phone, Quest or the web'],
  ['Batch', 'run any of it over a whole folder'],
  ['KTX2', 'GPU-compressed textures'],
  ['Audit', 'which devices can run this model?'],
  ['Convert', 'FBX, OBJ, glTF to GLB'],
  ['LODs', 'level-of-detail chains'],
  ['iOS assets', 'icons, .xcassets, store screenshots'],
];

function seen(key) {
  try { return Boolean(localStorage.getItem(key) || sessionStorage.getItem(key)); } catch { return false; }
}

function remember() {
  try {
    localStorage.setItem(DISMISSED_KEY, 'true');
    sessionStorage.setItem(DISMISSED_KEY, 'true');
  } catch {}
}

/** Anonymous launch counters (see worker/api/stats.js); never blocks or throws. */
export function trackApiEvent(event) {
  try {
    fetch('/api/v1/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }), keepalive: true }).catch(() => {});
  } catch {}
}

/** Announces the free Cloud API once per visitor. */
export function initApiLaunchModal() {
  if (typeof window === 'undefined') return;
  if (location.pathname.startsWith('/docs')) return;
  if (seen(DISMISSED_KEY)) return;

  setTimeout(() => {
    if (document.querySelector('.welcome-modal-overlay')) return;
    openApiLaunchModal();
  }, 1500);
}

export function openApiLaunchModal() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'api-launch-title');

  overlay.innerHTML = `
    <div class="welcome-modal api-launch">
      <button class="welcome-modal__close" type="button" aria-label="Close">✕</button>
      <div class="api-launch__card">
        <span class="api-launch__badge">New · Free to try · Included in All Access (£10/m)</span>
        <h2 class="api-launch__title" id="api-launch-title">The AssetBench API</h2>
        <p class="api-launch__lede">Everything AssetBench does, from your own code. 100 free operations/month, or 1,000/month included with the £10/m All Access subscription.</p>
        <ul class="api-launch__list">
          ${PRODUCTS.map(([name, what]) => `<li><b>${name}</b><span>${what}</span></li>`).join('')}
        </ul>
        <a class="api-launch__cta" href="/docs/">Try the API free →</a>
        <button class="api-launch__later" type="button">Maybe later</button>
      </div>
    </div>
  `;

  function onKeydown(e) {
    if (e.key === 'Escape') dismiss();
  }
  function close() {
    remember();
    overlay.classList.add('welcome-modal-overlay--closing');
    document.removeEventListener('keydown', onKeydown);
    setTimeout(() => overlay.remove(), 220);
  }
  function dismiss() {
    trackApiEvent('popup_dismiss');
    close();
  }

  overlay.querySelector('.welcome-modal__close').addEventListener('click', dismiss);
  overlay.querySelector('.api-launch__later').addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
  overlay.querySelector('.api-launch__cta').addEventListener('click', (e) => {
    trackApiEvent('popup_click');
    // Open the playground over the current page; the href stays as a fallback.
    e.preventDefault();
    close();
    openApiPanel();
  });

  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('welcome-modal-overlay--open'));
  trackApiEvent('popup_shown');
  overlay.querySelector('.api-launch__cta').focus({ preventScroll: true });
  return close;
}

/**
 * The API playground (/docs) in a panel over the current page, so trying
 * the API never takes a visitor away from the tool they were using.
 */
export function openApiPanel() {
  if (document.querySelector('.api-panel-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'welcome-modal-overlay api-panel-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'AssetBench API playground');
  overlay.innerHTML = `
    <div class="api-panel">
      <div class="api-panel__bar">
        <span class="api-panel__title">AssetBench API <span class="api-panel__tag">New · Free to try</span></span>
        <a class="api-panel__full" href="/docs/" target="_blank" rel="noopener">Open full page ↗</a>
        <button class="api-panel__close" type="button" aria-label="Close">✕</button>
      </div>
      <iframe class="api-panel__frame" src="/docs/?embed=1" title="AssetBench API playground"></iframe>
    </div>
  `;
  const previousFocus = document.activeElement;
  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    overlay.classList.add('welcome-modal-overlay--closing');
    document.removeEventListener('keydown', onKeydown);
    document.documentElement.style.overflow = '';
    setTimeout(() => { overlay.remove(); previousFocus?.focus?.(); }, 220);
  }
  overlay.querySelector('.api-panel__close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKeydown);
  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('welcome-modal-overlay--open'));
  overlay.querySelector('.api-panel__close').focus({ preventScroll: true });
  trackApiEvent('panel_open');
  return close;
}
