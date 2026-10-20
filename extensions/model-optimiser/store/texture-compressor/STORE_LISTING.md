# Chrome Web Store listing: GLB Texture Compressor

Build the upload folder with `node extensions/model-optimiser/make-upload-folder.mjs --edition texture-compressor`.

## Store listing tab

**Name** (from the manifest, 52/75 characters)
GLB Texture Compressor – KTX2 & Resize by AssetBench

**Summary** (from the manifest, 122/132)
Shrink the textures in GLB models: free texture check, KTX2 compression and resizing. 5 free a day. Files stay on your PC.

**Category:** Developer Tools  
**Language:** English (United Kingdom)

**Description**

> Textures are usually what makes a 3D model heavy. GLB Texture Compressor shows you which ones, then shrinks them, right in Chrome's side panel.
>
> HOW IT WORKS
> 1. Click the Texture Compressor icon. The panel opens on the right.
> 2. Drop in a .glb. Every texture is listed straight away with its size, format and GPU memory.
> 3. Compress them to KTX2, or resize them to 2048, 1024, 512 or 256 px.
> 4. Download the lighter model.
>
> WHAT YOU GET
> • Free texture check: every texture's size, format and GPU memory, and the model's total
> • KTX2 compression (Basis Universal): GPU-compressed textures that use a fraction of the memory, with normal maps handled carefully
> • Resize: shrinks oversized textures to a power of two and keeps their format, so PNG stays PNG and JPEG stays JPEG
>
> PRIVATE BY DESIGN
> Your models are processed on your own computer. Nothing is uploaded. It works offline once unlocked.
>
> PRICE
> The texture check is free, and you get 5 free compress or resize runs every day. Unlimited is a 99p one-off unlock per tool, no subscription. Already have AssetBench All Access? Your key unlocks everything.
>
> GOOD FOR
> Getting 3D models under the memory limits of phones, VR headsets and the web.
>
> We made these tools for game devs. Enjoy! More at https://www.assetbench.co.uk

**Graphics** (in this folder, still to make)

| Slot | File |
|---|---|
| Store icon 128×128 | `../../public/icons/icon-128.png` |
| Screenshot 1 | `screenshot-1.png` (texture check) |
| Screenshot 2 | `screenshot-2.png` (compress result) |
| Screenshot 3 | `screenshot-3.png` (resize result) |
| Small promo tile 440×280 | `promo-tile-440x280.png` |
| Marquee 1400×560 | `marquee-1400x560.png` |

**Website:** https://www.assetbench.co.uk/compress-textures  
**Support:** https://www.assetbench.co.uk/contact

## Privacy practices tab

**Single purpose**
Reduce the size and memory use of the textures inside GLB 3D models, with a free check of what each texture costs.

**Permission justifications**

- `sidePanel`: the tool's interface is a side panel, so it stays open while the user picks a file.
- `storage`: remembers the user's licence key, last settings and how many of today's free runs they've used, on their computer.
- `downloads`: saves the processed .glb to the user's Downloads folder.
- Host `api.lemonsqueezy.com`: checks the licence key the user enters with our payment provider.
- Host `www.assetbench.co.uk`: links a 99p key to the tool it was bought for (same as our website).

**Remote code:** No. All code ships in the package. WebAssembly (the Basis Universal KTX2 encoder) is bundled, which is why the CSP has `wasm-unsafe-eval`.

**Data usage:** tick **Authentication information** only (the licence key the user types, sent to Lemon Squeezy and assetbench.co.uk to check it). Tick all three certifications: not sold, not used for unrelated purposes, not used for creditworthiness or lending.

The 3D models never leave the computer, so no "website content" or "user activity" is collected.

**Privacy policy URL:** https://www.assetbench.co.uk/privacy (it has a "Browser extension" section).

## Distribution tab

Payments: **Contains in-app purchases** (the 99p and All Access unlock buttons; checkout is on Lemon Squeezy, and installing is free). Visibility: Public. Regions: All regions.
