/**
 * Image Cutout & Sprites edition (the 2D tools): a free sprite-sheet check,
 * background removal with sprite splitting (the site's Alpha Cutout flood
 * method), and line-art clean-up to PNG + SVG (the site's Line Studio white
 * removal, line enhancement and ImageTracer vector trace). DOM-free: works on
 * RGBA arrays, so it runs in the panel's worker and in Node tests.
 */
import JSZip from 'jszip';
import ImageTracer from 'imagetracerjs';
import { encodeImage } from '../../../../worker/api/images.js';
import { readImage, stem } from '../inputs.js';

// ---------------------------------------------------------------- shared
const cdist = (A, i, B, j) => {
  const dr = (A[i] - B[j]) / 255, dg = (A[i + 1] - B[j + 1]) / 255, db = (A[i + 2] - B[j + 2]) / 255;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 3;
};
const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const png = (w, h, data) => encodeImage({ width: w, height: h, data }, 'image/png');

function detectBg(orig, W, H) {
  const buckets = new Map();
  const add = (x, y) => {
    const i = (y * W + x) * 4;
    if (orig[i + 3] < 200) return;
    const k = ((orig[i] >> 3) << 10) | ((orig[i + 1] >> 3) << 5) | (orig[i + 2] >> 3);
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = [0, 0, 0, 0]));
    b[0] += orig[i]; b[1] += orig[i + 1]; b[2] += orig[i + 2]; b[3] += 1;
  };
  const step = Math.max(1, Math.floor((W + H) / 800));
  for (let x = 0; x < W; x += step) { add(x, 0); add(x, H - 1); }
  for (let y = 0; y < H; y += step) { add(0, y); add(W - 1, y); }
  let best = null;
  for (const b of buckets.values()) if (!best || b[3] > best[3]) best = b;
  return best ? [best[0] / best[3], best[1] / best[3], best[2] / best[3]] : [255, 255, 255];
}

function borderTransparent(orig, W, H) {
  let t = 0, n = 0;
  for (let x = 0; x < W; x += 4) { n += 2; if (orig[x * 4 + 3] < 16) t += 1; if (orig[((H - 1) * W + x) * 4 + 3] < 16) t += 1; }
  for (let y = 0; y < H; y += 4) { n += 2; if (orig[y * W * 4 + 3] < 16) t += 1; if (orig[(y * W + W - 1) * 4 + 3] < 16) t += 1; }
  return t / n > 0.6;
}

// ---------------------------------------------------------------- cutout
/** Alpha Cutout's flood method: grow the background in from the border, following gradients. */
function floodCut(orig, W, H, bg, { tol = 0.12, step = 0.025, soft = 0.55, speck = 60 }) {
  const N = W * H, out = new Uint8ClampedArray(orig.length);
  const S = orig, softK = Math.max(0.01, soft * 0.35);
  const inR = new Uint8Array(N), rR = new Float32Array(N), rG = new Float32Array(N), rB = new Float32Array(N), q = new Int32Array(N);
  let qh = 0, qt = 0;
  const seed = (p) => { if (!inR[p]) { inR[p] = 1; rR[p] = S[p * 4]; rG[p] = S[p * 4 + 1]; rB[p] = S[p * 4 + 2]; q[qt++] = p; } };
  const borderOK = (p) => orig[p * 4 + 3] < 16 || cdist(S, p * 4, bg, 0) < tol;
  for (let x = 0; x < W; x += 1) { if (borderOK(x)) seed(x); const b = (H - 1) * W + x; if (borderOK(b)) seed(b); }
  for (let y = 0; y < H; y += 1) { const l = y * W, r = l + W - 1; if (borderOK(l)) seed(l); if (borderOK(r)) seed(r); }
  const ref = [0, 0, 0];
  while (qh < qt) {
    const p = q[qh++], x = p % W, pi = p * 4;
    ref[0] = rR[p]; ref[1] = rG[p]; ref[2] = rB[p];
    const tryN = (n) => {
      if (inR[n]) return;
      const ni = n * 4;
      if (orig[ni + 3] < 16 || (cdist(S, ni, S, pi) < step && cdist(S, ni, ref, 0) < tol)) { inR[n] = 1; rR[n] = ref[0]; rG[n] = ref[1]; rB[n] = ref[2]; q[qt++] = n; }
    };
    if (x > 0) tryN(p - 1); if (x < W - 1) tryN(p + 1); if (p >= W) tryN(p - W); if (p < N - W) tryN(p + W);
  }
  // Small pockets the flood skipped (grain, specks) become background too.
  const pocket = Math.max(12, speck);
  const seen = new Uint8Array(N), st = new Int32Array(N), mem = new Int32Array(pocket + 1);
  for (let s0 = 0; s0 < N; s0 += 1) {
    if (inR[s0] || seen[s0]) continue;
    let sp = 0, m = 0, big = false;
    st[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const p = st[--sp];
      if (m <= pocket) mem[m] = p;
      m += 1;
      if (m > pocket) big = true;
      const x = p % W, y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const n = yy * W + xx;
          if (!inR[n] && !seen[n]) { seen[n] = 1; st[sp++] = n; }
        }
      }
    }
    if (!big) for (let k = 0; k < m; k += 1) inR[mem[k]] = 1;
  }
  for (let p = 0, i = 0; p < N; p += 1, i += 4) {
    out[i] = orig[i]; out[i + 1] = orig[i + 1]; out[i + 2] = orig[i + 2];
    if (inR[p]) { out[i + 3] = 0; continue; }
    const x = p % W;
    let r = 0, g = 0, b = 0, c = 0;
    const acc = (n) => { if (inR[n]) { const j = n * 4; r += S[j]; g += S[j + 1]; b += S[j + 2]; c += 1; } };
    if (x > 0) acc(p - 1); if (x < W - 1) acc(p + 1); if (p >= W) acc(p - W); if (p < N - W) acc(p + W);
    if (!c) { out[i + 3] = orig[i + 3]; continue; }
    const lb = [r / c, g / c, b / c];
    let a = (cdist(orig, i, lb, 0) - step) / softK;
    a = a < 0.15 ? 0.15 : a > 1 ? 1 : a;
    if (a < 1) for (let k = 0; k < 3; k += 1) out[i + k] = (orig[i + k] - (1 - a) * lb[k]) / a; // despill
    out[i + 3] = a * orig[i + 3];
  }
  return out;
}

function cleanAlpha(out, W, H, { cut = 0.03, speck = 60 }) {
  const c = cut * 255;
  for (let i = 3; i < out.length; i += 4) if (out[i] < c) out[i] = 0;
  // Despeck: drop islands smaller than `speck` pixels.
  const N = W * H, lab = new Int32Array(N), stack = new Int32Array(N), members = new Int32Array(N);
  let id = 0, removed = 0;
  for (let s = 0; s < N; s += 1) {
    if (lab[s] || out[s * 4 + 3] === 0) continue;
    id += 1;
    let sp = 0, m = 0;
    stack[sp++] = s; lab[s] = id;
    while (sp) {
      const p = stack[--sp];
      members[m++] = p;
      const x = p % W, y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const n = yy * W + xx;
          if (!lab[n] && out[n * 4 + 3] > 0) { lab[n] = id; stack[sp++] = n; }
        }
      }
    }
    if (m < speck) { for (let k = 0; k < m; k += 1) out[members[k] * 4 + 3] = 0; removed += 1; }
  }
  return removed;
}

/** Fills transparent colour channels near edges with their neighbours, so filtering never shows a fringe. */
function padEdges(buf, W, H, n) {
  const N = W * H;
  let filled = new Uint8Array(N);
  for (let p = 0; p < N; p += 1) filled[p] = buf[p * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < n; pass += 1) {
    const next = filled.slice();
    let any = false;
    for (let p = 0; p < N; p += 1) {
      if (filled[p]) continue;
      const x = p % W, y = (p / W) | 0;
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const qn = yy * W + xx;
          if (filled[qn]) { const j = qn * 4; r += buf[j]; g += buf[j + 1]; b += buf[j + 2]; c += 1; }
        }
      }
      if (c) { const i = p * 4; buf[i] = r / c; buf[i + 1] = g / c; buf[i + 2] = b / c; next[p] = 1; any = true; }
    }
    filled = next;
    if (!any) break;
  }
}

/** Alpha Cutout's auto sprite finder: occupied grid cells joined into pieces, in reading order. */
function findSprites(alpha, W, H, { gap = 6, minPx = 1500 } = {}) {
  const A = (p) => alpha[p * 4 + 3] > 16;
  const cs = Math.max(1, Math.ceil(gap / 2)), gw = Math.ceil(W / cs), gh = Math.ceil(H / cs), G = gw * gh;
  const cnt = new Int32Array(G), x0 = new Int32Array(G).fill(1e9), y0 = new Int32Array(G).fill(1e9), x1 = new Int32Array(G).fill(-1), y1 = new Int32Array(G).fill(-1);
  for (let y = 0; y < H; y += 1) {
    const cy = (y / cs) | 0;
    for (let x = 0; x < W; x += 1) {
      if (!A(y * W + x)) continue;
      const c = cy * gw + ((x / cs) | 0);
      cnt[c] += 1;
      if (x < x0[c]) x0[c] = x; if (x > x1[c]) x1[c] = x; if (y < y0[c]) y0[c] = y; if (y > y1[c]) y1[c] = y;
    }
  }
  const occ = Math.max(2, Math.round(cs * cs * 0.12));
  for (let c = 0; c < G; c += 1) if (cnt[c] < occ) cnt[c] = 0;
  const lab = new Int32Array(G), st = new Int32Array(G);
  let id = 0;
  let list = [];
  for (let s = 0; s < G; s += 1) {
    if (!cnt[s] || lab[s]) continue;
    id += 1;
    let sp = 0;
    st[sp++] = s; lab[s] = id;
    const b = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, px: 0 };
    while (sp) {
      const c = st[--sp];
      b.px += cnt[c];
      b.x0 = Math.min(b.x0, x0[c]); b.y0 = Math.min(b.y0, y0[c]); b.x1 = Math.max(b.x1, x1[c]); b.y1 = Math.max(b.y1, y1[c]);
      const cx = c % gw, cy = (c / gw) | 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx;
        if (cnt[n] && !lab[n]) { lab[n] = id; st[sp++] = n; }
      }
    }
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    if (b.px >= minPx && Math.min(bw, bh) >= 12 && Math.max(bw / bh, bh / bw) <= 25) list.push({ x: b.x0, y: b.y0, w: bw, h: bh, px: b.px });
  }
  list.sort((a, b) => a.y - b.y);
  const rows = [];
  for (const s of list) {
    const cy = s.y + s.h / 2;
    const row = rows.find((r) => cy >= r.y0 && cy <= r.y1);
    if (row) { row.items.push(s); row.y0 = Math.min(row.y0, s.y); row.y1 = Math.max(row.y1, s.y + s.h); } else rows.push({ y0: s.y, y1: s.y + s.h, items: [s] });
  }
  list = rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
  return list;
}

function crop(buf, W, s, m = 0) {
  const cw = s.w + m * 2, ch = s.h + m * 2;
  const data = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < s.h; y += 1) {
    const src = ((s.y + y) * W + s.x) * 4;
    data.set(buf.subarray(src, src + s.w * 4), ((y + m) * cw + m) * 4);
  }
  return { width: cw, height: ch, data };
}

/** Removes the background; analysis shared by the free check and the cutout. */
function cutImage(img, params = {}) {
  const { width: W, height: H, data } = img;
  const transparent = borderTransparent(data, W, H);
  const bg = params.background ? params.background : detectBg(data, W, H);
  const settings = { tol: (params.tolerance ?? 12) / 100, step: 0.025, soft: 0.55, speck: params.speck ?? 60, cut: 0.03 };
  const out = transparent ? new Uint8ClampedArray(data) : floodCut(data, W, H, bg, settings);
  const removed = cleanAlpha(out, W, H, settings);
  return { out, W, H, bg, transparent, removed };
}

/** Free: what's in the image, the background colour, and how many sprites it holds. */
export async function sheetCheck(bytes) {
  const img = await readImage(bytes);
  const { out, W, H, bg, transparent } = cutImage(img);
  const sprites = findSprites(out, W, H);
  let visible = 0;
  for (let i = 3; i < out.length; i += 4) if (out[i] > 16) visible += 1;
  return {
    report: {
      width: W,
      height: H,
      format: img.mime.replace('image/', '').toUpperCase(),
      background: transparent ? 'already transparent' : hex(bg),
      sprites: sprites.length,
      coverage: Math.round((visible / (W * H)) * 100),
      warnings: sprites.length ? [] : ['No separate sprites found; the cutout will export one image.'],
    },
  };
}

/**
 * Background removal. With `split`, every separate piece is also saved as
 * its own PNG with a sprites.json listing where each came from.
 */
export async function cutout(bytes, { tolerance = 12, split = true, padding = 4, minPx = 1500, gap = 6 }, name) {
  const img = await readImage(bytes);
  const { out, W, H, bg, transparent, removed } = cutImage(img, { tolerance: Number(tolerance) });
  const buf = out.slice();
  padEdges(buf, W, H, 4);
  const base = stem(name);
  const full = png(W, H, buf);
  const sprites = split ? findSprites(out, W, H, { gap: Number(gap), minPx: Number(minPx) }) : [];
  const warnings = [];
  if (transparent) warnings.push('The image already had a transparent background, so only the sprites were split out.');
  if (split && !sprites.length) warnings.push('No separate sprites were found, so only the full cutout was saved.');
  const report = { width: W, height: H, background: transparent ? 'transparent' : hex(bg), specksRemoved: removed, sprites: sprites.map(({ x, y, w, h }, i) => ({ file: `${base}_${String(i + 1).padStart(2, '0')}.png`, x, y, w, h })), warnings };
  if (!sprites.length) return { output: full, name: `${base}-cutout.png`, report };
  const zip = new JSZip();
  zip.file(`${base}-cutout.png`, full);
  const m = Math.max(0, Number(padding) | 0);
  sprites.forEach((s, i) => { const c = crop(buf, W, s, m); zip.file(`sprites/${report.sprites[i].file}`, png(c.width, c.height, c.data)); });
  zip.file('sprites.json', JSON.stringify({ image: `${base}-cutout.png`, size: { w: W, h: H }, padding: m, frames: report.sprites }, null, 2));
  return { output: await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }), name: `${base}-sprites.zip`, report };
}

// ---------------------------------------------------------------- line art
const INF = 1e20;
const NB8 = (w) => [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];

function edt(fg, w, h) {
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), out = new Float64Array(w * h);
  for (let p = 0; p < w * h; p += 1) out[p] = fg[p] ? INF : 0;
  const dt = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let qq = 1; qq < len; qq += 1) {
      let s = ((f[qq] + qq * qq) - (f[v[k]] + v[k] * v[k])) / (2 * qq - 2 * v[k]);
      while (s <= z[k]) { k -= 1; s = ((f[qq] + qq * qq) - (f[v[k]] + v[k] * v[k])) / (2 * qq - 2 * v[k]); }
      k += 1; v[k] = qq; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let qq = 0; qq < len; qq += 1) { while (z[k + 1] < qq) k += 1; const r = v[k]; d[qq] = (qq - r) * (qq - r) + f[r]; }
  };
  for (let x = 0; x < w; x += 1) { for (let y = 0; y < h; y += 1) f[y] = out[y * w + x]; dt(h); for (let y = 0; y < h; y += 1) out[y * w + x] = d[y]; }
  for (let y = 0; y < h; y += 1) { const o = y * w; for (let x = 0; x < w; x += 1) f[x] = out[o + x]; dt(w); for (let x = 0; x < w; x += 1) out[o + x] = Math.sqrt(d[x]); }
  return out;
}

function thin(S, w) {
  let list = [];
  for (let p = 0; p < S.length; p += 1) if (S[p]) list.push(p);
  const P = new Uint8Array(8);
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step += 1) {
      const del = [];
      for (const p of list) {
        if (!S[p]) continue;
        P[0] = S[p - w]; P[1] = S[p - w + 1]; P[2] = S[p + 1]; P[3] = S[p + w + 1]; P[4] = S[p + w]; P[5] = S[p + w - 1]; P[6] = S[p - 1]; P[7] = S[p - w - 1];
        let B = 0, A = 0;
        for (let i = 0; i < 8; i += 1) { B += P[i]; if (!P[i] && P[(i + 1) & 7]) A += 1; }
        if (B < 2 || B > 6 || A !== 1) continue;
        if (step === 0 ? (P[0] && P[2] && P[4]) || (P[2] && P[4] && P[6]) : (P[0] && P[2] && P[6]) || (P[0] && P[4] && P[6])) continue;
        del.push(p);
      }
      if (del.length) { changed = true; for (const p of del) S[p] = 0; }
    }
    list = list.filter((p) => S[p]);
  }
  return S;
}

/** Line Studio's "remove white": white (and near-white) becomes transparent, edges un-mixed. */
function removeWhite(orig, W, H, { tol = 0.08, soft = 0.18 }) {
  const N = W * H, out = new Uint8ClampedArray(orig.length);
  const dist = new Float32Array(N);
  for (let p = 0, i = 0; p < N; p += 1, i += 4) dist[p] = (255 - Math.min(orig[i], orig[i + 1], orig[i + 2])) / 255;
  const lim = tol + soft;
  const bg = new Uint8Array(N);
  for (let p = 0; p < N; p += 1) bg[p] = dist[p] <= lim ? 1 : 0;
  for (let p = 0, i = 0; p < N; p += 1, i += 4) {
    const oa = orig[i + 3];
    out[i] = orig[i]; out[i + 1] = orig[i + 1]; out[i + 2] = orig[i + 2];
    let a = (dist[p] - tol) / soft;
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    if (a < 1 && a > 0) for (let k = 0; k < 3; k += 1) out[i + k] = (orig[i + k] - (1 - a) * 255) / a;
    out[i + 3] = a * oa;
  }
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const p = y * W + x;
    if (bg[p]) continue;
    let touches = false, inner = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx; if (xx < 0 || xx >= W || (!dx && !dy)) continue;
        const n = yy * W + xx;
        if (bg[n]) touches = true; else if (dist[n] > inner) inner = dist[n];
      }
    }
    if (!touches || inner <= dist[p] + 0.04) continue;
    const a = Math.max(0.05, dist[p] / inner), i = p * 4;
    for (let k = 0; k < 3; k += 1) out[i + k] = (orig[i + k] - (1 - a) * 255) / a;
    out[i + 3] = a * orig[i + 3];
  }
  return out;
}

/** Line Studio's line enhancement: redraws every line at an even weight, joining small breaks. */
function evenInk(src, W, H, { weight = 4, keepFills = true, bridge = true }) {
  const N = W * H, A = new Float32Array(N), nb = NB8(W);
  for (let p = 0; p < N; p += 1) A[p] = src[p * 4 + 3] / 255;
  const inb = (p) => { const x = p % W, y = (p / W) | 0; return x > 0 && y > 0 && x < W - 1 && y < H - 1; };
  const M = new Uint8Array(N), qq = new Int32Array(N);
  let qt = 0;
  for (let p = 0; p < N; p += 1) if (A[p] > 0.35 && inb(p)) { M[p] = 1; qq[qt++] = p; }
  for (let qh = 0; qh < qt; qh += 1) { const p = qq[qh]; for (const o of nb) { const n = p + o; if (!M[n] && A[n] > 0.05 && inb(n)) { M[n] = 1; qq[qt++] = n; } } }
  const M0 = new Uint8Array(N);
  for (let p = 0; p < N; p += 1) M0[p] = A[p] > 0.4 ? 1 : 0;
  const d = edt(M0, W, H);
  const S = thin(M.slice(), W);
  let joined = 0;
  if (bridge) {
    const ends = [];
    for (let p = 0; p < N; p += 1) if (S[p] && inb(p)) { let c = 0; for (const o of nb) c += S[p + o]; if (c === 1) ends.push(p); }
    const dir = (p) => {
      const x0 = p % W, y0 = (p / W) | 0;
      let sx = 0, sy = 0, c = 0;
      for (let y = Math.max(0, y0 - 4); y <= Math.min(H - 1, y0 + 4); y += 1) for (let x = Math.max(0, x0 - 4); x <= Math.min(W - 1, x0 + 4); x += 1) if (S[y * W + x]) { sx += x; sy += y; c += 1; }
      const vx = x0 - sx / c, vy = y0 - sy / c, l = Math.hypot(vx, vy) || 1;
      return [vx / l, vy / l];
    };
    const grid = new Map(), key = (gx, gy) => gx * 100003 + gy;
    ends.forEach((p, i) => { const k = key(((p % W) / 8) | 0, ((p / W) / 8) | 0); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    const pairs = [];
    ends.forEach((p, i) => {
      const x = p % W, y = (p / W) | 0, gx = (x / 8) | 0, gy = (y / 8) | 0;
      for (let a = gx - 1; a <= gx + 1; a += 1) for (let b = gy - 1; b <= gy + 1; b += 1) for (const j of grid.get(key(a, b)) || []) {
        if (j <= i) continue;
        const p2 = ends[j], dx = (p2 % W) - x, dy = ((p2 / W) | 0) - y, dd = Math.hypot(dx, dy);
        if (dd <= 7.5 && Math.abs(dx) + Math.abs(dy) >= 4) pairs.push([dd, i, j, dx, dy]);
      }
    });
    pairs.sort((a, b) => a[0] - b[0]);
    const used = new Uint8Array(ends.length);
    for (const [dd, i, j, dx, dy] of pairs) {
      if (used[i] || used[j]) continue;
      const di = dir(ends[i]), dj = dir(ends[j]);
      if ((di[0] * dx) / dd + (di[1] * dy) / dd < 0.55 || -((dj[0] * dx) / dd + (dj[1] * dy) / dd) < 0.55) continue;
      const x0 = ends[i] % W, y0 = (ends[i] / W) | 0, steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
      for (let s = 0; s <= steps; s += 1) S[Math.round(y0 + (dy * s) / steps) * W + Math.round(x0 + (dx * s) / steps)] = 1;
      used[i] = 1; used[j] = 1; joined += 1;
    }
  }
  const keepFill = new Uint8Array(N), fillCore = new Uint8Array(N);
  if (keepFills) {
    const notBig = new Uint8Array(N);
    for (let p = 0; p < N; p += 1) notBig[p] = d[p] >= 3.6 ? 0 : 1;
    const dn = edt(notBig, W, H);
    for (let p = 0; p < N; p += 1) keepFill[p] = dn[p] <= 3 && M0[p] ? 1 : 0;
    const di = edt(keepFill, W, H);
    for (let p = 0; p < N; p += 1) fillCore[p] = di[p] > 2 ? 1 : 0;
  }
  const notSk = new Uint8Array(N).fill(1);
  let strokes = 0;
  for (let p = 0; p < N; p += 1) if (S[p] && !fillCore[p]) { notSk[p] = 0; strokes += 1; }
  const line = new Float32Array(N);
  if (strokes) {
    const D = edt(notSk, W, H);
    for (let p = 0; p < N; p += 1) { const a = weight / 2 + 0.5 - D[p]; if (a > line[p]) line[p] = a > 1 ? 1 : a < 0 ? 0 : a; }
  }
  let r = 0, g = 0, b = 0, c = 0;
  for (let p = 0; p < N; p += 7) if (A[p] > 0.9) { r += src[p * 4]; g += src[p * 4 + 1]; b += src[p * 4 + 2]; c += 1; }
  const ink = c ? [r / c, g / c, b / c] : [0, 0, 0];
  const out = new Uint8ClampedArray(src.length);
  for (let p = 0, i = 0; p < N; p += 1, i += 4) {
    if (keepFill[p] && A[p] >= line[p]) { out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3]; continue; }
    out[i] = ink[0]; out[i + 1] = ink[1]; out[i + 2] = ink[2]; out[i + 3] = line[p] * 255;
  }
  return { out, joined, strokes };
}

function traceSvg(cut, W, H, { colours = 2, detail = 6, maxSide = 1024 }) {
  // Vectors have hard edges: trace a solid-alpha copy at up to `maxSide` px.
  const s = Math.min(1, maxSide / Math.max(W, H));
  const tw = Math.max(1, Math.round(W * s)), th = Math.max(1, Math.round(H * s));
  const data = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y += 1) for (let x = 0; x < tw; x += 1) {
    const sx = Math.min(W - 1, Math.floor(x / s)), sy = Math.min(H - 1, Math.floor(y / s));
    const i = (sy * W + sx) * 4, o = (y * tw + x) * 4;
    if (cut[i + 3] < 176) continue;
    data[o] = cut[i]; data[o + 1] = cut[i + 1]; data[o + 2] = cut[i + 2]; data[o + 3] = 255;
  }
  const lt = [0, 4, 3, 2.4, 1.8, 1.4, 1, 0.75, 0.55, 0.4, 0.25][Math.max(1, Math.min(10, detail))];
  const opts = { ltres: lt, qtres: lt, pathomit: 8, rightangleenhance: true, colorsampling: 2, numberofcolors: colours + 1, mincolorratio: 0, colorquantcycles: 3, blurradius: 0, layering: 0, strokewidth: 1, linefilter: false, scale: 1 / s, roundcoords: 1, viewbox: false, desc: false, lcpr: 0, qcpr: 0 };
  const td = ImageTracer.imagedataToTracedata({ width: tw, height: th, data }, opts);
  let body = '';
  let paths = 0;
  td.layers.forEach((layer, k) => {
    if (td.palette[k].a < 128) return;
    layer.forEach((pth, n) => {
      if (pth.isholepath) return;
      let str = ImageTracer.svgpathstring(td, k, n, opts);
      if (!str) return;
      str = str.replace(/ opacity="[^"]*"/, '').replace(/stroke="[^"]*" stroke-width="0" /, '').replace(/stroke-width="1"/, `stroke-width="${((1 / s) * 0.9).toFixed(2)}" stroke-linejoin="round"`);
      body += `  ${str}\n`;
      paths += 1;
    });
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${body.trimEnd()}\n</svg>\n`, paths };
}

/**
 * Line art clean-up: white removed (transparent PNG), optionally every line
 * redrawn at an even `weight`, and an SVG trace. Saves a ZIP of PNG + SVG.
 */
export async function lines(bytes, { enhance = true, weight = 4, svg = true, colours = 2 }, name) {
  const img = await readImage(bytes);
  const { width: W, height: H } = img;
  if (W * H > 16_800_000) throw new Error('Line art up to about 4096×4096 pixels.');
  let cut = removeWhite(img.data, W, H, {});
  let joined = 0;
  if (enhance) {
    const e = evenInk(cut, W, H, { weight: Math.max(1, Math.min(16, Number(weight) || 4)) });
    cut = e.out;
    joined = e.joined;
  }
  const base = stem(name);
  const pngBytes = png(W, H, cut);
  const report = { width: W, height: H, enhanced: Boolean(enhance), weight: enhance ? Number(weight) : null, breaksJoined: joined, warnings: [] };
  let ink = 0;
  for (let i = 3; i < cut.length; i += 4) if (cut[i] > 64) ink += 1;
  if (!ink) report.warnings.push('No lines were found: the image looks blank or entirely white.');
  if (!svg) return { output: pngBytes, name: `${base}-lines.png`, report };
  const t = traceSvg(cut, W, H, { colours: Number(colours) || 2 });
  report.paths = t.paths;
  const zip = new JSZip();
  zip.file(`${base}-lines.png`, pngBytes);
  zip.file(`${base}-lines.svg`, t.svg);
  return { output: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), name: `${base}-lines.zip`, report };
}
