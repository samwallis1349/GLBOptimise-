// Paints the round badge off the front of the Rusted Colossus.
//
//   node scripts/hero/remove-logo.mjs [in.glb] [out.glb]
//
// The texture atlas is cut into many small islands, so the badge can't be
// found in 2D. Instead: take the triangles on the front face (+Z) inside a
// circle around the badge, draw their UV triangles into a mask, and paint the
// masked texels with the surrounding paint colour plus fine grain, so the
// patch doesn't look flat. (Keeping any of the original texel shows the
// badge through as a ghost.) The badge is also
// modelled in relief, so its vertices are pressed flat onto a plane fitted to
// the panel around it.
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const src = resolve(process.argv[2] ?? 'scripts/hero/source/rusted-colossus-lod1.glb');
const out = resolve(process.argv[3] ?? 'scripts/hero/source/rusted-colossus-lod1-clean.glb');
// Badge centre and radius in mesh space (front view: x across, y up).
const BADGE = { x: 0, y: 0.218, r: 0.1 };
/** Outer edge of the panel ring the paint colour is sampled from. */
const PANEL_R = 0.125;
/** Relief within this radius is flattened; the ring out to RING_R sets the plane. */
const FLAT_R = 0.086, RING_R = 0.115;
/** How far behind the frontmost surface the badge relief reaches. */
const DEPTH = 0.15;
/** Grain added to the paint, ± this many levels. */
const GRAIN = 5;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(src);
const prim = document.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), IA = prim.getIndices().getArray();
const texture = prim.getMaterial().getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(texture.getImage())).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

const P = [], U = [], e = [];
for (let i = 0; i < pos.getCount(); i++) { P.push(pos.getElement(i, []).slice()); U.push(uv.getElement(i, e).slice()); }

// Front-facing triangles whose centre lies between two radii of the badge
// centre, nearest the viewer only.
let frontZ = -Infinity;
const faces = [];
for (let t = 0; t < IA.length; t += 3) {
  const [a, b, c] = [P[IA[t]], P[IA[t + 1]], P[IA[t + 2]]];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nz / (Math.hypot(nx, ny, nz) || 1) < -0.2) continue;
  const d = Math.hypot((a[0] + b[0] + c[0]) / 3 - BADGE.x, (a[1] + b[1] + c[1]) / 3 - BADGE.y);
  if (d > PANEL_R) continue;
  const z = (a[2] + b[2] + c[2]) / 3;
  faces.push([t, d, z]);
  if (d <= BADGE.r) frontZ = Math.max(frontZ, z);
}
const within = (r0, r1) => faces.filter(([, d, z]) => d > r0 && d <= r1 && z > frontZ - DEPTH).map(([t]) => t);
const tris = within(-1, BADGE.r);
console.log(`badge: ${tris.length} triangles`);

/** Texel mask of the given triangles' UVs, grown by ~2 texels to catch seam bleed. */
function uvMask(list) {
  const mask = new Uint8Array(W * H);
  for (const t of list) {
    const [a, b, c] = [U[IA[t]], U[IA[t + 1]], U[IA[t + 2]]].map(([u, v]) => [u * W, v * H]);
    const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])) - 2), maxx = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])) + 2);
    const miny = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])) - 2), maxy = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])) + 2);
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (!area) continue;
    const tol = -2 / Math.sqrt(Math.abs(area));
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= tol && w1 >= tol && w2 >= tol) mask[y * W + x] = 1;
    }
  }
  return mask;
}
const mask = uvMask(tris);

// Flatten the relief: fit z = a + b·x + c·y to front vertices in the ring
// just outside the badge, then put every front vertex inside onto it.
const normal = prim.getAttribute('NORMAL');
const front = (i) => P[i][2] > frontZ - DEPTH;
const ring = [], inside = [];
for (let i = 0; i < P.length; i++) {
  const d = Math.hypot(P[i][0] - BADGE.x, P[i][1] - BADGE.y);
  if (!front(i)) continue;
  if (d <= FLAT_R) inside.push(i);
  else if (d <= RING_R) ring.push(i);
}
// Least squares via the 3x3 normal equations.
const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
for (const i of ring) {
  const row = [1, P[i][0], P[i][1]];
  for (let j = 0; j < 3; j++) { r[j] += row[j] * P[i][2]; for (let k = 0; k < 3; k++) M[j][k] += row[j] * row[k]; }
}
const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const D = det(M);
const [pa, pb, pc] = [0, 1, 2].map((j) => det(M.map((row, k) => row.map((v, c) => (c === j ? r[k] : v)))) / D);
const planeNormal = [-pb, -pc, 1].map((v, _, n) => v / Math.hypot(...n));
for (const i of inside) {
  const z = pa + pb * P[i][0] + pc * P[i][1];
  pos.setElement(i, [P[i][0], P[i][1], z]);
  normal.setElement(i, planeNormal);
}
console.log(`flattened ${inside.length} vertices onto z = ${pa.toFixed(4)} + ${pb.toFixed(3)}x + ${pc.toFixed(3)}y (ring ${ring.length})`);

// Paint colour: the median of the bare panel in a ring just outside the badge.
const panel = uvMask(within(PANEL_R - 0.02, PANEL_R));
const sample = [];
for (let i = 0; i < W * H; i++) if (panel[i] && !mask[i]) sample.push(i);
const median = (ch) => sample.map((i) => data[i * C + ch]).sort((p, q) => p - q)[sample.length >> 1];
const paint = [median(0), median(1), median(2)];
const lum = [];
for (let i = 0; i < W * H; i++) if (mask[i]) lum.push([0, i]);
console.log(`paint ${paint} from ${sample.length} panel texels; painting ${lum.length} texels`);

for (const [, i] of lum) {
  const grain = (Math.random() * 2 - 1) * GRAIN;
  for (let ch = 0; ch < 3; ch++) data[i * C + ch] = Math.max(0, Math.min(255, Math.round(paint[ch] + grain)));
}

const mime = texture.getMimeType();
let image = sharp(data, { raw: { width: W, height: H, channels: C } });
image = mime === 'image/webp' ? image.webp({ quality: 92 }) : mime === 'image/png' ? image.png() : image.jpeg({ quality: 92, mozjpeg: true });
texture.setImage(new Uint8Array(await image.toBuffer()));
await io.write(out, document);
console.log(`wrote ${out}`);
