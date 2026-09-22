import { APP_NAME, APP_TAGLINE } from '../config/app.js';
import { getToolByRoute } from '../config/tools.js';
import { getCurrentPath, onRouteChange } from '../../app/router.js';
import { iconSvg } from '../utils/icons.js';
import { openCommandPalette } from '../effects/CommandPalette.js';

const NAV_LINKS = [
  { label: 'Tools', path: '/tools' },
  { label: 'About', path: '/about' },
  { label: 'Pricing', path: '/pricing' },
];

/** Renders the single shared Asset Bench header, kept in sync with the router. */
export function Header() {
  const header = document.createElement('header');
  header.className = 'ab-header';

  const inner = document.createElement('div');
  inner.className = 'container ab-header__inner';

  const brand = document.createElement('a');
  brand.className = 'ab-header__brand';
  brand.href = '#/';
  brand.innerHTML = `<img src="/branding/asset-bench-logo.svg" alt="" /><span>${APP_NAME}</span>`;

  const nav = document.createElement('nav');
  nav.className = 'ab-header__nav';
  nav.setAttribute('aria-label', 'Primary');

  const links = NAV_LINKS.map(({ label, path }) => {
    const a = document.createElement('a');
    a.href = `#${path}`;
    a.textContent = label;
    a.dataset.path = path;
    nav.appendChild(a);
    return a;
  });

  const activeToolLabel = document.createElement('span');
  activeToolLabel.className = 'ab-header__active-tool text-secondary';
  nav.appendChild(activeToolLabel);

  const search = ToolSearch();

  const right = document.createElement('div');
  right.className = 'ab-header__right';

  const tagline = document.createElement('span');
  tagline.className = 'ab-header__tagline';
  tagline.textContent = APP_TAGLINE;

  const themeToggle = document.createElement('button');
  themeToggle.className = 'ab-header__menu-toggle';
  themeToggle.type = 'button';
  themeToggle.setAttribute('aria-label', 'Toggle theme');
  themeToggle.textContent = '◐';
  themeToggle.title = 'Theme switching is not implemented yet';

  right.append(tagline, themeToggle);
  inner.append(brand, nav, search.el, right);
  header.append(inner);

  function updateActiveState(path) {
    links.forEach((link) => {
      link.classList.toggle('is-active', path === link.dataset.path);
    });

    const tool = getToolByRoute(path);
    activeToolLabel.textContent = tool ? `/ ${tool.name}` : '';
  }

  updateActiveState(getCurrentPath());
  onRouteChange(updateActiveState);

  return header;
}

/**
 * "Search tools" launcher: a search-styled button (not a live text field)
 * that opens the shared CommandPalette — the same Ctrl/Cmd+K tool finder
 * reachable from anywhere in the app. Kept as a real <button> rather than
 * an <input> so it can't be typed into directly; the palette's own search
 * field is where matching actually happens, so there's exactly one search
 * implementation instead of two that could drift apart.
 */
function ToolSearch() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ab-header__search';
  button.setAttribute('aria-label', 'Search AssetBench tools');

  button.innerHTML = iconSvg('search', { class: 'ab-header__search-icon' });

  const placeholder = document.createElement('span');
  placeholder.className = 'ab-header__search-placeholder';
  placeholder.textContent = 'Search tools...';
  button.appendChild(placeholder);

  const kbd = document.createElement('span');
  kbd.className = 'ab-header__search-kbd';
  kbd.textContent = navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl K';
  button.appendChild(kbd);

  button.addEventListener('click', () => openCommandPalette());

  return { el: button };
}
