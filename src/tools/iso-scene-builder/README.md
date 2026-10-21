# Iso Scene Builder

A bank of the user's own isometric PNG/WebP objects, dragged onto a 2:1 grid
to lay out a scene. Runs entirely in the browser.

- `index.js` — the page: bank, canvas stage, inspector, export.
- `scene.js` — pure maths (grid ↔ world, snapping, depth order, hit pixels,
  bounds, ground point detection, layout JSON). Covered by `tests/iso-scene.test.mjs`.
- `bank.js` — IndexedDB (`assetbench-iso-scene`): the object bank and the
  autosaved current scene.

Each object is placed by its **ground point** (auto-detected as the middle of
the lowest opaque row, adjustable per object). It snaps to tile centres and
drives auto depth sorting: lower on screen draws in front, layers override.

Export: PNG (trimmed to the scene, 0.5–2×, capped at 8192 px), `layout.json`
(draw order, world + grid positions, scale, flip, layer), or a ZIP of both
plus every object image used.
