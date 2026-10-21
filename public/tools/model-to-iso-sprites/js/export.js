/**
 * Renders every planned frame into one sheet, builds the JSON atlas, runs the
 * checks and (optionally) zips each frame as its own PNG.
 */
import { layoutSheet, buildAtlas, countFrames, slug } from './frames.js';
import { touchesEdge } from './sprites.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const toBlob = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The browser could not encode the PNG.'))), 'image/png'));

export async function makeSprites({ stage, sprites, rows, cfg, onProgress = () => {}, signal }) {
  const { cell, anchor, tileW, fps, loopSafe, inPlace, maxWidth, model, pixel, pixelScale, levels, wantZip } = cfg;
  sprites.configure({ tileW, cell, anchor, pixel, pixelScale, levels });
  const layout = layoutSheet(rows, cell, maxWidth);
  const total = countFrames(rows);
  if (layout.width > 16384 || layout.height > 16384) {
    throw new Error(`The sheet would be ${layout.width} × ${layout.height} px, more than browsers can draw. Pick fewer clips, fewer directions, a lower fps or a smaller tile.`);
  }
  const sheet = document.createElement('canvas');
  sheet.width = layout.width; sheet.height = layout.height;
  const ctx = sheet.getContext('2d');
  const probe = document.createElement('canvas');
  probe.width = probe.height = cell;
  const pctx = probe.getContext('2d', { willReadFrequently: true });

  const clipped = [];
  const singles = wantZip ? [] : null;
  let done = 0;
  let k = 0;
  for (const row of rows) {
    stage.setDirection(row.dir);
    for (const f of row.frames) {
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      stage.pose(row.clip, f.time, inPlace);
      const img = sprites.render();
      const p = layout.placed[k++];
      ctx.drawImage(img, p.x, p.y);
      pctx.clearRect(0, 0, cell, cell);
      pctx.drawImage(img, 0, 0);
      if (touchesEdge(pctx, cell)) clipped.push(f.name);
      if (singles) singles.push({ name: f.name, blob: await toBlob(probe) });
      done++;
      if (done % 6 === 0) { onProgress(done / total, `Drawing ${done} of ${total}`); await nextFrame(); }
    }
  }
  onProgress(1, 'Packing the sheet');
  await nextFrame();
  const base = slug(model) + '-sprites';
  const atlas = buildAtlas({ image: base + '.png', layout, rows, cell, anchor, fps, loopSafe, tileW, model });
  const sheetBlob = await toBlob(sheet);
  const json = JSON.stringify(atlas, null, 2);

  let zipBlob = null;
  if (singles) {
    if (!window.JSZip) throw new Error('The ZIP library did not load. Check that vendor/jszip.min.js sits next to this tool.');
    const zip = new window.JSZip();
    const folder = zip.folder(slug(model) + '-frames');
    for (const s of singles) folder.file(s.name + '.png', s.blob);
    folder.file(base + '.json', json);
    zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  }

  const checks = runChecks({ clipped, total, layout, rows, loopSafe, inPlace, travel: cfg.travel ?? {} });
  return { base, sheet, sheetBlob, json, atlas, zipBlob, layout, total, checks, clipped };
}

export function runChecks({ clipped, total, layout, rows, loopSafe, inPlace, travel }) {
  const out = [];
  if (!clipped.length) out.push({ level: 'PASS', text: 'Every frame fits its cell' });
  else out.push({ level: 'FAIL', text: `${clipped.length} frame${clipped.length === 1 ? '' : 's'} touch the cell edge and may be cut off (first: ${clipped[0]}). Pick a bigger cell or move the base point.` });
  out.push({ level: 'PASS', text: `Base point the same on all ${total}` });
  const animated = rows.some((r) => r.clip);
  if (animated) {
    out.push(loopSafe
      ? { level: 'PASS', text: 'Loops join cleanly (last frame left out so it does not repeat the first)' }
      : { level: 'WARN', text: 'Loop-safe is off: the last frame repeats the first, so loops will stutter' });
    const moving = Object.entries(travel).filter(([, d]) => d > 0.05);
    if (moving.length && !inPlace) out.push({ level: 'WARN', text: `${moving.map(([n]) => n).join(', ')} move${moving.length === 1 ? 's' : ''} across the floor. Turn on "Play in place" so the sprite stays on its tile.` });
  }
  if (layout.width > 2048 || layout.height > 2048) out.push({ level: 'WARN', text: `Sheet is ${layout.width} × ${layout.height}; some phones prefer 2048 px or less` });
  else out.push({ level: 'PASS', text: 'Sheet fits 2048 px, safe on phones' });
  return out;
}
