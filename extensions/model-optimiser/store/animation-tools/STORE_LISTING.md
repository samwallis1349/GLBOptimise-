# Chrome Web Store listing: Animation Tools

Build the upload folder with `node extensions/model-optimiser/make-upload-folder.mjs --edition animation-tools`.
The art in this folder was rendered from the real panel (`../editions-art.html` lays it out).

## Store listing tab

**Name** (from the manifest, 64/75 characters)
GLB & FBX Animation Tools – Strip & Optimise Clips by AssetBench

**Summary** (from the manifest, 127/132)
List, strip and optimise animation clips in GLB, glTF and FBX models. Free clip list, 10 free runs, then 99p. Nothing uploaded.

**Category:** Developer Tools  
**Language:** English (United Kingdom)

**Description**

> Ship only the animation you need. Animation Tools lists, strips and optimises the clips in your 3D models, right in Chrome's side panel.
>
> HOW IT WORKS
> 1. Click the Animation Tools icon. The panel opens on the right.
> 2. Drop in a GLB, glTF or FBX (a Mixamo download works). You get the free clip list straight away.
> 3. Open Strip or Optimise, then download the new GLB.
>
> WHAT YOU GET
> • Free clip list: every clip with its length, tracks and keyframes, plus the bones and skins in the model
> • Strip: untick the clips you don't need. They go, along with data only they used. The rig stays exactly as it was
> • Optimise: removes keyframes the motion doesn't need, checked against the curve it replaces (Lossless, Balanced or Aggressive), and can resample to 60, 30 or 24 fps
> • FBX files are converted to GLB on the way in, so you can take a Mixamo FBX straight to a web-ready GLB
>
> PRIVATE BY DESIGN
> Your models are processed on your own computer. Nothing is uploaded. It works offline once unlocked.
>
> PRICE
> The clip list is free. Strip and Optimise give you 10 free runs between them. After that, one 99p payment unlocks both for good, no subscription. Already have AssetBench All Access? Your key unlocks everything.
>
> GOOD FOR
> Game developers, three.js and web 3D developers, and anyone shipping animated characters to Unity, Unreal, Godot or the web.
>
> We made these tools for game devs. Enjoy! More at https://www.assetbench.co.uk

**Graphics** (in this folder)

| Slot | File |
|---|---|
| Store icon 128×128 | `../../public/icons/icon-128.png` |
| Screenshot 1 | `screenshot-1.png` (free clip list) |
| Screenshot 2 | `screenshot-2.png` (strip clips) |
| Screenshot 3 | `screenshot-3.png` (optimise keyframes) |
| Small promo tile 440×280 | `promo-tile-440x280.png` |
| Marquee 1400×560 | `marquee-1400x560.png` |

**Website:** https://www.assetbench.co.uk/strip-animations  
**Support:** https://www.assetbench.co.uk/contact

## Privacy practices tab

**Single purpose**
Edit the animation clips in 3D models: list them, remove unwanted clips, and remove keyframes the motion does not need.

**Permission justifications**

- `sidePanel`: the tool's interface is a side panel, so it stays open while the user picks a file.
- `storage`: remembers the user's licence key, last settings and how many free runs they've used, on their computer (the count also goes in the browser's own sync storage, so a reinstall doesn't reset it).
- `downloads`: saves the file the tool makes (and only that) to the user's Downloads folder.
- Host `api.lemonsqueezy.com`: checks the licence key the user enters with our payment provider.
- Host `www.assetbench.co.uk`: links a 99p key to the tool it was bought for (same as our website).

**Remote code:** No. All code ships in the package. WebAssembly (meshoptimizer and the Draco decoder, used to read compressed models) is bundled, which is why the CSP has `wasm-unsafe-eval`.

**Data usage:** tick **Authentication information** only (the licence key the user types, sent to Lemon Squeezy and assetbench.co.uk to check it). Tick all three certifications: not sold, not used for unrelated purposes, not used for creditworthiness or lending.

The 3D models never leave the computer, so no "website content" or "user activity" is collected.

**Privacy policy URL:** https://www.assetbench.co.uk/privacy (it has a "Browser extension" section).

## Distribution tab

Payments: **Contains in-app purchases** (the 99p and All Access unlock buttons; checkout is on Lemon Squeezy, and installing is free). Visibility: Public. Regions: All regions.
