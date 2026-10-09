import JSZip from 'jszip';
import { ApiError } from './http.js';
import { decodeImage, encodeImage, flatten, parseHexColour, resize } from './images.js';

/**
 * Store screenshot sets: every input screenshot resized for each requested
 * device size, portrait or landscape to match the input. App Store Connect
 * rejects transparency, so output is always opaque. Sizes match the site's
 * App Store Screenshot Generator for 6.9" / 6.5" plus the other slots stores ask for.
 */

export const SCREENSHOT_SIZES = {
  'iphone-6.9': { name: 'iPhone 6.9"', width: 1320, height: 2868, store: 'App Store' },
  'iphone-6.5': { name: 'iPhone 6.5"', width: 1242, height: 2688, store: 'App Store' },
  'iphone-5.5': { name: 'iPhone 5.5"', width: 1242, height: 2208, store: 'App Store' },
  'ipad-13': { name: 'iPad 13"', width: 2064, height: 2752, store: 'App Store' },
  'ipad-12.9': { name: 'iPad 12.9"', width: 2048, height: 2732, store: 'App Store' },
  'android-phone': { name: 'Android phone', width: 1080, height: 1920, store: 'Google Play' },
  'android-tablet': { name: 'Android tablet', width: 1600, height: 2560, store: 'Google Play' },
};

const MAX_INPUTS = 10; // App Store Connect allows 10 screenshots per device size
const MAX_OUTPUTS = 40;

function cover(image, w, h) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = Math.round(w / scale);
  const sh = Math.round(h / scale);
  const ox = Math.floor((image.width - sw) / 2);
  const oy = Math.floor((image.height - sh) / 2);
  const crop = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y += 1) crop.set(image.data.subarray(((y + oy) * image.width + ox) * 4, ((y + oy) * image.width + ox + sw) * 4), y * sw * 4);
  return resize({ width: sw, height: sh, data: crop }, w, h);
}

function contain(image, w, h, bg) {
  const scale = Math.min(w / image.width, h / image.height);
  const iw = Math.max(1, Math.round(image.width * scale));
  const ih = Math.max(1, Math.round(image.height * scale));
  const inner = flatten(resize(image, iw, ih), bg);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = bg[0]; out[i + 1] = bg[1]; out[i + 2] = bg[2]; out[i + 3] = 255; }
  const ox = Math.floor((w - iw) / 2);
  const oy = Math.floor((h - ih) / 2);
  for (let y = 0; y < ih; y += 1) out.set(inner.data.subarray(y * iw * 4, (y + 1) * iw * 4), ((y + oy) * w + ox) * 4);
  return { width: w, height: h, data: out };
}

export function parseDevices(value) {
  const list = String(value || 'iphone-6.9,iphone-6.5,ipad-13').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((d) => !SCREENSHOT_SIZES[d]);
  if (!list.length || bad.length) throw new ApiError(400, 'invalid_devices', `devices must be a comma-separated list of: ${Object.keys(SCREENSHOT_SIZES).join(', ')}.`);
  return [...new Set(list)];
}

/** @param {{bytes: Uint8Array, filename: string}[]} inputs */
export async function buildScreenshots(inputs, params) {
  if (!inputs.length) throw new ApiError(400, 'missing_file', 'Send at least one screenshot.');
  if (inputs.length > MAX_INPUTS) throw new ApiError(400, 'too_many_screenshots', `Send at most ${MAX_INPUTS} screenshots per request (the App Store limit per device).`);
  const devices = parseDevices(params.devices);
  if (inputs.length * devices.length > MAX_OUTPUTS) throw new ApiError(400, 'too_many_outputs', `${inputs.length} screenshots x ${devices.length} devices is over the ${MAX_OUTPUTS}-image limit per request; split it into smaller requests.`);
  const fit = String(params.fit || 'cover').toLowerCase();
  if (!['cover', 'contain'].includes(fit)) throw new ApiError(400, 'invalid_fit', 'fit must be cover (crop to fill) or contain (letterbox).');
  const format = String(params.format || 'jpeg').toLowerCase().replace('jpg', 'jpeg');
  if (!['png', 'jpeg'].includes(format)) throw new ApiError(400, 'invalid_format', 'format must be png or jpeg.');
  const bg = parseHexColour(params.background, [0, 0, 0]);
  const zip = new JSZip();
  const files = [];
  const warnings = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const image = flatten(decodeImage(inputs[i].bytes), bg);
    const landscape = image.width > image.height;
    const base = `${String(i + 1).padStart(2, '0')}_${String(inputs[i].filename || 'screenshot').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 40)}`;
    for (const id of devices) {
      const size = SCREENSHOT_SIZES[id];
      const [w, h] = landscape ? [size.height, size.width] : [size.width, size.height];
      const srcAspect = image.width / image.height;
      const drift = Math.abs(srcAspect - w / h) / (w / h);
      if (fit === 'cover' && drift > 0.12) warnings.push(`${base} → ${size.name}: aspect ratios differ by ${Math.round(drift * 100)}%, so cover crops noticeably. Use fit=contain to keep everything.`);
      const out = fit === 'cover' ? cover(image, w, h) : contain(image, w, h, bg);
      const path = `${id}/${base}.${format === 'png' ? 'png' : 'jpg'}`;
      zip.file(path, encodeImage(out, `image/${format}`, { quality: 92 }));
      files.push({ path, width: w, height: h, store: size.store });
    }
  }
  const report = { devices: devices.map((d) => ({ id: d, ...SCREENSHOT_SIZES[d] })), fit, format, files, warnings };
  zip.file('report.json', JSON.stringify(report, null, 2));
  return { output: await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }), report };
}
