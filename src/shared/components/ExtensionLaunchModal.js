import { EXTENSIONS } from '../config/extensions.js';
import { trackApiEvent } from './ApiLaunchModal.js';
import { openExtensionsModal, downloadZip, BROWSERS, detectBrowser, steps } from './ExtensionsModal.js';
import { toolClip } from '../config/toolClips.js';

/**
 * The first-visit popup (takes over from the MCP one): the GLB Inspector
 * extension, from the Chrome Web Store or as a zip to load unpacked.
 * Everything you'd tune is here.
 */
const CONFIG = {
  extensionId: 'inspector', // an EXTENSIONS entry (config/extensions.js); its `url` is the store listing
  delayMs: 8000, // or exit intent, whichever comes first
  cooldownDays: 14, // after ×, Maybe later, Esc or the backdrop
  minWidth: 768, // extensions don't run on phones
  storageKey: 'assetbench_ext_launch_v1', // bump to show it to everyone again
  // PREVIEW: swap for a screenshot or GIF by setting `image` (then the clip is skipped).
  preview: { ...toolClip('inspect-glb'), image: null, alt: 'GLB Inspector checking a model: health score, triangles, textures and file size' },
};

const ICONS = {
  speed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
  privacy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  detail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>',
};

const FEATURES = [
  ['speed', 'One click', 'open a .glb or .gltf and see its stats and health score straight away'],
  ['privacy', 'Private', 'files stay on your computer. Nothing is uploaded'],
  ['detail', 'Every detail', 'mesh, materials, textures, animations, node tree, triangles and texture sizes'],
];

/** Popup counters (worker/api/stats.js PAGE_EVENTS). */
function trackEvent(name) {
  trackApiEvent(`ext_${name}`);
}

const DAY = 24 * 60 * 60 * 1000;

function blocked() {
  try {
    const v = localStorage.getItem(CONFIG.storageKey);
    if (v === 'installed') return true;
    return Boolean(v) && Date.now() - Number(v) < CONFIG.cooldownDays * DAY;
  } catch {
    return false;
  }
}

function remember(value) {
  try { localStorage.setItem(CONFIG.storageKey, value); } catch {}
}

/** Chrome, Edge, Brave and other desktop Chromium browsers; not Firefox, Safari or any phone. */
function isDesktopChromium() {
  const brands = navigator.userAgentData?.brands;
  if (brands) return !navigator.userAgentData.mobile && brands.some((b) => /Chromium|Google Chrome|Microsoft Edge|Brave/.test(b.brand));
  const ua = navigator.userAgent;
  return /\b(Chrome|Chromium|Edg)\//.test(ua) && !/Mobi|Android|CriOS|EdgiOS/.test(ua);
}

const canShow = () => innerWidth >= CONFIG.minWidth && isDesktopChromium() && !location.pathname.startsWith('/docs') && !blocked();

/** Shows the popup once, CONFIG.delayMs after load or on exit intent. */
export function initExtensionLaunchModal() {
  if (typeof window === 'undefined' || !canShow()) return;
  let timer = 0;
  const show = () => {
    clearTimeout(timer);
    document.removeEventListener('mouseout', onExit);
    // Never on top of another popup or on a phone-sized window; the next visit tries again.
    if (!canShow() || document.querySelector('.welcome-modal-overlay, .modal-overlay')) return;
    openExtensionLaunchModal();
  };
  // Exit intent: the pointer leaves through the top of the window (towards the tabs and address bar).
  const onExit = (e) => { if (!e.relatedTarget && e.clientY <= 0) show(); };
  timer = setTimeout(show, CONFIG.delayMs);
  document.addEventListener('mouseout', onExit);
}

export function openExtensionLaunchModal() {
  const ext = EXTENSIONS.find((e) => e.id === CONFIG.extensionId);
  if (!ext) return () => {};
  const others = EXTENSIONS.length - 1;
  const browser = BROWSERS.find((b) => b.id === detectBrowser());
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const returnTo = document.activeElement;

  const p = CONFIG.preview;
  const media = p.image
    ? `<img src="${p.image}" alt="${p.alt}" width="960" height="540" decoding="async">`
    : `<img src="${p.poster}" alt="${p.alt}" width="960" height="540" decoding="async">${reduceMotion ? '' : `<video src="${p.src}" muted playsinline autoplay loop preload="auto" aria-hidden="true"></video>`}`;

  const overlay = document.createElement('div');
  overlay.className = 'welcome-modal-overlay ext-launch-overlay';
  overlay.innerHTML = `
    <div class="ext-launch" role="dialog" aria-modal="true" aria-labelledby="ext-launch-title" aria-describedby="ext-launch-sub">
      <button class="ext-launch__close" type="button" aria-label="Close">✕</button>
      <figure class="ext-launch__preview">${media}</figure>
      <div class="ext-launch__body">
        <p class="ext-launch__eyebrow">New · Chrome extension</p>
        <h2 class="ext-launch__title" id="ext-launch-title">Inspect any GLB in one click</h2>
        <p class="ext-launch__sub" id="ext-launch-sub">${ext.name} by Asset Bench checks your 3D files right in the browser: no uploads, no desktop software to install.</p>
        <ul class="ext-launch__features">
          ${FEATURES.map(([icon, name, text]) => `<li><span class="ext-launch__icon">${ICONS[icon]}</span><span><strong>${name}:</strong> ${text}</span></li>`).join('')}
        </ul>
        <div class="ext-launch__actions">
          ${ext.url
            ? `<a class="ext-launch__cta" href="${ext.url}" target="_blank" rel="noopener" data-install="store">Add to Chrome, it's free</a>
               <button class="ext-launch__alt" type="button" data-install="manual">or download the zip</button>`
            : `<button class="ext-launch__cta" type="button" data-install="manual">Download free for ${browser.name}</button>
               <span class="ext-launch__alt-note">Chrome Web Store listing in review</span>`}
        </div>
        <div class="ext-launch__steps" hidden>
          <p><strong>Downloaded.</strong> To install it in ${browser.name}:</p>
          <ol>${steps(browser)}</ol>
        </div>
        <p class="ext-launch__price">Free health check, always. Then 10 free rig, animation and compare runs, and 99p once to unlock the rest.</p>
        <div class="ext-launch__foot">
          <button class="ext-launch__all" type="button">See all ${others + 1} extensions</button>
          <button class="ext-launch__later" type="button">Maybe later</button>
        </div>
      </div>
    </div>
  `;

  const dialog = overlay.querySelector('.ext-launch');
  const focusables = () => [...dialog.querySelectorAll('a[href], button:not([disabled])')].filter((el) => !el.closest('[hidden]'));

  function onKeydown(e) {
    if (e.key === 'Escape') return dismiss();
    if (e.key !== 'Tab') return;
    // Keep Tab inside the popup.
    const list = focusables();
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.classList.remove('welcome-modal-overlay--open');
    overlay.classList.add('welcome-modal-overlay--closing');
    setTimeout(() => overlay.remove(), reduceMotion ? 0 : 220);
    if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
  }
  let didInstall = false;
  function dismiss() {
    // Closing after a download keeps "never again"; otherwise the cooldown starts now.
    if (!didInstall) remember(String(Date.now()));
    trackEvent('popup_dismissed');
    close();
  }
  function installed() {
    didInstall = true;
    remember('installed');
    trackEvent('popup_install_click');
  }

  overlay.querySelector('.ext-launch__close').addEventListener('click', dismiss);
  overlay.querySelector('.ext-launch__later').addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
  overlay.querySelector('.ext-launch__all').addEventListener('click', () => {
    if (!didInstall) remember(String(Date.now()));
    close();
    openExtensionsModal();
  });
  overlay.querySelector('[data-install="store"]')?.addEventListener('click', () => {
    installed();
    close();
  });
  overlay.querySelector('[data-install="manual"]').addEventListener('click', async (e) => {
    installed();
    const btn = e.currentTarget;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing…';
    try {
      await downloadZip([ext.id]);
      btn.textContent = 'Downloaded';
      const stepsEl = overlay.querySelector('.ext-launch__steps');
      stepsEl.hidden = false;
      stepsEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    } catch {
      btn.textContent = 'Download failed. Try again';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = label; }, 2500);
    }
  });

  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  const video = overlay.querySelector('video');
  if (video) {
    video.muted = true; // autoplay set in markup isn't always honoured without this
    video.addEventListener('playing', () => overlay.querySelector('.ext-launch__preview').classList.add('is-playing'));
    video.play().catch(() => {});
  }
  requestAnimationFrame(() => overlay.classList.add('welcome-modal-overlay--open'));
  trackEvent('popup_shown');
  overlay.querySelector('.ext-launch__cta').focus({ preventScroll: true });
  return close;
}
