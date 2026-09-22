import { TOOLS, getCategoryById } from '../config/tools.js';
import { navigate } from '../../app/router.js';
import { iconSvg } from '../utils/icons.js';

/**
 * The Ctrl/Cmd+K tool finder — a centred modal palette, built on the
 * existing TOOLS registry (no separate database). Mounted once, globally,
 * from App.js, the same way the F8 layout editor is: it lives outside the
 * router's DOM so it survives navigation and is reachable from any page.
 *
 * Recently-opened tools are tracked in localStorage (a handful of ids) so
 * the empty-query "Suggested" list is genuinely recent, not invented.
 */

const RECENTS_KEY = 'assetbench.commandPalette.recents';
const MAX_RECENTS = 4;
const MAX_RESULTS = 8;

let overlay = null;
let panel = null;
let input = null;
let list = null;
let hint = null;
let matches = [];
let activeIndex = -1;
let lastFocused = null;
let initialized = false;

function readRecents() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(id) {
  try {
    const recents = [id, ...readRecents().filter((r) => r !== id)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {
    /* best-effort — localStorage may be unavailable (private mode, quota) */
  }
}

function searchableText(tool) {
  const category = getCategoryById(tool.category);
  return [tool.name, tool.description, category?.label, ...(tool.keywords || [])].filter(Boolean).join(' ').toLowerCase();
}

function search(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    const recents = readRecents()
      .map((id) => TOOLS.find((t) => t.id === id))
      .filter(Boolean);
    if (recents.length) return recents;
    return TOOLS.filter((t) => t.status === 'available').slice(0, MAX_RESULTS);
  }
  return TOOLS.filter((tool) => searchableText(tool).includes(q)).slice(0, MAX_RESULTS);
}

function build() {
  overlay = document.createElement('div');
  overlay.className = 'cmdk-overlay';

  panel = document.createElement('div');
  panel.className = 'cmdk-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Search AssetBench tools');

  const searchRow = document.createElement('div');
  searchRow.className = 'cmdk-search';
  searchRow.innerHTML = iconSvg('search', { class: 'cmdk-search-icon' });

  input = document.createElement('input');
  input.type = 'text';
  input.className = 'cmdk-input';
  input.placeholder = 'Search AssetBench tools...';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Search tools');
  searchRow.appendChild(input);

  hint = document.createElement('div');
  hint.className = 'cmdk-heading';

  list = document.createElement('div');
  list.className = 'cmdk-list';
  list.setAttribute('role', 'listbox');

  const footer = document.createElement('div');
  footer.className = 'cmdk-footer';
  footer.innerHTML = `
    <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> Navigate</span>
    <span><kbd>Enter</kbd> Open</span>
    <span><kbd>Esc</kbd> Close</span>
  `;

  panel.append(searchRow, hint, list, footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  input.addEventListener('input', () => {
    matches = search(input.value);
    activeIndex = matches.length ? 0 : -1;
    render();
  });
  panel.addEventListener('keydown', onKeydown);
  list.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.cmdk-item');
    if (!row) return;
    const idx = Number(row.dataset.index);
    if (idx !== activeIndex) {
      activeIndex = idx;
      render();
    }
  });
  list.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.cmdk-item');
    if (!row) return;
    e.preventDefault();
    openTool(matches[Number(row.dataset.index)]);
  });
}

function render() {
  hint.textContent = input.value.trim() ? 'RESULTS' : readRecents().length ? 'RECENT' : 'SUGGESTED';

  if (!matches.length) {
    list.innerHTML = `<div class="cmdk-empty">No tools match "${escapeHtml(input.value)}".</div>`;
    return;
  }

  list.innerHTML = matches
    .map((tool, i) => {
      const category = getCategoryById(tool.category);
      return `
        <div class="cmdk-item${i === activeIndex ? ' is-active' : ''}" role="option" aria-selected="${i === activeIndex}" data-index="${i}">
          ${iconSvg(tool.icon, { class: 'cmdk-item-icon' })}
          <div class="cmdk-item-text">
            <span class="cmdk-item-name">${escapeHtml(tool.name)}</span>
            <span class="cmdk-item-desc">${escapeHtml(tool.description)}</span>
          </div>
          <span class="cmdk-item-category">${escapeHtml(category?.label || '')}</span>
        </div>`;
    })
    .join('');

  const activeEl = list.querySelector('.cmdk-item.is-active');
  activeEl?.scrollIntoView({ block: 'nearest' });
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (matches.length) {
      activeIndex = (activeIndex + 1) % matches.length;
      render();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (matches.length) {
      activeIndex = (activeIndex - 1 + matches.length) % matches.length;
      render();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (matches.length) openTool(matches[Math.max(activeIndex, 0)]);
  } else if (e.key === 'Tab') {
    // Minimal focus trap: only the search input is ever focusable inside
    // the palette, so Tab/Shift+Tab both just keep focus there.
    e.preventDefault();
    input.focus();
  }
}

function openTool(tool) {
  if (!tool) return;
  pushRecent(tool.id);
  navigate(tool.route);
  close();
}

export function openCommandPalette() {
  if (!overlay) build();
  lastFocused = document.activeElement;

  matches = search('');
  activeIndex = matches.length ? 0 : -1;
  input.value = '';
  render();

  overlay.classList.add('is-open');
  // Force layout so the enter transition actually animates from the
  // pre-open state instead of the class flipping mid-frame.
  void panel.offsetWidth;
  overlay.classList.add('is-entered');

  input.focus();
  document.body.classList.add('cmdk-lock-scroll');
}

function close() {
  if (!overlay || !overlay.classList.contains('is-open')) return;
  overlay.classList.remove('is-entered');
  document.body.classList.remove('cmdk-lock-scroll');
  const finish = () => overlay.classList.remove('is-open');
  overlay.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 260); // fallback in case transitionend doesn't fire

  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
  lastFocused = null;
}

export function isCommandPaletteOpen() {
  return Boolean(overlay?.classList.contains('is-open'));
}

/** Registers the global Ctrl/Cmd+K shortcut. Call once, from App.js. */
export function initCommandPalette() {
  if (initialized) return;
  initialized = true;

  document.addEventListener('keydown', (e) => {
    const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
    if (!isShortcut) return;
    e.preventDefault();
    if (isCommandPaletteOpen()) close();
    else openCommandPalette();
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
