# Model to Isometric

Local browser tool at `/model-to-isometric`. Reuses ThumbnailViewer rendering/disposal and GLB decoding; adds a fixed orthographic camera, shared eight-view framing, self-contained FBX checks and static rest-pose rendering.

The tool registry drives routing, homepage discovery and existing tool counts (18 after this addition). Its gold highlights follow the AssetBench colour palette. Horizontal and vertical drag adjust the starting angle and camera elevation; exported directions remain 45? apart. Existing site access rules remain in effect.

## Preview

Run `npm run dev -- --host 127.0.0.1`, then open:

- Full website: http://127.0.0.1:5173/model-to-isometric?sample=1
- Isolated development preview: http://127.0.0.1:5173/scripts/isometric/preview.html?sample=1

The isolated preview and test pages are outside the production entry points. They are not copied into the production build.

## Validation

- `node --test src/tools/model-to-isometric/*.test.mjs`
- With Vite running, `node scripts/isometric/run-render-check.mjs` (Windows / Microsoft Edge)
- `npm run build`

The browser check verifies distinct views, transparent/opaque background pixels, PNG and sheet sizes, ZIP contents, metadata and loading the existing Colossus GLB. FBX loading is implemented but has not been validated with a representative embedded-texture FBX fixture.

Exports retain an untrimmed square canvas. Ground anchors use top-left pixel coordinates; directions describe camera azimuths, not automatic detection of character facing. Animation clips (GLB or FBX) render as 4–16 frames per direction: one sheet row per direction, one column per frame, framed from the union of every sampled pose so the camera never moves. "Keep in place" removes the steady horizontal drift of the top-most animated position track (usually the hips) and keeps sway and bob. Without a clip, models render in their rest pose. Locked world scale fixes pixels per metre and puts the ground point 75% down every frame so sprites from different models line up; generation is blocked when a model would be cropped. Backgrounds and textures must be embedded in the supplied asset.
