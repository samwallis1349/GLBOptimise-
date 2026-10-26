# AssetBench Chrome extensions (Reduce Polys / Model Optimiser)

One codebase, two store products (`editions.js`). Only one may be listed at a
time, because the Chrome Web Store refuses duplicate-functionality extensions
from one developer:

- **Reduce Polys** (`reduce-polys`, the default and what we sell now): Check (free) + Reduce (5 free a day, then 99p).
- **Model Optimiser** (`model-optimiser`): all four tabs below, for later.

The tools run entirely in the browser (nothing is uploaded), on the same
engines as the Cloud API (`worker/api`):

| Tab | Price | Does |
|---|---|---|
| Check | Free | Triangles, draw calls, texture memory, file size, and a score for low/mid/high phones and Quest. Runs as soon as a model is dropped. |
| Reduce | 5 free a day, then 99p | Keep a % of triangles; optional "across UV seams". |
| Optimise | 5 free a day, then 99p | Fits a budget (mobile prop/character/scene, Quest, web): reduce, resize textures, Meshopt. |
| Compress | 5 free a day, then 99p | PNG/JPEG textures to KTX2 (Basis), optional max size. |

## Free daily runs

Each edition's `dailyFree` (5) lets anyone run the paid tools that many times a
day before the unlock card replaces the Run button (`src/quota.js`). One count
covers every paid tool, only successful runs use it, and it resets at midnight
UTC. The header pill shows what's left; the card counts down to the reset.
It lives in `chrome.storage.local` with no account behind it, so clearing the
extension's storage resets it: it's a nudge to buy, not enforcement.

To try it, open the panel, right-click → Inspect, and in the console:

```js
// Use up today's runs: the unlock card and countdown appear
chrome.storage.local.set({ quota: { dailyRunsCount: 5, lastResetDay: new Date().toISOString().slice(0, 10) } })
// Yesterday's count: back to 5/5
chrome.storage.local.set({ quota: { dailyRunsCount: 5, lastResetDay: '2000-01-01' } })
// Start over
chrome.storage.local.remove('quota')
```

## Unlocks

Keys are checked with Lemon Squeezy's License API (`src/licensing.js`):

- **All Access** (product `LICENSE_PRODUCT_ID`, the £10/month subscription or an old lifetime key) unlocks every tab.
- **99p single-tool keys** (`SINGLE_TOOL_PRODUCT_ID`) unlock one tab. A new key is bound to the tab it's entered on through `/api/tool-binding`, the same binding the website uses, so a Reduce Polys key bought on the site also unlocks Reduce here.
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

## The newer editions (4–7)

| Edition | Free tool | Paid tools | Takes |
|---|---|---|---|
| `animation-tools` (Animation Tools) | Clips | Strip, Optimise | GLB, glTF, FBX, OBJ, ZIP |
| `converter` (3D Converter) | Info | Convert (GLB/glTF/OBJ/FBX), Split, Merge, LODs | GLB, glTF, FBX, OBJ, ZIP |
| `app-assets` (App Assets) | Check | Icons, Xcode image sets, Screenshots | PNG, JPEG, WebP |
| `image-tools` (Sprite Studio) | Check | Cutout, Line art, Iso | PNG, JPEG, WebP + GLB, FBX, OBJ, glTF |

`accepts: 'any'` editions convert glTF / FBX / OBJ / ZIP to GLB on the way in
(`src/inputs.js`, the Cloud API's converter); the first three listings stay
GLB-only. Each edition bundles only its own tool group (`src/groups/`, swapped
in by `build.mjs`), so the GLB-only ones don't carry three.js's FBX loader.
Iso draws with WebGL, so it runs in the panel (`src/iso-runner.js`, its own
bundle, loaded when that tab runs) on the site tool's stage
(`public/tools/model-to-iso-sprites/js`).

Two build fixes apply to every edition:

- **ndarray-ops is stubbed.** glTF-Transform's texture resizer pulls it in, and it
  calls `new Function()` the moment it loads. Extension pages forbid eval, so
  the engine worker died on start and every tool hung on "Working…". Nothing in
  the extension uses it.
- **Draco GLBs work.** The worker loads `draco_decoder.wasm` (copied next to it)
  and registers the API's decoder, so Draco-compressed models open. Output is
  uncompressed (there's no Draco encoder), and the report says so.

Build and test:

```
node extensions/model-optimiser/build.mjs --edition converter          # or animation-tools, app-assets, image-tools
node extensions/model-optimiser/make-upload-folder.mjs --edition converter
node --test tests/extension-editions.test.mjs
```

Listings and art: `store/<edition>/STORE_LISTING.md` and its PNGs.

## Layout

- `src/engine.js` — the tools (imports `worker/api`); tested in `tests/model-optimiser.test.mjs` and `tests/extension-editions.test.mjs`.
- `src/groups/`, `src/tools/` — the newer editions' tools; `src/inputs.js` reads models and images; `src/kinds.js` says which tools take images.
- `src/engine-worker.js` — runs them off the UI thread; loads `draco_decoder.wasm`, and `basis_encoder.wasm` for Compress; decodes WebP with the browser.
- `src/licensing.js` — Lemon Squeezy activation, validation and per-tool scope.
- `src/panel.js` + `public/` — the side panel, manifest, icons and service worker.
- `build.mjs` — esbuild bundle into `dist/`, `--zip` for the store.
