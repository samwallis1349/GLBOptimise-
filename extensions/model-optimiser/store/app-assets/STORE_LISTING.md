# Chrome Web Store listing: App Assets

Build the upload folder with `node extensions/model-optimiser/make-upload-folder.mjs --edition app-assets`.
The art in this folder was rendered from the real panel (`../editions-art.html` lays it out).

## Store listing tab

**Name** (from the manifest, 58/75 characters)
App Icon & Store Asset Maker – iOS & Android by AssetBench

**Summary** (from the manifest, 119/132)
Make iOS, Android and watchOS app icons, Xcode image sets and store screenshots from one image. 10 free runs, then 99p.

**Category:** Developer Tools  
**Language:** English (United Kingdom)

**Description**

> One image in, every app icon and store screenshot out. App Assets makes them in Chrome's side panel.
>
> HOW IT WORKS
> 1. Click the App Assets icon. The panel opens on the right.
> 2. Drop in a PNG, JPEG or WebP. The free icon check tells you if it's ready.
> 3. Pick Icons, Xcode or Shots, then download the ZIP.
>
> WHAT YOU GET
> • Free icon check: size, square, transparency and how much of the canvas the artwork fills
> • Icons: iOS AppIcon.appiconset with Contents.json, Android mipmaps with an adaptive icon, and watchOS, from one 1024×1024 image (flattened onto your colour for Apple)
> • Xcode: each image becomes an image set with @1x, @2x and @3x and a Contents.json, ready to drop into Assets.xcassets
> • Shots: screenshots resized to the exact sizes App Store Connect and Google Play ask for (iPhone 6.9" and 6.5", iPad 13", Android), cropped to fill or fitted with bars
>
> PRIVATE BY DESIGN
> Your images are processed on your own computer. Nothing is uploaded. It works offline once unlocked.
>
> PRICE
> The icon check is free. Icons, Xcode and Shots give you 10 free runs between them. After that, one 99p payment unlocks all three for good, no subscription. Already have AssetBench All Access? Your key unlocks everything.
>
> GOOD FOR
> iOS and Android developers, indie game devs and designers getting an app ready for the stores.
>
> We made these tools for app and game devs. Enjoy! More at https://www.assetbench.co.uk

**Graphics** (in this folder)

| Slot | File |
|---|---|
| Store icon 128×128 | `../../public/icons/icon-128.png` |
| Screenshot 1 | `screenshot-1.png` (free icon check) |
| Screenshot 2 | `screenshot-2.png` (icon sets) |
| Screenshot 3 | `screenshot-3.png` (store screenshots) |
| Small promo tile 440×280 | `promo-tile-440x280.png` |
| Marquee 1400×560 | `marquee-1400x560.png` |

**Website:** https://www.assetbench.co.uk/app-icon-generator  
**Support:** https://www.assetbench.co.uk/contact

## Privacy practices tab

**Single purpose**
Make app icon sets, Xcode image sets and app store screenshots from images the user picks.

**Permission justifications**

- `sidePanel`: the tool's interface is a side panel, so it stays open while the user picks a file.
- `storage`: remembers the user's licence key, last settings and how many free runs they've used, on their computer (the count also goes in the browser's own sync storage, so a reinstall doesn't reset it).
- `downloads`: saves the file the tool makes (and only that) to the user's Downloads folder.
- Host `api.lemonsqueezy.com`: checks the licence key the user enters with our payment provider.
- Host `www.assetbench.co.uk`: links a 99p key to the tool it was bought for (same as our website).

**Remote code:** No. All code ships in the package. WebAssembly (the Draco mesh decoder every AssetBench extension ships) is bundled, which is why the CSP has `wasm-unsafe-eval`.

**Data usage:** tick **Authentication information** only (the licence key the user types, sent to Lemon Squeezy and assetbench.co.uk to check it). Tick all three certifications: not sold, not used for unrelated purposes, not used for creditworthiness or lending.

The images never leave the computer, so no "website content" or "user activity" is collected.

**Privacy policy URL:** https://www.assetbench.co.uk/privacy (it has a "Browser extension" section).

## Distribution tab

Payments: **Contains in-app purchases** (the 99p and All Access unlock buttons; checkout is on Lemon Squeezy, and installing is free). Visibility: Public. Regions: All regions.
