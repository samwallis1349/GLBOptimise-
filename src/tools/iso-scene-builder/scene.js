/**
 * Iso Scene Builder — pure scene maths (no DOM), so node --test can cover it.
 *
 * World space is plain pixels. The isometric grid is 2:1 dimetric: a tile is
 * `tile` px wide and tile/2 px tall, and grid cell (gx, gy) has its top corner
 * at worldFromGrid(gx, gy). Every placed object is positioned by its ground
 * point (the anchor in its bank entry), which is what snaps to tile centres
 * and what auto depth sorting compares.
 */

export const TILE_SIZES = [32, 64, 128, 256];
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
export const LAYER_MIN = -5;
export const LAYER_MAX = 5;
export const SCALE_MIN = 0.05;
export const SCALE_MAX = 10;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function worldFromGrid(gx, gy, tile) {
  return { x: (gx - gy) * tile / 2, y: (gx + gy) * tile / 4 };
}

export function gridFromWorld(x, y, tile) {
  const a = x / (tile / 2), b = y / (tile / 4);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

/** Nearest tile centre; `step` 'corner' snaps to tile corners, 'half' to half-tile steps. */
export function snapWorld(x, y, tile, step = 'centre') {
  const { gx, gy } = gridFromWorld(x, y, tile);
  const snap = step === 'half'
    ? (v) => Math.round(v * 2) / 2
    : step === 'corner'
      ? Math.round
      : (v) => Math.floor(v) + 0.5;
  return worldFromGrid(snap(gx), snap(gy), tile);
}

/** Moves one tile along a grid axis — what the arrow keys do with snapping on. */
export function stepOnGrid(x, y, tile, dgx, dgy) {
  const { gx, gy } = gridFromWorld(x, y, tile);
  return worldFromGrid(gx + dgx, gy + dgy, tile);
}

/**
 * Draw order: layer first, then (auto depth) ground point y — further up the
 * screen is further back — then x, then insertion order so ties never flicker.
 */
export function drawOrder(items, autoDepth = true) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.layer - b.item.layer)
      || (autoDepth ? (a.item.y - b.item.y) || (a.item.x - b.item.x) : 0)
      || (a.index - b.index))
    .map(({ item }) => item);
}

/** The placed object's drawn rectangle in world space. */
export function itemRect(item, object) {
  const w = object.width * item.scale, h = object.height * item.scale;
  const ax = item.flip ? 1 - object.anchorX : object.anchorX;
  return { x: item.x - ax * w, y: item.y - object.anchorY * h, w, h };
}

/** World point → source pixel in the object's image, or null when outside it. */
export function pixelAt(item, object, wx, wy) {
  const r = itemRect(item, object);
  if (wx < r.x || wy < r.y || wx >= r.x + r.w || wy >= r.y + r.h) return null;
  let px = Math.floor((wx - r.x) / item.scale);
  const py = Math.floor((wy - r.y) / item.scale);
  if (item.flip) px = object.width - 1 - px;
  return { px: clamp(px, 0, object.width - 1), py: clamp(py, 0, object.height - 1) };
}

/** Union of every placed object's rectangle, or null for an empty scene. */
export function sceneBounds(items, objects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    const object = objects.get(item.objectId);
    if (!object) continue;
    const r = itemRect(item, object);
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

/**
 * Ground point from the alpha channel: horizontally the middle of the opaque
 * pixels, vertically their lowest row. For an isometric sprite that lowest
 * row is the front corner of its footprint.
 */
export function anchorFromAlpha(alpha, width, height, threshold = 16) {
  let minX = width, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        maxY = y;
      }
    }
  }
  if (maxX < 0) return { anchorX: 0.5, anchorY: 1 };
  return { anchorX: (minX + maxX + 1) / 2 / width, anchorY: (maxY + 1) / height };
}

/** The layout JSON a game engine reads back: one entry per object, in draw order. */
export function layoutJson(scene, objects) {
  const ordered = drawOrder(scene.items, scene.autoDepth);
  return {
    generator: 'Asset Bench Iso Scene Builder',
    version: 1,
    tile: { width: scene.tile, height: scene.tile / 2, projection: '2:1 dimetric' },
    origin: 'World pixels; grid cell (0,0) has its top corner at x 0, y 0.',
    objects: ordered.map((item, drawIndex) => {
      const object = objects.get(item.objectId);
      const { gx, gy } = gridFromWorld(item.x, item.y, scene.tile);
      return {
        drawIndex,
        object: object?.name ?? item.objectId,
        x: round(item.x), y: round(item.y),
        gridX: round(gx), gridY: round(gy),
        scale: round(item.scale), flipX: item.flip, layer: item.layer,
        anchor: object ? { x: round(object.anchorX), y: round(object.anchorY) } : null,
      };
    }),
  };
}

const round = (v) => Math.round(v * 1000) / 1000;
