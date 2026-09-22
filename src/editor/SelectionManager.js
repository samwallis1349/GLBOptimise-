/**
 * Selection state, overlay rendering (bounding boxes, resize handles, live
 * dimensions) and the pointer-driven move/resize interactions. The overlay
 * lives in a position:fixed layer, so element viewport rects can be used
 * directly as box coordinates.
 */

import * as ComponentRegistry from './ComponentRegistry.js';
import * as TransformManager from './TransformManager.js';
import * as GuideManager from './GuideManager.js';
import * as HistoryManager from './HistoryManager.js';

const HANDLE_POSITIONS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CURSOR_FOR = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};
const DRAG_THRESHOLD = 3;

let overlayLayer = null;
let selection = [];
const changeListeners = new Set();
let boxEls = new Map();
let combinedBoxEl = null;

export function init(layer) {
  overlayLayer = layer;
  combinedBoxEl = document.createElement('div');
  combinedBoxEl.className = 'ab-editor-combined-box ab-editor-ui';
  combinedBoxEl.style.display = 'none';
  overlayLayer.appendChild(combinedBoxEl);
}

export function onChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function notify() {
  changeListeners.forEach((fn) => fn(selection.slice()));
}

export function getSelection() {
  return selection.slice();
}

export function isSelected(el) {
  return selection.includes(el);
}

export function clearSelection() {
  selection = [];
  render();
  notify();
}

export function setSelection(elements) {
  selection = elements.filter(Boolean);
  render();
  notify();
}

export function select(el, { additive = false } = {}) {
  if (!el) return;
  if (additive) {
    if (selection.includes(el)) {
      selection = selection.filter((e) => e !== el);
    } else {
      selection = [...selection, el];
    }
  } else {
    selection = [el];
  }
  render();
  notify();
}

export function removeFromSelection(el) {
  selection = selection.filter((e) => e !== el);
  render();
  notify();
}

// ---------------------------------------------------------------------------
// Overlay rendering
// ---------------------------------------------------------------------------

function destroyBoxes() {
  boxEls.forEach(({ box }) => box.remove());
  boxEls = new Map();
}

export function render() {
  if (!overlayLayer) return;

  // Prune selection of detached elements.
  selection = selection.filter((el) => el.isConnected);

  const keep = new Set(selection);
  for (const [el, entry] of boxEls) {
    if (!keep.has(el)) {
      entry.box.remove();
      boxEls.delete(el);
    }
  }

  const single = selection.length === 1;

  for (const el of selection) {
    const meta = ComponentRegistry.getMeta(el);
    let entry = boxEls.get(el);
    if (!entry) {
      entry = createBoxFor(el);
      boxEls.set(el, entry);
    }
    positionBox(entry, el);
    entry.box.classList.toggle('ab-editor-box--solo', single);
    const showHandles = single && (meta?.resizable ?? true);
    entry.handles.forEach((h) => {
      h.style.display = showHandles ? 'block' : 'none';
    });
    entry.dimLabel.style.display = single ? 'block' : 'none';
    if (single) {
      const rect = el.getBoundingClientRect();
      entry.dimLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    }
    if (meta) {
      entry.nameLabel.textContent = meta.name;
      entry.nameLabel.style.display = single ? 'block' : 'none';
    }
  }

  if (selection.length > 1) {
    const boxes = selection.map((el) => el.getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    const right = Math.max(...boxes.map((b) => b.right));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    combinedBoxEl.style.display = 'block';
    combinedBoxEl.style.left = `${left}px`;
    combinedBoxEl.style.top = `${top}px`;
    combinedBoxEl.style.width = `${right - left}px`;
    combinedBoxEl.style.height = `${bottom - top}px`;
  } else {
    combinedBoxEl.style.display = 'none';
  }
}

function createBoxFor(el) {
  const box = document.createElement('div');
  box.className = 'ab-editor-box ab-editor-ui';

  const nameLabel = document.createElement('div');
  nameLabel.className = 'ab-editor-box__name';
  box.appendChild(nameLabel);

  const dimLabel = document.createElement('div');
  dimLabel.className = 'ab-editor-box__dim';
  box.appendChild(dimLabel);

  const handles = HANDLE_POSITIONS.map((pos) => {
    const handle = document.createElement('div');
    handle.className = `ab-editor-handle ab-editor-handle--${pos}`;
    handle.style.cursor = CURSOR_FOR[pos];
    handle.addEventListener('pointerdown', (e) => beginResize(e, el, pos));
    box.appendChild(handle);
    return handle;
  });

  overlayLayer.appendChild(box);
  return { box, handles, dimLabel, nameLabel };
}

function positionBox(entry, el) {
  const rect = el.getBoundingClientRect();
  entry.box.style.left = `${rect.left}px`;
  entry.box.style.top = `${rect.top}px`;
  entry.box.style.width = `${rect.width}px`;
  entry.box.style.height = `${rect.height}px`;
}

// ---------------------------------------------------------------------------
// Move (drag) interaction — call from the page-level pointerdown handler
// once a target element has been resolved and (pre-)selected.
// ---------------------------------------------------------------------------

export function beginMoveDrag(e, movableElements) {
  const startX = e.clientX;
  const startY = e.clientY;
  const items = movableElements
    .map((el) => ({ el, id: ComponentRegistry.getMeta(el)?.id || ComponentRegistry.idFor(el) }))
    .filter(({ el }) => ComponentRegistry.getMeta(el)?.movable ?? true);
  if (!items.length) return;

  let dragging = false;
  let startBoxes = null;
  let rafPending = false;
  let lastEvent = e;

  function onMove(ev) {
    lastEvent = ev;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    if (!dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      dragging = true;
      startBoxes = items.map(({ el, id }) => {
        TransformManager.ensurePositioned(el, id);
        return { el, id, box: TransformManager.getXYWH(el) };
      });
    }

    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      applyDrag(dx, dy, lastEvent.shiftKey);
    });
  }

  function applyDrag(dx, dy, disableSnap) {
    let snapDx = dx;
    let snapDy = dy;

    if (items.length === 1 && !disableSnap) {
      const { el } = items[0];
      const start = startBoxes[0];
      // Compute the unsnapped viewport rect the element would occupy.
      const parentRect = el.parentElement.getBoundingClientRect();
      const unsnappedLeft = parentRect.left + start.box.x + dx;
      const unsnappedTop = parentRect.top + start.box.y + dy;
      const candidateRect = { left: unsnappedLeft, top: unsnappedTop, width: start.box.w, height: start.box.h };
      const candidates = GuideManager.collectCandidates(el);
      const snap = GuideManager.findSnap(candidateRect, candidates);
      snapDx = dx + snap.dx;
      snapDy = dy + snap.dy;
      GuideManager.show(snap);
    } else {
      GuideManager.clear();
    }

    for (const { el, id, box } of startBoxes) {
      TransformManager.setXYWH(el, id, { x: box.x + snapDx, y: box.y + snapDy });
    }
    render();
  }

  function onUp() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    GuideManager.clear();
    if (dragging && startBoxes) {
      const changes = startBoxes.map(({ el, id, box }) => ({
        el,
        id,
        before: box,
        after: TransformManager.getXYWH(el),
      }));
      commitChanges(changes, 'Move');
    }
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// ---------------------------------------------------------------------------
// Resize interaction
// ---------------------------------------------------------------------------

function beginResize(e, el, handlePos) {
  e.preventDefault();
  e.stopPropagation();

  const meta = ComponentRegistry.getMeta(el);
  const id = meta?.id || ComponentRegistry.idFor(el);
  TransformManager.ensurePositioned(el, id);
  const startBox = TransformManager.getXYWH(el);
  const startX = e.clientX;
  const startY = e.clientY;
  const isImage = el.tagName === 'IMG';

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const lockAspect = isImage || ev.shiftKey;
    const next = TransformManager.resizeWithHandle(startBox, handlePos, dx, dy, lockAspect);
    TransformManager.setXYWH(el, id, next);
    render();
  }

  function onUp() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    const after = TransformManager.getXYWH(el);
    if (after.x !== startBox.x || after.y !== startBox.y || after.w !== startBox.w || after.h !== startBox.h) {
      commitChanges([{ el, id, before: startBox, after }], 'Resize');
    }
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// ---------------------------------------------------------------------------
// Keyboard nudge
// ---------------------------------------------------------------------------

export function nudge(dx, dy) {
  const items = selection
    .map((el) => ({ el, id: ComponentRegistry.getMeta(el)?.id || ComponentRegistry.idFor(el) }))
    .filter(({ el }) => ComponentRegistry.getMeta(el)?.movable ?? true);
  if (!items.length) return;

  const before = items.map(({ el }) => TransformManager.getXYWH(el));
  items.forEach(({ el, id }) => TransformManager.moveBy(el, id, dx, dy));
  const changes = items.map(({ el, id }, i) => ({ el, id, before: before[i], after: TransformManager.getXYWH(el) }));
  commitChanges(changes, 'Nudge');
  render();
}

// ---------------------------------------------------------------------------
// Shared history commit for move/resize/nudge/align-style batches
// ---------------------------------------------------------------------------

export function commitChanges(changes, label = 'Transform') {
  if (!changes.length) return;
  for (const { el, id } of changes) {
    TransformManager.persist(el, id);
  }
  HistoryManager.push({
    label,
    undo() {
      for (const { el, id, before } of changes) {
        TransformManager.setXYWH(el, id, before);
        TransformManager.persist(el, id);
      }
      render();
    },
    redo() {
      for (const { el, id, after } of changes) {
        TransformManager.setXYWH(el, id, after);
        TransformManager.persist(el, id);
      }
      render();
    },
  });
  render();
}
