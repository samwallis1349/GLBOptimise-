/**
 * Tracks every element the layout editor can move/resize — both explicit
 * app components (marked with data-layout-editable) and plain elements
 * the user selects ad hoc (buttons, headings, panels, ...).
 *
 * Identity: an explicit `data-layout-id` is used verbatim. Elements
 * without one get a structural id derived from their position in the DOM
 * (tag + nth-of-type chain from the app root), so their layout survives
 * a route remount as long as the coded markup stays the same shape.
 */

let appRoot = null;
const metaByEl = new WeakMap();
const elById = new Map();
const addListeners = new Set();

export function setAppRoot(el) {
  appRoot = el;
}

function humanize(el) {
  const explicit = el.dataset.layoutName;
  if (explicit) return explicit;
  const id = el.dataset.layoutId;
  if (id && !id.startsWith('auto:')) {
    return id
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
  const text = (el.textContent || '').trim().slice(0, 24);
  if (text) return text;
  return el.tagName.toLowerCase();
}

function cssPathFrom(el, root) {
  const parts = [];
  let node = el;
  while (node && node !== root && node.parentElement) {
    const parent = node.parentElement;
    const tag = node.tagName.toLowerCase();
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
    const idx = sameTag.indexOf(node) + 1;
    parts.unshift(`${tag}:nth-of-type(${idx})`);
    node = parent;
    if (node === root || !node.parentElement) break;
  }
  return parts.join('>');
}

function computeAutoId(el) {
  const root = appRoot || document.body;
  const path = cssPathFrom(el, root);
  return `auto:${path}`;
}

/** Resolves the id an element should use, without registering it. */
export function idFor(el) {
  if (el.dataset.layoutId) return el.dataset.layoutId;
  return computeAutoId(el);
}

/**
 * Registers `el` as an editor-manageable component/element. Idempotent —
 * calling it again just updates the metadata. This is the same function
 * app code can call directly (layoutEditor.register).
 */
export function register(el, opts = {}) {
  if (!el || el.nodeType !== 1) return null;

  let meta = metaByEl.get(el);
  const id = opts.id || el.dataset.layoutId || (meta && meta.id) || computeAutoId(el);
  el.dataset.layoutId = id;
  if (!el.hasAttribute('data-layout-editable')) el.setAttribute('data-layout-editable', '');

  const lockChildren = opts.lockChildren ?? el.hasAttribute('data-layout-lock-children');
  const deletable = opts.deletable ?? el.hasAttribute('data-layout-deletable');
  const duplicatable = opts.duplicatable ?? el.hasAttribute('data-layout-duplicatable');

  meta = {
    id,
    el,
    name: opts.name || humanize(el),
    movable: opts.movable ?? true,
    resizable: opts.resizable ?? true,
    lockChildren,
    deletable,
    duplicatable,
    editorCreated: opts.editorCreated ?? meta?.editorCreated ?? false,
    assetType: opts.assetType ?? meta?.assetType ?? null,
  };

  metaByEl.set(el, meta);
  elById.set(id, el);
  addListeners.forEach((fn) => fn(el, meta));
  return id;
}

/** Registers `el` on the fly with sensible defaults if it isn't known yet. */
export function ensureRegistered(el, opts = {}) {
  const existing = metaByEl.get(el);
  if (existing) return existing;
  register(el, opts);
  return metaByEl.get(el);
}

export function unregister(el) {
  const meta = metaByEl.get(el);
  if (!meta) return;
  elById.delete(meta.id);
  metaByEl.delete(el);
}

export function getMeta(el) {
  return metaByEl.get(el) || null;
}

export function getElementById(id) {
  const el = elById.get(id);
  if (el && el.isConnected) return el;
  if (el) elById.delete(id);
  return null;
}

/** Given an event target, finds the nearest registered/registerable component root. */
export function resolveComponentRoot(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest('[data-layout-editable]');
}

export function onComponentAdded(fn) {
  addListeners.add(fn);
  return () => addListeners.delete(fn);
}

/** Scans a subtree for explicit [data-layout-editable] elements and registers any new ones. */
export function scan(root) {
  const found = [];
  if (root.matches?.('[data-layout-editable]') && !metaByEl.has(root)) {
    register(root);
    found.push(root);
  }
  root.querySelectorAll?.('[data-layout-editable]').forEach((el) => {
    if (!metaByEl.has(el)) {
      register(el);
      found.push(el);
    }
  });
  return found;
}
