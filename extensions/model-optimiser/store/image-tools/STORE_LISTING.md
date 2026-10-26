# Chrome Web Store listing: Sprite Studio

Build the upload folder with `node extensions/model-optimiser/make-upload-folder.mjs --edition image-tools`.
The art in this folder was rendered from the real panel (`../editions-art.html` lays it out).

## Store listing tab

**Name** (from the manifest, 51/75 characters)
Sprite Cutout, Line Art & Iso Sprites by AssetBench

**Summary** (from the manifest, 128/132)
Remove backgrounds and split sprite sheets, clean line art to PNG + SVG, and turn 3D models into iso sprites. 10 free, then 99p.

**Category:** Developer Tools  
**Language:** English (United Kingdom)

**Description**

> Game-ready 2D art in Chrome's side panel: cut out sprites, clean line art and turn 3D models into isometric sprites.
>
> HOW IT WORKS
> 1. Click the Sprite Studio icon. The panel opens on the right.
> 2. Drop in an image (PNG, JPEG, WebP) or a 3D model (GLB, FBX, OBJ).
> 3. Pick Cutout, Line art or Iso, then download.
>
> WHAT YOU GET
> • Free check: image size, the background colour and how many separate sprites it holds
> • Cutout: removes the background (it finds the colour itself) and saves each sprite as its own PNG, plus a JSON map of where each came from
> • Line art: white removed, every line redrawn at one even weight with small breaks joined, saved as a transparent PNG and a traced SVG
> • Iso: a 3D model as a 2:1 isometric sprite sheet + JSON, in 8, 4 or 1 directions, with animation frames and a clean, soft or pixel-art style
>
> PRIVATE BY DESIGN
> Your files are processed on your own computer. Nothing is uploaded. It works offline once unlocked.
>
> PRICE
> The check is free. Cutout, Line art and Iso give you 10 free runs between them. After that, one 99p payment unlocks all three for good, no subscription. Already have AssetBench All Access? Your key unlocks everything.
>
> GOOD FOR
> 2D and isometric game developers, pixel artists and anyone turning artwork or 3D models into sprites.
>
> We made these tools for game devs. Enjoy! More at https://www.assetbench.co.uk

**Graphics** (in this folder)

| Slot | File |
|---|---|
| Store icon 128×128 | `../../public/icons/icon-128.png` |
| Screenshot 1 | `screenshot-1.png` (sprite cutout) |
| Screenshot 2 | `screenshot-2.png` (line art clean-up) |
| Screenshot 3 | `screenshot-3.png` (iso sprites from a 3D model) |
| Small promo tile 440×280 | `promo-tile-440x280.png` |
| Marquee 1400×560 | `marquee-1400x560.png` |

**Website:** https://www.assetbench.co.uk/alpha-cutout  
**Support:** https://www.assetbench.co.uk/contact

## Privacy practices tab

**Single purpose**
Prepare 2D game art: remove image backgrounds and split sprite sheets, clean line art to PNG and SVG, and render 3D models as isometric sprite sheets.

**Permission justifications**

- `sidePanel`: the tool's interface is a side panel, so it stays open while the user picks a file.
- `storage`: remembers the user's licence key, last settings and how many free runs they've used, on their computer (the count also goes in the browser's own sync storage, so a reinstall doesn't reset it).
- `downloads`: saves the file the tool makes (and only that) to the user's Downloads folder.
- Host `api.lemonsqueezy.com`: checks the licence key the user enters with our payment provider.
- Host `www.assetbench.co.uk`: links a 99p key to the tool it was bought for (same as our website).

**Remote code:** No. All code ships in the package. WebAssembly (meshoptimizer and the Draco decoder, used to read compressed 3D models) is bundled, which is why the CSP has `wasm-unsafe-eval`.

**Data usage:** tick **Authentication information** only (the licence key the user types, sent to Lemon Squeezy and assetbench.co.uk to check it). Tick all three certifications: not sold, not used for unrelated purposes, not used for creditworthiness or lending.

The images and 3D models never leave the computer, so no "website content" or "user activity" is collected.

**Privacy policy URL:** https://www.assetbench.co.uk/privacy (it has a "Browser extension" section).

## Distribution tab

Payments: **Contains in-app purchases** (the 99p and All Access unlock buttons; checkout is on Lemon Squeezy, and installing is free). Visibility: Public. Regions: All regions.
