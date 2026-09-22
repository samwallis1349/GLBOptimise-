/** Smart alignment guides + snapping while dragging, Figma/Canva-style. */

const TOLERANCE = 7;

/** Builds candidate snap lines (viewport coordinates) from siblings, the parent, and the page. */
export function collectCandidates(el) {
  const parent = el.parentElement;
  const lines = { x: [], y: [] };

  if (parent) {
    Array.from(parent.children).forEach((sibling) => {
      if (sibling === el || sibling.closest?.('.ab-editor-ui')) return;
      const r = sibling.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      lines.x.push(r.left, r.left + r.width / 2, r.right);
      lines.y.push(r.top, r.top + r.height / 2, r.bottom);
    });

    const pr = parent.getBoundingClientRect();
    lines.x.push(pr.left, pr.left + pr.width / 2, pr.right);
    lines.y.push(pr.top, pr.top + pr.height / 2, pr.bottom);
  }

  lines.x.push(window.innerWidth / 2);
  lines.y.push(window.innerHeight / 2);

  return lines;
}

/**
 * Given the dragged element's unsnapped viewport rect and candidate lines,
 * returns a snap adjustment { dx, dy, vLine, hLine } (line positions are
 * viewport x/y, or null when no snap on that axis).
 */
export function findSnap(rect, candidates) {
  const targetsX = [rect.left, rect.left + rect.width / 2, rect.right];
  const targetsY = [rect.top, rect.top + rect.height / 2, rect.bottom];

  let bestDx = null;
  let bestDxAbs = Infinity;
  let vLine = null;
  for (const t of targetsX) {
    for (const c of candidates.x) {
      const d = c - t;
      if (Math.abs(d) <= TOLERANCE && Math.abs(d) < bestDxAbs) {
        bestDxAbs = Math.abs(d);
        bestDx = d;
        vLine = c;
      }
    }
  }

  let bestDy = null;
  let bestDyAbs = Infinity;
  let hLine = null;
  for (const t of targetsY) {
    for (const c of candidates.y) {
      const d = c - t;
      if (Math.abs(d) <= TOLERANCE && Math.abs(d) < bestDyAbs) {
        bestDyAbs = Math.abs(d);
        bestDy = d;
        hLine = c;
      }
    }
  }

  return { dx: bestDx || 0, dy: bestDy || 0, vLine, hLine };
}

let guideLayer = null;
let vLineEl = null;
let hLineEl = null;

export function init(overlayLayer) {
  guideLayer = overlayLayer;
  vLineEl = document.createElement('div');
  vLineEl.className = 'ab-editor-guide ab-editor-guide--v';
  hLineEl = document.createElement('div');
  hLineEl.className = 'ab-editor-guide ab-editor-guide--h';
  guideLayer.appendChild(vLineEl);
  guideLayer.appendChild(hLineEl);
  clear();
}

export function show({ vLine, hLine }) {
  if (!vLineEl) return;
  if (vLine != null) {
    vLineEl.style.display = 'block';
    vLineEl.style.left = `${vLine}px`;
  } else {
    vLineEl.style.display = 'none';
  }
  if (hLine != null) {
    hLineEl.style.display = 'block';
    hLineEl.style.top = `${hLine}px`;
  } else {
    hLineEl.style.display = 'none';
  }
}

export function clear() {
  if (!vLineEl) return;
  vLineEl.style.display = 'none';
  hLineEl.style.display = 'none';
}
