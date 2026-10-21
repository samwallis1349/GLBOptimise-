// v3: the three-product API with the poster; visitors who closed v2 see it once more.
const DISMISSED_KEY = 'assetbench_api_launch_v3';

/** The API's three products (worker/api/plans.js PRODUCTS). */
const PRODUCTS = [
  { name: 'Check a model', tag: 'Free', what: 'A score for every phone and headset class, and what to fix first.', endpoint: '/check' },
  { name: 'Make it game-ready', what: 'Optimised GLB, LODs, collision and KTX2 in one ZIP for Unity, Unreal, Godot, Roblox or the web.', endpoint: '/game-ready' },
  { name: 'App store assets', what: 'One square image becomes every app icon. Screenshots become every store size.', endpoint: '/app-assets' },
];

/** Every public endpoint (the /docs reference), by group; `*` marks a free one. */
const COMMANDS = [
  ['Main', ['/check*', '/game-ready', '/app-assets', '/app-assets/screenshots', '/batch']],
  ['Single steps', ['/3d/optimize', '/3d/reduce*', '/3d/lods', '/3d/convert', '/textures/ktx2', '/textures/resize', '/ios/xcassets']],
  ['Info', ['/auth/me', '/openapi.json', '/pricing', '/devices', '/formats', '/intent?target=…']],
];
const command = (c) => (c.endsWith('*') ? `<code>${c.slice(0, -1)}</code> (Free)` : `<code>${c}</code>`);

/** worker/api/plans.js */
const PLANS = [
  { name: 'Free', price: '£0', ops: '100 operations/month', note: 'No card. Checks unlimited.' },
  { name: 'All Access', price: '£10/mo', ops: '1,000 operations/month', note: 'Plus every site tool and extension.', featured: true },
  { name: 'Studio', price: '£99/mo', ops: '5,000 operations/month', note: 'For whole asset libraries.' },
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
        <figure class="api-launch__poster">
          <img src="/images/api-poster.svg" width="1200" height="640" alt="One API request turns a heavy 3D model into a low-poly, game-ready version with LODs, for phones, Quest and the web, plus every app icon size">
          <span class="api-launch__badge">New · Checks are free</span>
        </figure>
        <div class="api-launch__body">
          <h2 class="api-launch__title" id="api-launch-title">Game-ready assets from <em>one API call</em></h2>
          <p class="api-launch__lede">Send a 3D model or an app icon from your own code, a script or a terminal. Get back files ready for your engine or the app stores in seconds. Nothing to install, and your files are never stored.</p>
          <ul class="api-launch__products">
            ${PRODUCTS.map((p) => `<li><span class="api-launch__product-head"><b>${p.name}</b>${p.tag ? `<span class="api-launch__tag">${p.tag}</span>` : ''}</span><span>${p.what}</span><code>POST /api/v1${p.endpoint}</code></li>`).join('')}
          </ul>
          <table class="api-launch__commands">
            <thead><tr><th scope="col">Group</th><th scope="col">Commands</th></tr></thead>
            <tbody>${COMMANDS.map(([group, list]) => `<tr><th scope="row">${group}</th><td>${list.map(command).join(', ')}</td></tr>`).join('')}</tbody>
          </table>
          <ul class="api-launch__plans" aria-label="Plans">
            ${PLANS.map((p) => `<li${p.featured ? ' class="is-featured"' : ''}><b>${p.name}</b><strong>${p.price}</strong><span>${p.ops}</span><small>${p.note}</small></li>`).join('')}
          </ul>
          <div class="api-launch__actions">
            <a class="api-launch__cta" href="/docs/">Get a free key →</a>
            <a class="api-launch__plans-link" href="/pricing">Compare plans</a>
            <button class="api-launch__later" type="button">Maybe later</button>
          </div>
        </div>
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
  overlay.querySelector('.api-launch__plans-link').addEventListener('click', close);
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
