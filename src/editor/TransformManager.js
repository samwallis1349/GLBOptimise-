/**
 * Converts registered elements to absolute positioning (relative to their
 * existing parent) the first time they're moved/resized, and knows how to
 * put them back exactly as coded for RESET LAYOUT. Never touches elements
 * that haven't been deliberately repositioned.
 */

import * as LayoutStorage from './LayoutStorage.js';

const MIN_SIZE = 20;

const originalStyles = new Map(); // id -> { position, top, left, width, height, margin, transform }
const parentOriginalPosition = new WeakMap(); // parentEl -> original inline position value
const parentTouchCount = new WeakMap(); // parentEl -> number of children we've absolutely positioned

function captureOriginal(id, el) {
  if (originalStyles.has(id)) return;
  originalStyles.set(id, {
    position: el.style.position || '',
    top: el.style.top || '',
    left: el.style.left || '',
    width: el.style.width || '',
    height: el.style.height || '',
    margin: el.style.margin || '',
    transform: el.style.transform || '',
  });
}

function ensureParentPositioned(parent) {
  if (getComputedStyle(parent).position === 'static') {
    if (!parentTouchCount.has(parent)) {
      parentOriginalPosition.set(parent, parent.style.position || '');
      parent.style.position = 'relative';
    }
  }
  parentTouchCount.set(parent, (parentTouchCount.get(parent) || 0) + 1);
}

function releaseParentPositioned(parent) {
  const count = (parentTouchCount.get(parent) || 1) - 1;
  if (count <= 0) {
    parentTouchCount.delete(parent);
    if (parentOriginalPosition.has(parent)) {
      const original = parentOriginalPosition.get(parent);
      if (original) parent.style.position = original;
      else parent.style.removeProperty('position');
      parentOriginalPosition.delete(parent);
    }
  } else {
    parentTouchCount.set(parent, count);
  }
}

/** Converts `el` to parent-relative absolute positioning in place, preserving its current box. */
export function ensurePositioned(el, id) {
  if (el.dataset.abPositioned === '1') return;
  const parent = el.parentElement;
  if (!parent) return;

  captureOriginal(id, el);

  const rect = el.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const parentStyle = getComputedStyle(parent);
  const borderLeft = parseFloat(parentStyle.borderLeftWidth) || 0;
  const borderTop = parseFloat(parentStyle.borderTopWidth) || 0;

  ensureParentPositioned(parent);

  el.style.position = 'absolute';
  el.style.left = `${rect.left - parentRect.left - borderLeft + parent.scrollLeft}px`;
  el.style.top = `${rect.top - parentRect.top - borderTop + parent.scrollTop}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.margin = '0';
  el.style.transform = 'none';
  el.dataset.abPositioned = '1';
}

/** Reads current x/y/w/h relative to the element's positioning parent (viewport if not yet positioned). */
export function getXYWH(el) {
  const rect = el.getBoundingClientRect();
  if (el.dataset.abPositioned === '1') {
    return {
      x: parseFloat(el.style.left) || 0,
      y: parseFloat(el.style.top) || 0,
      w: rect.width,
      h: rect.height,
    };
  }
  const parent = el.parentElement;
  const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
  return {
    x: rect.left - parentRect.left,
    y: rect.top - parentRect.top,
    w: rect.width,
    h: rect.height,
  };
}

export function setXYWH(el, id, { x, y, w, h }) {
  ensurePositioned(el, id);
  if (x != null) el.style.left = `${Math.round(x)}px`;
  if (y != null) el.style.top = `${Math.round(y)}px`;
  if (w != null) el.style.width = `${Math.max(MIN_SIZE, Math.round(w))}px`;
  if (h != null) el.style.height = `${Math.max(MIN_SIZE, Math.round(h))}px`;
}

export function moveBy(el, id, dx, dy) {
  const current = getXYWH(el);
  setXYWH(el, id, { x: current.x + dx, y: current.y + dy });
}

/**
 * Computes a new box for a corner/edge resize drag. `handle` is one of
 * n, s, e, w, ne, nw, se, sw. `lockAspect` keeps the original w/h ratio.
 */
export function resizeWithHandle(startBox, handle, dxRaw, dyRaw, lockAspect) {
  let { x, y, w, h } = startBox;
  const ratio = startBox.w / startBox.h || 1;
  let dx = dxRaw;
  let dy = dyRaw;

  const hasE = handle.includes('e');
  const hasW = handle.includes('w');
  const hasN = handle.includes('n');
  const hasS = handle.includes('s');

  let newW = w + (hasE ? dx : hasW ? -dx : 0);
  let newH = h + (hasS ? dy : hasN ? -dy : 0);
  newW = Math.max(MIN_SIZE, newW);
  newH = Math.max(MIN_SIZE, newH);

  if (lockAspect && (hasE || hasW) && (hasN || hasS)) {
    // corner handle: derive the dominant axis from whichever moved more
    if (Math.abs(dx) >= Math.abs(dy)) {
      newH = newW / ratio;
    } else {
      newW = newH * ratio;
    }
  } else if (lockAspect && (hasE || hasW)) {
    newH = newW / ratio;
  } else if (lockAspect && (hasN || hasS)) {
    newW = newH * ratio;
  }

  let newX = x;
  let newY = y;
  if (hasW) newX = x + (w - newW);
  if (hasN) newY = y + (h - newH);

  return { x: newX, y: newY, w: newW, h: newH };
}

/** Applies a saved {x,y,width,height} entry to an element (no history entry). */
export function applyEntry(el, id, entry) {
  if (!entry) return;
  const patch = {};
  if (typeof entry.x === 'number') patch.x = entry.x;
  if (typeof entry.y === 'number') patch.y = entry.y;
  if (typeof entry.width === 'number') patch.w = entry.width;
  if (typeof entry.height === 'number') patch.h = entry.height;
  if (Object.keys(patch).length === 0) return;
  setXYWH(el, id, patch);
}

export function persist(el, id) {
  if (el.dataset.abPositioned !== '1') return;
  const box = getXYWH(el);
  LayoutStorage.setEntry(id, { x: box.x, y: box.y, width: box.w, height: box.h });
}

/** Removes editor-applied positioning from `el`, restoring the styles it had before the editor touched it. */
export function restoreOriginal(el, id) {
  if (el.dataset.abPositioned !== '1') return;
  const original = originalStyles.get(id);
  const parent = el.parentElement;

  if (original) {
    for (const [prop, value] of Object.entries(original)) {
      if (value) el.style[prop] = value;
      else el.style.removeProperty(prop);
    }
  } else {
    ['position', 'top', 'left', 'width', 'height', 'margin', 'transform'].forEach((prop) =>
      el.style.removeProperty(prop),
    );
  }
  originalStyles.delete(id);
  delete el.dataset.abPositioned;

  if (parent) releaseParentPositioned(parent);
}

export function isPositioned(el) {
  return el.dataset.abPositioned === '1';
}
