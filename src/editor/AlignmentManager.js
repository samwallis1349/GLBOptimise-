/**
 * Alignment/distribution math. Every function takes { el, id } descriptors,
 * applies the new box via TransformManager, and returns a list of
 * { el, id, before, after } changes so the caller can record one history
 * entry per operation.
 */

import * as TransformManager from './TransformManager.js';

function boxOf(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

function applyAndRecord(items, computeTarget) {
  const changes = [];
  for (const { el, id } of items) {
    const before = TransformManager.getXYWH(el);
    const beforeBox = boxOf(el);
    const target = computeTarget(el, beforeBox);
    if (!target) continue;

    // Convert viewport-space target left/top into parent-relative x/y.
    TransformManager.ensurePositioned(el, id);
    const parent = el.parentElement;
    const parentRect = parent.getBoundingClientRect();
    const x = target.left != null ? target.left - parentRect.left + parent.scrollLeft : undefined;
    const y = target.top != null ? target.top - parentRect.top + parent.scrollTop : undefined;
    const patch = {};
    if (x != null) patch.x = x;
    if (y != null) patch.y = y;
    if (target.width != null) patch.w = target.width;
    if (target.height != null) patch.h = target.height;

    TransformManager.setXYWH(el, id, patch);
    const after = TransformManager.getXYWH(el);
    changes.push({ el, id, before, after });
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Single-element alignment, relative to its positioning parent
// ---------------------------------------------------------------------------

export function alignSingle(el, id, type) {
  return applyAndRecord([{ el, id }], (element) => {
    const parent = element.parentElement;
    const parentStyle = getComputedStyle(parent);
    const parentRect = parent.getBoundingClientRect();
    const padLeft = parseFloat(parentStyle.paddingLeft) || 0;
    const padRight = parseFloat(parentStyle.paddingRight) || 0;
    const padTop = parseFloat(parentStyle.paddingTop) || 0;
    const padBottom = parseFloat(parentStyle.paddingBottom) || 0;
    const rect = element.getBoundingClientRect();
    const innerLeft = parentRect.left + padLeft;
    const innerRight = parentRect.right - padRight;
    const innerTop = parentRect.top + padTop;
    const innerBottom = parentRect.bottom - padBottom;

    switch (type) {
      case 'left':
        return { left: innerLeft };
      case 'right':
        return { left: innerRight - rect.width };
      case 'h-center':
        return { left: innerLeft + (innerRight - innerLeft) / 2 - rect.width / 2 };
      case 'top':
        return { top: innerTop };
      case 'bottom':
        return { top: innerBottom - rect.height };
      case 'v-center':
        return { top: innerTop + (innerBottom - innerTop) / 2 - rect.height / 2 };
      case 'page-center-h':
        return { left: window.innerWidth / 2 - rect.width / 2 };
      case 'page-center-v':
        return { top: window.innerHeight / 2 - rect.height / 2 };
      case 'page-center':
        return { left: window.innerWidth / 2 - rect.width / 2, top: window.innerHeight / 2 - rect.height / 2 };
      default:
        return null;
    }
  });
}

// ---------------------------------------------------------------------------
// Multi-selection alignment, relative to the selection's own bounding box
// ---------------------------------------------------------------------------

function selectionBounds(items) {
  const boxes = items.map(({ el }) => boxOf(el));
  return {
    left: Math.min(...boxes.map((b) => b.left)),
    right: Math.max(...boxes.map((b) => b.right)),
    top: Math.min(...boxes.map((b) => b.top)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
}

export function alignMulti(items, type) {
  if (items.length < 2) return [];
  const bounds = selectionBounds(items);

  return applyAndRecord(items, (element, box) => {
    switch (type) {
      case 'left':
        return { left: bounds.left };
      case 'right':
        return { left: bounds.right - box.width };
      case 'h-center':
        return { left: (bounds.left + bounds.right) / 2 - box.width / 2 };
      case 'top':
        return { top: bounds.top };
      case 'bottom':
        return { top: bounds.bottom - box.height };
      case 'v-center':
        return { top: (bounds.top + bounds.bottom) / 2 - box.height / 2 };
      default:
        return null;
    }
  });
}

export function matchDimension(items, dimension, anchorEl) {
  if (items.length < 2) return [];
  const anchor = anchorEl || items[items.length - 1].el;
  const anchorRect = anchor.getBoundingClientRect();
  const size = dimension === 'width' ? anchorRect.width : anchorRect.height;

  return applyAndRecord(items, () => (dimension === 'width' ? { width: size } : { height: size }));
}

export function distribute(items, axis) {
  if (items.length < 3) return [];
  const boxes = items.map((item) => ({ item, box: boxOf(item.el) }));

  if (axis === 'horizontal') {
    boxes.sort((a, b) => a.box.left - b.box.left);
    const first = boxes[0].box;
    const last = boxes[boxes.length - 1].box;
    const totalSpan = last.right - first.left;
    const totalWidth = boxes.reduce((sum, b) => sum + b.box.width, 0);
    const gap = (totalSpan - totalWidth) / (boxes.length - 1);

    let cursor = first.left;
    const changes = [];
    for (const { item, box } of boxes) {
      const before = TransformManager.getXYWH(item.el);
      TransformManager.ensurePositioned(item.el, item.id);
      const parent = item.el.parentElement;
      const parentRect = parent.getBoundingClientRect();
      const x = cursor - parentRect.left + parent.scrollLeft;
      TransformManager.setXYWH(item.el, item.id, { x });
      changes.push({ el: item.el, id: item.id, before, after: TransformManager.getXYWH(item.el) });
      cursor += box.width + gap;
    }
    return changes;
  }

  boxes.sort((a, b) => a.box.top - b.box.top);
  const first = boxes[0].box;
  const last = boxes[boxes.length - 1].box;
  const totalSpan = last.bottom - first.top;
  const totalHeight = boxes.reduce((sum, b) => sum + b.box.height, 0);
  const gap = (totalSpan - totalHeight) / (boxes.length - 1);

  let cursor = first.top;
  const changes = [];
  for (const { item, box } of boxes) {
    const before = TransformManager.getXYWH(item.el);
    TransformManager.ensurePositioned(item.el, item.id);
    const parent = item.el.parentElement;
    const parentRect = parent.getBoundingClientRect();
    const y = cursor - parentRect.top + parent.scrollTop;
    TransformManager.setXYWH(item.el, item.id, { y });
    changes.push({ el: item.el, id: item.id, before, after: TransformManager.getXYWH(item.el) });
    cursor += box.height + gap;
  }
  return changes;
}
