/**
 * The /2d-games page's engine notes: what the 2D and iso tools hand over and how each engine takes it.
 * Read by the page (pages/game-2d/Game2DPage.js) and by the build's crawler summary
 * (scripts/seo-pages.mjs), so search engines see the same text visitors do.
 *
 * Only what the exports really are: Model to Iso Sprites writes one PNG sheet of equal square cells (each
 * animation + direction starts a new row) and a JSON with every frame's rectangle, animation, direction and
 * ground anchor (pixels, plus a 0-1 `pivot`). Its JSON is not a drop-in Phaser/PixiJS atlas (their `anchor`
 * means something else), so the steps below slice by cell size instead.
 */

export const ENGINE_NOTES = [
  {
    engine: 'Godot',
    steps: 'Add an AnimatedSprite2D, then in SpriteFrames use "Add frames from sprite sheet" with the cell size from the JSON (meta.cell). Set the offset so the anchor pixel sits on the node.',
  },
  {
    engine: 'Unity',
    steps: 'Import the sheet as Sprite (Multiple), then Sprite Editor → Slice → Grid By Cell Size using meta.cell, with a custom pivot from any frame\'s pivot value.',
  },
  {
    engine: 'Phaser',
    steps: 'this.load.spritesheet(key, sheet, { frameWidth: cell, frameHeight: cell }), then setOrigin(pivot.x, pivot.y) so every frame stands on its tile.',
  },
  {
    engine: 'Tiled & tile maps',
    steps: 'The 64 × 32, 128 × 64 and 256 × 128 presets match the usual isometric tile sizes. One tile is one metre, so models rendered separately still line up.',
  },
];

/** What each tool gives you, in one line, for the "what you get" list. */
export const EXPORTS = [
  { tool: 'model-to-iso-sprites', gives: 'Sprite sheet PNG + JSON (frames, animations, directions, anchor), or a ZIP of every frame' },
  { tool: 'model-to-isometric', gives: '8 isometric PNGs, a sheet and a JSON in one ZIP' },
  { tool: 'iso-scene-builder', gives: 'Scene PNG (0.5–2×), layout.json with draw order and grid positions, or a ZIP of both' },
  { tool: 'alpha-cutout', gives: 'Clean transparent frames cut from a sprite sheet' },
  { tool: 'line-studio', gives: 'Transparent PNG, traced SVG, or both in a ZIP' },
  { tool: 'app-icon-generator', gives: 'Xcode AppIcon.appiconset, Android mipmaps, a game UI sprite sheet and the 1024 px master, in one ZIP' },
];

/** Plain HTML for the engine section (no styling classes beyond the page's own). */
export function engineNotesMarkup(esc = (v) => String(v)) {
  return `<ul class="game-2d__engines">${ENGINE_NOTES.map((n) => `<li class="game-2d__engine"><b>${esc(n.engine)}</b><p>${esc(n.steps)}</p></li>`).join('')}</ul>`;
}
