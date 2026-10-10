# AssetBench Reduce Polys — Chrome extension

Cut the triangle count of a `.glb` from Chrome's side panel, using the free
Reduce Polys API (`POST /api/v1/3d/reduce`, see `public/docs`). Click the
toolbar button, add a free API key once, drop a model, choose how much to
keep, and the reduced `name-reduced.glb` lands in Downloads.

- `api.js` — the only code that talks to AssetBench (tested in `tests/extension.test.mjs`).
- `panel.html` / `panel.js` / `panel.css` — the side panel UI.
- `sw.js` — makes the toolbar button open the side panel (a popup would close when the file picker opens).

Needs Chrome 116+. Permissions: `storage` (the key and last settings),
`downloads` (saving the result), `sidePanel`, and access to
`www.assetbench.co.uk` only.

## Try it locally

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** → choose this `extensions/chrome` folder.
3. Pin it, click the cube icon, and the panel opens on the right.

After editing files, press the reload icon on the extension's card.

## Publish to the Chrome Web Store

1. Bump `version` in `manifest.json`.
2. `npm run zip:extension` → `extensions/assetbench-reduce-polys-chrome.zip`.
3. Upload it at <https://chrome.google.com/webstore/devconsole> (one-off $5 developer fee).
4. Listing: use the 128px icon, at least one 1280×800 screenshot, and the
   privacy answers: it sends the chosen model to assetbench.co.uk for
   processing and stores only the API key locally; no personal data is collected.
