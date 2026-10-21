# Microsoft Edge Add-ons listing: Reduce Polys (99p unlock)

Build the upload with `npm run upload:extension:edge`.
Dashboard: Microsoft Partner Center → Edge → Extensions (https://partner.microsoft.com/dashboard/microsoftedge/overview).

## Store listing

**Display name** comes from the package: Reduce Polys – GLB Polygon Reducer by AssetBench

**Description** (Edge needs at least 250 characters)

> Too many triangles? Reduce Polys cuts the polygon count of any GLB (binary glTF) model in a couple of seconds, right in Edge's sidebar.
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
> • A model check: triangles, draw calls, texture memory, and a score for how well it will run on low, mid and high-end phones and VR headsets
>
> PRIVATE BY DESIGN
> Your models are processed on your own computer. Nothing is uploaded.
>
> PRICE
> The model check is free, and you get 10 free reduces. After that, unlimited reducing is a 99p one-off payment, no subscription. Already have AssetBench All Access or a Reduce Polys key from our website? It unlocks it too.
>
> GOOD FOR
> Making 3D models light enough for mobile games, websites and VR.
>
> More free 3D tools at https://www.assetbench.co.uk

**Short description** comes from the package: Cut GLB triangle counts in your browser. Free model check, 10 free reduces, then 99p once. Files never leave your computer.

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

**Privacy policy requirements:** "Does your extension access, collect or transmit personal information?" → **No**. Models stay on the device. The only thing sent anywhere is the licence key a buyer types, to our payment provider (Lemon Squeezy) and assetbench.co.uk to check it; it isn't personal information.

**Pricing:** the listing is free to install; the 99p unlock is sold through Lemon Squeezy, not Microsoft.

**Privacy policy URL** (optional for this answer, but add it): https://www.assetbench.co.uk/privacy

**Mature content:** No.

## Availability

Visibility: Public. Markets: all markets.

## Notes for certification

No sign-in. To test: click the toolbar icon to open the sidebar panel and drop any .glb model (for example https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb). The Check tab is free and scores the model. Reduce runs free 10 times, then needs the 99p unlock: paste this test licence key into the Reduce tab and click Unlock: TEST-KEY-GOES-HERE. Then choose Keep triangles, click Reduce, and Download. Models are processed locally; the only network calls are the licence check to api.lemonsqueezy.com and www.assetbench.co.uk. Permissions: sidePanel (the UI), storage (licence key, last settings and the free-run count, which is also kept in the browser's sync storage), downloads (saving the result). WebAssembly (meshoptimizer) is bundled, hence wasm-unsafe-eval in the CSP.
