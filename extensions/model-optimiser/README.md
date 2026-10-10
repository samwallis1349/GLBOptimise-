# AssetBench Chrome extensions (Reduce Polys / Model Optimiser)

One codebase, two store products (`editions.js`). Only one may be listed at a
time, because the Chrome Web Store refuses duplicate-functionality extensions
from one developer:

- **Reduce Polys** (`reduce-polys`, the default and what we sell now): Check (free) + Reduce (£3).
- **Model Optimiser** (`model-optimiser`): all four tabs below, for later.

The tools run entirely in the browser (nothing is uploaded), on the same
engines as the Cloud API (`worker/api`):

| Tab | Price | Does |
|---|---|---|
| Check | Free | Triangles, draw calls, texture memory, file size, and a score for low/mid/high phones and Quest. Runs as soon as a model is dropped. |
| Reduce | £3 | Keep a % of triangles; optional "across UV seams". |
| Optimise | £3 | Fits a budget (mobile prop/character/scene, Quest, web): reduce, resize textures, Meshopt. |
| Compress | £3 | PNG/JPEG textures to KTX2 (Basis), optional max size. |

## Unlocks

Keys are checked with Lemon Squeezy's License API (`src/licensing.js`):

- **All Access** (product `LICENSE_PRODUCT_ID`, the £25/month subscription or an old lifetime key) unlocks every tab.
- **£3 single-tool keys** (`SINGLE_TOOL_PRODUCT_ID`) unlock one tab. A new key is bound to the tab it's entered on through `/api/tool-binding`, the same binding the website uses, so a Reduce Polys key bought on the site also unlocks Reduce here.
- A tool with its own product in `TOOL_PRODUCTS` (`src/shared/config/toolProducts.js`) gets its own checkout link automatically.

Each activation uses one of the key's device slots. Keys are re-checked when
the panel opens; refunded or cancelled keys drop out (offline keeps them).

## Build and try

```
npm run build:extension                                           # Reduce Polys -> dist/reduce-polys
node extensions/model-optimiser/build.mjs --edition model-optimiser  # -> dist/model-optimiser
```

`chrome://extensions` → Developer mode → **Load unpacked** → choose `extensions/model-optimiser/dist/reduce-polys`.
Click the cube icon; the panel opens on the right.

## Publish

1. Bump `version` in `public/manifest.json`.
2. `npm run zip:extension` → `extensions/assetbench-reduce-polys-<version>.zip`.
3. Upload at <https://chrome.google.com/webstore/devconsole> and fill in the listing from `store/STORE_LISTING.md` (text, screenshots, promo tile, privacy answers).
4. Once approved, paste the store URL into `src/shared/config/extensions.js`; the Reduce Polys page then shows an "Add to Chrome" bar.

`wasm-unsafe-eval` in the manifest's CSP is required for the meshoptimizer and Basis KTX2 WebAssembly.

## Layout

- `src/engine.js` — the four tools (imports `worker/api`); tested in `tests/model-optimiser.test.mjs`.
- `src/engine-worker.js` — runs them off the UI thread; loads `basis_encoder.wasm` for Compress.
- `src/licensing.js` — Lemon Squeezy activation, validation and per-tool scope.
- `src/panel.js` + `public/` — the side panel, manifest, icons and service worker.
- `build.mjs` — esbuild bundle into `dist/`, `--zip` for the store.
