# Chrome Web Store listing: 3D Converter

Build the upload folder with `node extensions/model-optimiser/make-upload-folder.mjs --edition converter`.
The art in this folder was rendered from the real panel (`../editions-art.html` lays it out).

## Store listing tab

**Name** (from the manifest, 55/75 characters)
3D Model Converter – FBX, GLB, OBJ & glTF by AssetBench

**Summary** (from the manifest, 122/132)
Convert FBX, GLB, OBJ and glTF, split models into parts, merge them and make LODs. Free file info, 10 free runs, then 99p.

**Category:** Developer Tools  
**Language:** English (United Kingdom)

**Description**

> FBX, GLB, OBJ or glTF: convert, split and merge 3D models in Chrome's side panel, without opening Blender.
>
> HOW IT WORKS
> 1. Click the 3D Converter icon. The panel opens on the right.
> 2. Drop in a model (FBX, GLB, OBJ, glTF, or a ZIP with its textures). You get the free file info straight away.
> 3. Pick Convert, Split, Merge or LODs, then download.
>
> WHAT YOU GET
> • Free file info: format, triangles, meshes, materials, textures, animations and skins, and what it can be converted to
> • Convert: GLB, glTF (ZIP), OBJ (ZIP) or FBX. Textures and animation come along where the format allows. Rescale centimetres to metres in the same step
> • Split: one GLB per object, mesh or material, in one ZIP. Parts stay where they were; skinned meshes keep their rig
> • Merge: combine models (mix FBX, OBJ and GLB) into one GLB, side by side or where they are
> • LODs: LOD0 plus lighter copies at 50, 25 and 10% of the triangles, in one ZIP
>
> PRIVATE BY DESIGN
> Your models are processed on your own computer. Nothing is uploaded. It works offline once unlocked.
>
> PRICE
> File info is free. Convert, Split, Merge and LODs give you 10 free runs between them. After that, one 99p payment unlocks all four for good, no subscription. Already have AssetBench All Access? Your key unlocks everything.
>
> GOOD FOR
> Game developers, 3D artists and web developers moving models between Blender, Unity, Unreal, Godot, Roblox and three.js.
>
> We made these tools for game devs. Enjoy! More at https://www.assetbench.co.uk

**Graphics** (in this folder)

| Slot | File |
|---|---|
| Store icon 128×128 | `../../public/icons/icon-128.png` |
| Screenshot 1 | `screenshot-1.png` (free file info) |
| Screenshot 2 | `screenshot-2.png` (split by material) |
| Screenshot 3 | `screenshot-3.png` (LOD chain) |
| Small promo tile 440×280 | `promo-tile-440x280.png` |
| Marquee 1400×560 | `marquee-1400x560.png` |

**Website:** https://www.assetbench.co.uk/convert-files  
**Support:** https://www.assetbench.co.uk/contact

## Privacy practices tab

**Single purpose**
Convert 3D model files between GLB, glTF, OBJ and FBX, split models into parts, merge models, and make level-of-detail copies.

**Permission justifications**

- `sidePanel`: the tool's interface is a side panel, so it stays open while the user picks a file.
- `storage`: remembers the user's licence key, last settings and how many free runs they've used, on their computer (the count also goes in the browser's own sync storage, so a reinstall doesn't reset it).
- `downloads`: saves the file the tool makes (and only that) to the user's Downloads folder.
- Host `api.lemonsqueezy.com`: checks the licence key the user enters with our payment provider.
- Host `www.assetbench.co.uk`: links a 99p key to the tool it was bought for (same as our website).

**Remote code:** No. All code ships in the package. WebAssembly (meshoptimizer and the Draco decoder, used to read and write compressed models) is bundled, which is why the CSP has `wasm-unsafe-eval`.

**Data usage:** tick **Authentication information** only (the licence key the user types, sent to Lemon Squeezy and assetbench.co.uk to check it). Tick all three certifications: not sold, not used for unrelated purposes, not used for creditworthiness or lending.

The 3D models never leave the computer, so no "website content" or "user activity" is collected.

**Privacy policy URL:** https://www.assetbench.co.uk/privacy (it has a "Browser extension" section).

## Distribution tab

Payments: **Contains in-app purchases** (the 99p and All Access unlock buttons; checkout is on Lemon Squeezy, and installing is free). Visibility: Public. Regions: All regions.
