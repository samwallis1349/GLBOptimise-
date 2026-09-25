# Homepage wizard hero

The free-wizard hero at the top of the homepage. Visitors drag the model
right through five full turns to step from 975,597 triangles down to
9,999, left to restore. The slider, Mesh (wireframe), zoom (75–200%),
the 1K/2K/4K texture choice and the Optimise preset control the same state.

| File | Role |
| --- | --- |
| `WizardHero.js` | Markup, controls, loading sequence, stats. Renders instantly; lazy-loads the scene. |
| `WizardScene.js` | Three.js: renderer, LOD switching, shared textures, preset, drag, FX, render loop. |
| `config.js` | Tunables (drag turns, spring, tilt, FX intensity, zoom range, default textures) and measured export sizes. |
| `hero-manifest.json` | Generated: triangle counts, byte sizes, bounds and file names. |
| `wizard-hero.css` | Styles, consolidated from the approved prototype. |
| `/src/pages/wizard-compare/` | `/wizard-compare`: Before / Balanced / Small comparison page. |

## What loads, and when

Measured on the files in `public/hero/`:

1. **Immediately:** background (234 KB WebP) and a still poster
   (75 KB WebP), plus about 11 KB of gzipped hero JS.
2. **Preview:** Three.js + GLTFLoader chunk (~163 KB gzip), the 25k-triangle
   mesh (0.31 MB) and 1K textures (1.29 MB). Drag and zoom work from here on.
3. **Full detail:** the 975,597-triangle mesh (7.05 MB) and the default
   2K textures (3.87 MB). After that the slider, Optimise and texture controls turn on.
4. **Only when used:** the other levels (0.16–3.21 MB each) start loading
   on first drag or slider use, one at a time with the next one needed first.
   4K textures (12.5 MB) load only when 4K is ticked. The Optimise preset
   (2.27 MB) loads only when Optimise is pressed.

On a Save-Data connection the default set is 1K. The hero never labels a
level it has not loaded: while a level is still loading, the nearest loaded
level is shown and its own triangle count is displayed.

The top-left GLB figure is the size of a **standalone export** for the
chosen geometry and texture settings (`EXPORT_BYTES` in `config.js`). It is
not what the page has downloaded.

Rendering stops when the hero is offscreen, when the tab is hidden, and
when nothing is moving. Reduced-motion users get direct control with no
inertia, tilt, trails, sparks or button shimmer.

## Replacing the model

1. Produce a multi-LOD GLB with six aligned `LOD_0`…`LOD_5` nodes that share
   one material and have the same origin, scale and orientation. Also
   produce 1K and 2K texture sets (`texture-{1,2}k-{map.jpg,normalMap.png,roughnessMap.jpg}`),
   the download GLBs and `background.png`, all laid out like the
   handoff's `preview/assets/` folder.
2. Run `node scripts/hero/build-assets.mjs <that folder>`. This rewrites
   `public/hero/` and `hero-manifest.json`.
3. Update `EXPORT_BYTES`, `OPTIMISED` and `DOWNLOADS` in `config.js` with
   the new measured sizes.
4. Regenerate `public/hero/poster.webp`: a transparent still of the default
   view. The one here was captured from the running hero at 1.5× scale with
   the backdrop and overlays hidden.

Standard download: `assetbench-wizard-balanced.glb` (24,999 triangles,
standard GLB, any importer). The optimised download uses
`EXT_meshopt_compression` and needs an importer that supports it. Both
models are static, with no rig or animation.
