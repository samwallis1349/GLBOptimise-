# Chrome Web Store listing: Reduce Polys

Build the upload with `npm run zip:extension` (→ `extensions/assetbench-reduce-polys-<version>.zip`).

## Store listing tab

**Name** (from the manifest, 49/75 characters)
Reduce Polys – GLB Polygon Reducer by AssetBench

**Summary** (from the manifest, 123/132)
Cut the triangle count of GLB models in your browser. Free model check, £5 one-off unlock. Files never leave your computer.

**Category:** Developer Tools  
**Language:** English (United Kingdom)

**Description**

> Too many triangles? Reduce Polys cuts the polygon count of any GLB (binary glTF) model in a couple of seconds, right in Chrome's side panel.
>
> HOW IT WORKS
> 1. Click the Reduce Polys icon. The panel opens on the right.
> 2. Drop in a .glb. You see its triangle count straight away.
> 3. Choose how much to keep (5–95%) and click Reduce.
> 4. Download the lighter model.
>
> WHAT YOU GET
> • Polygon reduction with meshoptimizer, the simplifier used across the games industry
> • Textures, materials, UVs and normals kept
> • "Reduce across UV seams" for AI-generated and scanned models that barely reduce otherwise
> • Free model check: triangles, draw calls, texture memory, and a score for low, mid and high-end phones and Quest VR, for Unity, Unreal, Godot, Roblox or the web
>
> PRIVATE BY DESIGN
> Your models are processed on your own computer. Nothing is uploaded. It works offline once unlocked.
>
> PRICE
> The model check is free. Reducing is a £5 one-off unlock, no subscription. Already have AssetBench All Access? Your key unlocks it too.
>
> GOOD FOR
> Mobile and web games, three.js and Babylon.js scenes, AR product viewers, VR, and taming heavy models from Meshy, Tripo and other AI 3D generators.
>
> More free 3D tools at https://www.assetbench.co.uk

**Graphics** (in this folder)

| Slot | File |
|---|---|
| Store icon 128×128 | `../public/icons/icon-128.png` |
| Screenshot 1 | `screenshot-1-before-after.png` |
| Screenshot 2 | `screenshot-2-reduce.png` |
| Screenshot 3 | `screenshot-3-free-check.png` |
| Small promo tile 440×280 | `promo-tile-440x280.png` |

**Website:** https://www.assetbench.co.uk/reduce-polys  
**Support:** https://www.assetbench.co.uk/contact

## Privacy practices tab

**Single purpose**
Reduce the polygon count of GLB 3D models, with a free check of how well a model will run.

**Permission justifications**

- `sidePanel`: the tool's interface is a side panel, so it stays open while the user picks a file.
- `storage`: remembers the user's licence key and last slider settings on their computer.
- `downloads`: saves the reduced .glb to the user's Downloads folder.
- Host `api.lemonsqueezy.com`: checks the licence key the user enters with our payment provider.
- Host `www.assetbench.co.uk`: links a £5 key to the tool it was bought for (same as our website).

**Remote code:** No. All code ships in the package. WebAssembly (meshoptimizer) is bundled, which is why the CSP has `wasm-unsafe-eval`.

**Data usage:** tick **Authentication information** only (the licence key the user types, sent to Lemon Squeezy and assetbench.co.uk to check it). Tick all three certifications: not sold, not used for unrelated purposes, not used for creditworthiness or lending.

The 3D models never leave the computer, so no "website content" or "user activity" is collected.

**Privacy policy URL:** https://www.assetbench.co.uk/privacy (it has a "Browser extension" section).

## Distribution tab

Free to install (payments happen through Lemon Squeezy, not the Web Store). Visibility: Public. Regions: all.
