import JSZip from 'jszip';
import { ApiError } from './http.js';
import { circleMask, cropSquare, decodeImage, encodeImage, flatten, hasAlpha, pad, parseHexColour, resize } from './images.js';

/**
 * App icon packs from one square master image. The iOS/watchOS tables and
 * Android mipmap sizes match the site's App Icon Generator
 * (public/tools/app-icon-generator/index.html); Android adaptive icons
 * (API 26+) are added on top.
 */

const IOS = [
  ['20x20', 'iphone', '2x'], ['20x20', 'iphone', '3x'], ['29x29', 'iphone', '2x'], ['29x29', 'iphone', '3x'],
  ['40x40', 'iphone', '2x'], ['40x40', 'iphone', '3x'], ['60x60', 'iphone', '2x'], ['60x60', 'iphone', '3x'],
  ['20x20', 'ipad', '1x'], ['20x20', 'ipad', '2x'], ['29x29', 'ipad', '1x'], ['29x29', 'ipad', '2x'],
  ['40x40', 'ipad', '1x'], ['40x40', 'ipad', '2x'], ['76x76', 'ipad', '1x'], ['76x76', 'ipad', '2x'],
  ['83.5x83.5', 'ipad', '2x'], ['1024x1024', 'ios-marketing', '1x'],
].map(([size, idiom, scale]) => ({ size, idiom, scale, filename: `icon-${idiom === 'ios-marketing' ? 'marketing' : idiom}-${size.split('x')[0]}@${scale}.png` }));

const WATCH = [
  { size: '24x24', role: 'notificationCenter', subtype: '38mm', scale: '2x' },
  { size: '27.5x27.5', role: 'notificationCenter', subtype: '42mm', scale: '2x' },
  { size: '29x29', role: 'companionSettings', scale: '2x' },
  { size: '29x29', role: 'companionSettings', scale: '3x' },
  { size: '40x40', role: 'appLauncher', subtype: '38mm', scale: '2x' },
  { size: '44x44', role: 'appLauncher', subtype: '40mm', scale: '2x' },
  { size: '86x86', role: 'quickLook', subtype: '38mm', scale: '2x' },
  { size: '98x98', role: 'quickLook', subtype: '42mm', scale: '2x' },
  { size: '108x108', role: 'quickLook', subtype: '44mm', scale: '2x' },
  { size: '1024x1024', idiom: 'watch-marketing', scale: '1x' },
].map((e) => ({ idiom: 'watch', ...e, filename: `icon-watch-${e.size.split('x')[0]}@${e.scale}.png` }));

const ANDROID_DENSITIES = [['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]];

const pixels = ({ size, scale }) => Math.round(parseFloat(size) * parseFloat(scale));

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;

const README = `AssetBench Cloud app icon pack

ios/AppIcon.appiconset      Drag into Assets.xcassets in Xcode (replace the existing AppIcon).
watchos/AppIcon.appiconset  Drag into your watch app's Assets.xcassets.
android/res/                Merge into app/src/main/res/. Adaptive icons (Android 8+) use
                            mipmap-anydpi-v26 plus ic_launcher_foreground and the colour in
                            values/ic_launcher_background.xml; older devices use ic_launcher.png.
android/playstore-512.png   Upload as the Google Play store listing icon.
report.json                 What was generated and any warnings.
`;

export const PLATFORMS = ['ios', 'android', 'watchos'];

export function parsePlatforms(value) {
  const list = String(value || 'ios,android').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((p) => !PLATFORMS.includes(p));
  if (!list.length || bad.length) throw new ApiError(400, 'invalid_platforms', `platforms must be a comma-separated list of ${PLATFORMS.join(', ')}.`);
  return [...new Set(list)];
}

export async function buildIconPack(bytes, params) {
  const platforms = parsePlatforms(params.platforms);
  const background = parseHexColour(params.background, [255, 255, 255]);
  const backgroundHex = `#${background.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  const adaptiveScale = params.adaptiveScale ? Number(params.adaptiveScale) : 0.667;
  if (!(adaptiveScale >= 0.4 && adaptiveScale <= 1)) throw new ApiError(400, 'invalid_adaptive_scale', 'adaptiveScale must be between 0.4 and 1.');

  const warnings = [];
  let master = decodeImage(bytes);
  if (Math.min(master.width, master.height) < 512) throw new ApiError(422, 'image_too_small', `The master icon is ${master.width}x${master.height}; it must be at least 512x512 (1024x1024 recommended).`);
  if (master.width !== master.height) {
    warnings.push(`The image was ${master.width}x${master.height}; it was centre-cropped to a square.`);
    master = cropSquare(master);
  }
  if (master.width < 1024) warnings.push(`The master is ${master.width}px; the 1024px store icons are upscaled and may look soft.`);
  const transparent = hasAlpha(master);

  // Small sizes resample from a 512px intermediate: same area filter, a fraction of the work.
  let mid = null;
  const scaled = (size) => {
    if (size > 256 || master.width <= 512) return resize(master, size, size);
    mid = mid || resize(master, 512, 512);
    return resize(mid, size, size);
  };
  const cache = new Map();
  const png = (size, { opaque = false } = {}) => {
    const key = `${size}|${opaque}`;
    if (!cache.has(key)) {
      const img = scaled(size);
      cache.set(key, encodeImage(opaque ? flatten(img, background) : img, 'image/png'));
    }
    return cache.get(key);
  };

  const zip = new JSZip();
  const files = [];
  const add = (path, data) => { zip.file(path, data); files.push(path); };

  if (platforms.includes('ios')) {
    // Apple rejects icons with an alpha channel, so iOS icons are flattened onto `background`.
    if (transparent) warnings.push(`iOS icons cannot be transparent; they were flattened onto ${backgroundHex}.`);
    for (const e of IOS) add(`ios/AppIcon.appiconset/${e.filename}`, png(pixels(e), { opaque: true }));
    add('ios/AppIcon.appiconset/Contents.json', JSON.stringify({ images: IOS.map(({ size, idiom, scale, filename }) => ({ size, idiom, filename, scale })), info: { author: 'assetbench', version: 1 } }, null, 2));
  }
  if (platforms.includes('watchos')) {
    for (const e of WATCH) add(`watchos/AppIcon.appiconset/${e.filename}`, png(pixels(e), { opaque: true }));
    add('watchos/AppIcon.appiconset/Contents.json', JSON.stringify({ images: WATCH, info: { author: 'assetbench', version: 1 } }, null, 2));
  }
  if (platforms.includes('android')) {
    add('android/playstore-512.png', png(512, { opaque: true }));
    for (const [density, legacy, adaptive] of ANDROID_DENSITIES) {
      const dir = `android/res/mipmap-${density}`;
      add(`${dir}/ic_launcher.png`, png(legacy));
      add(`${dir}/ic_launcher_round.png`, encodeImage(circleMask(scaled(legacy)), 'image/png'));
      const inner = Math.round(adaptive * adaptiveScale);
      add(`${dir}/ic_launcher_foreground.png`, encodeImage(pad(scaled(inner), adaptive), 'image/png'));
    }
    add('android/res/mipmap-anydpi-v26/ic_launcher.xml', ADAPTIVE_XML);
    add('android/res/mipmap-anydpi-v26/ic_launcher_round.xml', ADAPTIVE_XML);
    add('android/res/values/ic_launcher_background.xml', `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${backgroundHex}</color>\n</resources>\n`);
  }

  const report = { platforms, master: { width: master.width, height: master.height, transparent }, background: backgroundHex, adaptiveScale, fileCount: files.length, files, warnings };
  add('README.txt', README);
  zip.file('report.json', JSON.stringify(report, null, 2));
  const output = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { output, report };
}
