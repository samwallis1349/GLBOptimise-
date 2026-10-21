/**
 * Fixed camera, scale, direction and style presets. Pure data and maths, so
 * Node tests can import it.
 *
 * Projection: true 2:1 isometric (dimetric). The camera turns 45° and looks
 * down at atan(1/2) ≈ 26.57°, so a 1 × 1 m floor square becomes a diamond
 * exactly twice as wide as it is tall.
 */
export const ELEVATION = Math.atan(0.5);

/** One tile is 1 × 1 m. tileW is the diamond's width in pixels. */
export const TILE_PRESETS = [
  { id: 'standard', label: 'Standard — 128 × 64 tile', tileW: 128 },
  { id: 'pixel', label: 'Pixel art — 64 × 32 tile', tileW: 64 },
  { id: 'hd', label: 'HD — 256 × 128 tile', tileW: 256 },
];

export function tilePreset(id) {
  return TILE_PRESETS.find((p) => p.id === id) ?? TILE_PRESETS[0];
}

/** Screen pixels per metre, measured across the screen (a 1 m tile edge runs diagonally). */
export function pxPerMetre(tileW) {
  return tileW / Math.SQRT2;
}

/** Screen directions: x to the right, y down the screen. */
export const DIRECTIONS = {
  e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1], n: [0, -1], ne: [1, -1],
};

/** Which directions get rendered. In 2:1 iso the diagonals run along the grid, so 4 = diagonals. */
export const DIRECTION_SETS = {
  8: ['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se'],
  4: ['se', 'sw', 'nw', 'ne'],
  1: ['se'],
};

/**
 * Y rotation that turns a model facing +Z (the glTF convention) towards a
 * screen direction. The camera sits at (+X, +Y, +Z): screen right is world
 * (1, 0, -1) and screen down is world (1, 0, 1).
 */
export function facingRotation(dir) {
  const [sx, sy] = DIRECTIONS[dir];
  const wx = sx + sy, wz = -sx + sy;
  return Math.atan2(wx, wz);
}

export const STYLE_PRESETS = {
  clean: { outline: 2, lighting: 'soft', shadow: true, pixel: false, pixelScale: 2, levels: 6 },
  soft: { outline: 0, lighting: 'soft', shadow: true, pixel: false, pixelScale: 2, levels: 6 },
  pixel: { outline: 1, lighting: 'flat', shadow: true, pixel: true, pixelScale: 2, levels: 6 },
};

export const FPS_OPTIONS = [8, 12, 24];
export const MAX_FRAMES_PER_CLIP = 64;
export const SHEET_WIDTHS = [2048, 4096, 8192];

/**
 * Cell size and base point that fit a model of height H (m) and horizontal
 * reach r (m, from the base point) in every direction.
 * margin grows the box for limbs that swing out while animating.
 */
export function autoCell({ height, reach, tileW, margin = 1.2 }) {
  const s = pxPerMetre(tileW);
  const up = (height * Math.cos(ELEVATION) + reach * Math.sin(ELEVATION)) * s * margin;
  const down = reach * Math.sin(ELEVATION) * s * margin;
  const half = reach * s * margin;
  const pad = 6;
  const need = Math.max(2 * half, up + down) + pad * 2;
  const cell = Math.max(32, Math.ceil(need / 16) * 16);
  const anchorY = Math.round(cell - down - pad);
  return { cell, anchor: { x: cell / 2, y: anchorY } };
}
