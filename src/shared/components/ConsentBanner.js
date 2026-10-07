import { APP_NAME } from '../config/app.js';
import { ADSENSE_ENABLED } from '../config/ads.js';
import { getConsent, setConsent } from '../../services/ConsentService.js';

/**
 * Small, non-blocking privacy notice fixed to the bottom of the screen.
 *
 * Shown until the visitor makes a choice, then never again (unless the
 * consent version changes). The footer's "Privacy choices" link reopens it
 * straight into the settings view. It never covers the page: while it's
 * open the page gets matching bottom padding, so everything can still be
 * scrolled into view and used. There's no backdrop and no focus trap, and
 * Escape only closes the settings view — it never counts as a choice.
 */

let root = null;
let returnFocus = null;
let resizeObserver = null;

function setOffset(px) {
  document.documentElement.style.setProperty('--consent-offset', `${px}px`);
  document.documentElement.classList.toggle('has-consent-notice', px > 0);
}

function close() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  root?.remove();
  root = null;
  setOffset(0);
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

function save(choices) {
  setConsent(choices);
  close();
}

function noticeView() {
  return `
    <h2 class="consent__title" id="consent-title">Privacy choices</h2>
    <p class="consent__text">
      Cloudflare visitor statistics run by default to help improve ${APP_NAME}. They use no cookies or browser
      storage. You can switch analytics off at any time. Advertising is off. <a href="/privacy">Privacy policy</a>
    </p>
    <div class="consent__actions">
      <button type="button" class="btn btn--secondary consent__btn" data-consent="reject">Turn analytics off</button>
      <button type="button" class="btn btn--secondary consent__btn" data-consent="settings">Privacy settings</button>
    </div>`;
}

function settingsView(consent) {
  const toggle = (id, label, hint, checked) => `
    <li class="consent__row">
      <label class="consent__label" for="consent-${id}">
        <span>${label}</span>
        <span class="consent__hint">${hint}</span>
      </label>
      <input type="checkbox" class="consent__check" id="consent-${id}" name="${id}" ${checked ? 'checked' : ''} />
    </li>`;
  return `
    <h2 class="consent__title" id="consent-title">Privacy settings</h2>
    <ul class="consent__list">
      <li class="consent__row">
        <span class="consent__label">
          <span>Necessary</span>
          <span class="consent__hint">Trial, licence keys and your settings</span>
        </span>
        <span class="consent__fixed">Always active</span>
      </li>
      ${toggle('analytics', 'Analytics', 'Cloudflare visitor statistics and aggregate tool popularity counts', consent ? consent.analytics : true)}
      ${toggle('advertising', 'Advertising', ADSENSE_ENABLED ? 'Google ads' : 'Not used yet', consent?.advertising)}
    </ul>
    <div class="consent__actions">
      <button type="button" class="btn btn--primary consent__btn" data-consent="save">Save choices</button>
    </div>`;
}

function render(view) {
  const consent = getConsent();
  root.innerHTML = view === 'settings' ? settingsView(consent) : noticeView();
  root.dataset.view = view;
}

function mount(view) {
  if (!root) {
    root = document.createElement('section');
    root.className = 'consent';
    root.setAttribute('aria-labelledby', 'consent-title');
    document.body.appendChild(root);

    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-consent]')?.dataset.consent;
      if (action === 'reject') save({ analytics: false, advertising: false });
      else if (action === 'settings') {
        render('settings');
        root.querySelector('input')?.focus();
      } else if (action === 'save') {
        save({
          analytics: root.querySelector('[name="analytics"]').checked,
          advertising: root.querySelector('[name="advertising"]').checked,
        });
      }
    });

    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || root.dataset.view !== 'settings') return;
      // Back to the notice if no choice exists yet; otherwise just close. Never saves.
      if (getConsent()) close();
      else {
        render('notice');
        root.querySelector('[data-consent="settings"]')?.focus();
      }
    });

    resizeObserver = new ResizeObserver(() => root && setOffset(root.offsetHeight + 16));
    resizeObserver.observe(root);
  }
  render(view);
}

/** Shows the notice on a first visit (or after the consent version changes). */
export function initConsentBanner() {
  if (!getConsent()) mount('notice');
}

/** Opens the settings view — used by the footer's "Privacy choices" link and the privacy page. */
export function openPrivacyChoices() {
  returnFocus = document.activeElement;
  mount('settings');
  root.querySelector('input')?.focus();
}
