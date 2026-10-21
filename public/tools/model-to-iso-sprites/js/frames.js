/**
 * Frame planning, naming, sheet layout and the JSON atlas. Pure functions.
 */
import { MAX_FRAMES_PER_CLIP } from './presets.js';

export function slug(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'clip';
}

/**
 * Sample times for a clip. Loop-safe leaves the last frame out, because it
 * would repeat the first one when the animation wraps round.
 */
export function sampleTimes(duration, fps, loopSafe = true) {
  if (!(duration > 0)) return [0];
  const n = Math.max(1, Math.min(MAX_FRAMES_PER_CLIP, Math.round(duration * fps)));
  if (loopSafe || n === 1) return Array.from({ length: n }, (_, i) => (i * duration) / n);
  return Array.from({ length: n }, (_, i) => (i * duration) / (n - 1));
}

export function frameName(pattern, { model, anim, dir, frame }) {
  const name = String(pattern || '{model}_{anim}_{dir}_{frame}')
    .replaceAll('{model}', slug(model))
    .replaceAll('{anim}', slug(anim))
    .replaceAll('{dir}', dir)
    .replaceAll('{frame}', String(frame).padStart(2, '0'));
  return name.replace(/[^\w.-]+/g, '_');
}

/**
 * Builds the list of sprite rows: one row per animation × direction.
 * clips: [{ name, duration }] (empty = one static frame per direction).
 */
export function planFrames({ model, clips, dirs, fps, loopSafe = true, pattern }) {
  const anims = clips.length ? clips : [{ name: 'static', duration: 0, static: true }];
  const rows = [];
  const used = new Set();
  for (const clip of anims) {
    const times = clip.static ? [0] : sampleTimes(clip.duration, fps, loopSafe);
    for (const dir of dirs) {
      const frames = times.map((time, i) => {
        let name = frameName(pattern, { model, anim: clip.name, dir, frame: i });
        while (used.has(name)) name += '_';
        used.add(name);
        return { name, time, index: i };
      });
      rows.push({ anim: clip.static ? 'static' : clip.name, animSlug: clip.static ? 'static' : slug(clip.name), dir, clip: clip.static ? null : clip, frames });
    }
  }
  return rows;
}

export function countFrames(rows) {
  return rows.reduce((n, r) => n + r.frames.length, 0);
}

/**
 * Places every frame on the sheet. Each animation × direction starts on a new
 * row; a long one wraps onto more rows when it would pass maxWidth.
 */
export function layoutSheet(rows, cell, maxWidth = 4096) {
  const longest = Math.max(1, ...rows.map((r) => r.frames.length));
  const cols = Math.max(1, Math.min(longest, Math.floor(maxWidth / cell)));
  const placed = [];
  let y = 0;
  for (const row of rows) {
    row.frames.forEach((f, i) => {
      placed.push({ ...f, anim: row.anim, dir: row.dir, x: (i % cols) * cell, y: (y + Math.floor(i / cols)) * cell });
    });
    y += Math.ceil(row.frames.length / cols);
  }
  return { width: cols * cell, height: y * cell, cols, placed };
}

/** JSON atlas: frames by name, plus an animations index engines can loop over. */
export function buildAtlas({ image, layout, rows, cell, anchor, fps, loopSafe, tileW, model }) {
  const frames = {};
  for (const p of layout.placed) {
    frames[p.name] = {
      frame: { x: p.x, y: p.y, w: cell, h: cell },
      anchor: { x: anchor.x, y: anchor.y },
      pivot: { x: +(anchor.x / cell).toFixed(4), y: +(anchor.y / cell).toFixed(4) },
      anim: p.anim, dir: p.dir, index: p.index,
    };
  }
  const animations = {};
  for (const r of rows) {
    (animations[r.anim] ??= { fps: r.anim === 'static' ? 0 : fps, loop: r.anim !== 'static' && loopSafe, directions: {} });
    animations[r.anim].directions[r.dir] = r.frames.map((f) => f.name);
  }
  return {
    frames,
    animations,
    meta: {
      app: 'AssetBench Model to Iso Sprites',
      image,
      model,
      size: { w: layout.width, h: layout.height },
      cell: { w: cell, h: cell },
      tile: { w: tileW, h: tileW / 2, metres: 1 },
      projection: '2:1 isometric (45° turn, atan(1/2) tilt)',
      anchorNote: 'anchor = pixel in each cell that sits on the tile centre',
    },
  };
}
