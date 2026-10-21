# Chrome Web Store listing: GLB Inspector

Build the upload folder with `node extensions/model-optimiser/make-upload-folder.mjs --edition inspector`.
Re-render the art with `node extensions/model-optimiser/store/inspector/render.mjs`.

## Store listing tab

**Name** (from the manifest, 60/75 characters)
GLB Inspector – Rig, Animation & Model Checker by AssetBench

**Summary** (from the manifest, 124/132)
Inspect GLB models in your browser: free health check, rig and animation checks, and before/after compare. Files stay local.

**Category:** Developer Tools  
**Language:** English (United Kingdom)

**Description**

> Is this model ready for your game? GLB Inspector tells you in seconds, right in Chrome's side panel.
>
> HOW IT WORKS
> 1. Click the GLB Inspector icon. The panel opens on the right.
> 2. Drop in a .glb. You get a free health check straight away.
> 3. Open the Rig, Anims or Compare tab for a deeper look.
>
> WHAT YOU GET
> • Free health check: a score out of 100, triangles, draw calls, materials, textures, animations, joints, file size and GPU memory, plus a list of anything that needs fixing
> • Rig: joint count, hierarchy depth and root, unweighted vertices, weights that don't add up to 1, duplicate joint names and broken hierarchies
> • Animations: every clip with its length and frame rate, loops that pop on the last frame, root motion, and keyframes that never change and could be cut
> • Compare: drop in two versions of a model (say, before and after optimising) and see what got smaller, what changed, and whether any animations or materials were lost
>
> PRIVATE BY DESIGN
> Your models are checked on your own computer. Nothing is uploaded. It works offline once unlocked.
>
> PRICE
> The health check is free. Rig, Anims and Compare give you 10 free runs between them. After that, one 99p payment unlocks all three for good, no subscription. Already have AssetBench All Access? Your key unlocks everything.
>
> GOOD FOR
> Game developers, 3D artists and anyone checking models before they go into Unity, Unreal, Godot, Roblox or the web.
>
> We made these tools for game devs. Enjoy! More at https://www.assetbench.co.uk

**Graphics** (in this folder)

| Slot | File |
|---|---|
| Store icon 128×128 | `../../public/icons/icon-128.png` |
| Screenshot 1 | `screenshot-1.png` (compare) |
| Screenshot 2 | `screenshot-2.png` (free health check) |
| Screenshot 3 | `screenshot-3.png` (rig and animations) |
| Small promo tile 440×280 | `promo-tile-440x280.png` |
| Marquee 1400×560 | `marquee-1400x560.png` |

**Website:** https://www.assetbench.co.uk/inspect-glb  
**Support:** https://www.assetbench.co.uk/contact

## Privacy practices tab

**Single purpose**
Inspect GLB 3D models: a health check of the model, its rig and its animations, and a comparison of two versions of a model.

**Permission justifications**

- `sidePanel`: the tool's interface is a side panel, so it stays open while the user picks a file.
- `storage`: remembers the user's licence key, last settings and how many free runs they've used, on their computer (the count also goes in the browser's own sync storage, so a reinstall doesn't reset it).
- Host `api.lemonsqueezy.com`: checks the licence key the user enters with our payment provider.
- Host `www.assetbench.co.uk`: links a 99p key to the tool it was bought for (same as our website).

**Remote code:** No. All code ships in the package. WebAssembly (meshoptimizer, used to read compressed models) is bundled, which is why the CSP has `wasm-unsafe-eval`.

**Data usage:** tick **Authentication information** only (the licence key the user types, sent to Lemon Squeezy and assetbench.co.uk to check it). Tick all three certifications: not sold, not used for unrelated purposes, not used for creditworthiness or lending.

The 3D models never leave the computer, so no "website content" or "user activity" is collected.

**Privacy policy URL:** https://www.assetbench.co.uk/privacy (it has a "Browser extension" section).

## Distribution tab

Payments: **Contains in-app purchases** (the 99p and All Access unlock buttons; checkout is on Lemon Squeezy, and installing is free). Visibility: Public. Regions: All regions.
