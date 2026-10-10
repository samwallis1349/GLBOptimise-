# Microsoft Edge Add-ons listing: Reduce Polys (free)

Build the upload with `npm run upload:extension:edge`.
Dashboard: Microsoft Partner Center → Edge → Extensions (https://partner.microsoft.com/dashboard/microsoftedge/overview).

## Store listing

**Display name** comes from the package: Reduce Polys – Free GLB Polygon Reducer by AssetBench

**Description** (Edge needs at least 250 characters)

> Too many triangles? Reduce Polys cuts the polygon count of any GLB (binary glTF) model in a couple of seconds, right in Edge's sidebar. It's free, with no account and no limits.
>
> HOW IT WORKS
> 1. Click the Reduce Polys icon. The panel opens on the side.
> 2. Drop in a .glb. You see its triangle count straight away.
> 3. Choose how much to keep (5–95%) and click Reduce.
> 4. Download the lighter model.
>
> WHAT YOU GET
> • Polygon reduction with meshoptimizer, the simplifier used across the games industry
> • Textures, materials, UVs and normals kept
> • "Reduce across UV seams" for AI-generated and scanned models that barely reduce otherwise
> • A model check: triangles, draw calls, texture memory, and a score for low, mid and high-end phones and Quest VR, for Unity, Unreal, Godot, Roblox or the web
>
> PRIVATE BY DESIGN
> Your models are processed on your own computer. Nothing is uploaded, and the extension collects no data.
>
> GOOD FOR
> Mobile and web games, three.js and Babylon.js scenes, AR product viewers, VR, and taming heavy models from Meshy, Tripo and other AI 3D generators.
>
> More free 3D tools at https://www.assetbench.co.uk

**Short description** comes from the package: Cut the triangle count of GLB models in your browser, free. Includes a model check. Files never leave your computer.

**Search terms** (up to 7)

reduce polygons, GLB, glTF, decimate, low poly, 3D model optimizer, polycount

**Images** (in this folder)

| Slot | File |
|---|---|
| Extension Store logo 300×300 | `store-logo-300x300.png` |
| Small promotional tile 440×280 (optional) | `promo-tile-440x280.png` |
| Screenshots 1280×800 | `screenshot-1-before-after.png`, `screenshot-2-reduce.png`, `screenshot-3-free-check.png` |

**Website:** https://www.assetbench.co.uk/reduce-polys  
**Support contact:** https://www.assetbench.co.uk/contact

## Properties

**Category:** Developer tools

**Privacy policy requirements:** "Does your extension access, collect or transmit personal information?" → **No**. It reads only the model the user picks and keeps its settings on the device.

**Privacy policy URL** (optional for this answer, but add it): https://www.assetbench.co.uk/privacy

**Mature content:** No.

## Availability

Visibility: Public. Markets: all markets.

## Notes for certification

Free extension, no sign-in. To test: click the toolbar icon to open the sidebar panel, drop any .glb model (for example https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb), choose Keep triangles and click Reduce, then Download. The Check tab scores the model. All processing is local; the extension makes no network requests. Permissions: sidePanel (the UI), storage (last slider settings), downloads (saving the result). WebAssembly (meshoptimizer) is bundled, hence wasm-unsafe-eval in the CSP.
