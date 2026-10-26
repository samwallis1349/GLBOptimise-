/**
 * App Icon & Store Assets edition: check a master icon (free), build iOS /
 * Android / watchOS icon sets, Xcode image sets (@1x @2x @3x) and store
 * screenshots. Uses the Cloud API's icon and screenshot builders.
 */
import JSZip from 'jszip';
import { buildIconPack } from '../../../../worker/api/icons.js';
import { buildScreenshots, SCREENSHOT_SIZES } from '../../../../worker/api/screenshots.js';
import { encodeImage, hasAlpha, resize } from '../../../../worker/api/images.js';
import { readImage, stem } from '../inputs.js';

/** Is this a good master icon? Size, square, transparency, padding. */
export async function iconCheck(bytes) {
  const img = await readImage(bytes);
  const { width, height, data } = img;
  const alpha = hasAlpha(img);
  // Opaque content bounds: how much of the canvas the artwork fills.
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const fill = maxX < 0 ? 0 : ((maxX - minX + 1) * (maxY - minY + 1)) / (width * height);
  const checks = [];
  const add = (level, text) => checks.push({ level, text });
  if (Math.min(width, height) >= 1024) add('ok', `${width}×${height}: big enough for the 1024 px store icons.`);
  else if (Math.min(width, height) >= 512) add('warn', `${width}×${height}: works, but the 1024 px store icons will be upscaled. Use 1024×1024.`);
  else add('error', `${width}×${height}: too small. Icons need at least 512×512 (1024×1024 recommended).`);
  if (width === height) add('ok', 'Square.');
  else add('warn', `Not square (${width}×${height}); it will be centre-cropped.`);
  if (alpha) add('warn', 'Has transparency: iOS icons are flattened onto a background colour; Android keeps it.');
  else add('ok', 'Opaque: ready for iOS as it is.');
  if (alpha && fill < 0.55) add('warn', `The artwork fills only ${Math.round(fill * 100)}% of the canvas; it may look small on the home screen.`);
  return { report: { width, height, transparent: alpha, fill: Math.round(fill * 100), format: img.mime.replace('image/', '').toUpperCase(), checks, warnings: [] } };
}

/** iOS, Android and watchOS icon sets in one ZIP. */
export async function icons(bytes, { platforms = 'ios,android', background = '#FFFFFF' }, name) {
  const { output, report } = await buildIconPack(bytes, { platforms, background });
  return { output, name: `${stem(name)}-icons.zip`, report: { platforms: report.platforms, files: report.fileCount, background: report.background, warnings: report.warnings } };
}

/**
 * Xcode image sets: each image becomes <name>.imageset with @1x, @2x and
 * @3x PNGs (the image is treated as @3x) and a Contents.json, inside
 * Assets.xcassets.
 */
export async function xcassets(bytes, { others = [] }, name) {
  const inputs = [{ name, bytes }, ...others];
  if (inputs.length > 50) throw new Error('Up to 50 images at a time.');
  const zip = new JSZip();
  const root = zip.folder('Assets.xcassets');
  root.file('Contents.json', JSON.stringify({ info: { author: 'assetbench', version: 1 } }, null, 2));
  const sets = [];
  const warnings = [];
  const used = new Set();
  for (const input of inputs) {
    const img = await readImage(input.bytes);
    let id = stem(String(input.name).replace(/@[123]x(?=\.[^.]+$)/i, ''));
    while (used.has(id)) id += '_';
    used.add(id);
    const set = root.folder(`${id}.imageset`);
    const images = [];
    for (const scale of [1, 2, 3]) {
      const w = Math.max(1, Math.round((img.width * scale) / 3));
      const h = Math.max(1, Math.round((img.height * scale) / 3));
      const file = `${id}${scale === 1 ? '' : `@${scale}x`}.png`;
      set.file(file, encodeImage(scale === 3 ? img : resize(img, w, h), 'image/png'));
      images.push({ idiom: 'universal', filename: file, scale: `${scale}x` });
    }
    set.file('Contents.json', JSON.stringify({ images, info: { author: 'assetbench', version: 1 } }, null, 2));
    if (img.width % 3 || img.height % 3) warnings.push(`${input.name}: ${img.width}×${img.height} isn't divisible by 3, so @1x and @2x are rounded.`);
    sets.push({ name: id, size3x: `${img.width}×${img.height}`, size1x: `${Math.round(img.width / 3)}×${Math.round(img.height / 3)}` });
  }
  const output = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { output, name: `${inputs.length === 1 ? sets[0].name : 'Assets'}-xcassets.zip`, report: { sets, warnings } };
}

/** Store screenshots for each chosen device, cropped (cover) or letterboxed (contain). */
export async function screenshots(bytes, { others = [], devices = 'iphone-6.9,iphone-6.5,android-phone', fit = 'cover', background = '#000000' }, name) {
  const inputs = [{ bytes, filename: name }, ...others.map((o) => ({ bytes: o.bytes, filename: o.name }))];
  for (const i of inputs) await readImage(i.bytes); // friendly error before the builder's
  const { output, report } = await buildScreenshots(inputs, { devices, fit, background, format: 'png' });
  return {
    output,
    name: `${stem(name)}-screenshots.zip`,
    report: { devices: report.devices.map((d) => `${SCREENSHOT_SIZES[d.id].name} ${d.width}×${d.height}`), files: report.files.length, fit, warnings: report.warnings.map((w) => w.replace('Use fit=contain to keep everything.', 'Choose “Fit (add bars)” to keep everything.')) },
  };
}
