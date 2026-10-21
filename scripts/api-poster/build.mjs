/**
 * Builds the Cloud API poster: public/images/api-poster.svg (animated; used
 * by the API launch popup and the /docs hero) and a still
 * public/images/api-poster.webp (media page, social posts).
 *
 * The model in the middle is generated: a dense geodesic wireframe (the
 * "before") with a low-poly faceted version (the "after") revealed by a scan
 * line. Animation is SMIL so it plays inside <img>; renderers without SMIL
 * (and the WebP) show the half-scanned frame.
 *
 *   node scripts/api-poster/build.mjs
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = 1200;
const H = 640;
const MONO = "ui-monospace, 'Cascadia Code', Consolas, 'SF Mono', Menlo, monospace";
const SANS = "Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";

// ---------------------------------------------------------------- geometry
const PHI = (1 + Math.sqrt(5)) / 2;
const norm = ([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const mid = (a, b) => norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);

function icosahedron() {
  const v = [];
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    v.push([0, s, t * PHI], [s, t * PHI, 0], [t * PHI, 0, s]);
  }
  const faces = [];
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) for (let k = j + 1; k < v.length; k++) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if ([d(v[i], v[j]), d(v[j], v[k]), d(v[i], v[k])].every((e) => Math.abs(e - 2) < 1e-6)) faces.push([v[i], v[j], v[k]].map(norm));
  }
  return faces;
}

const subdivide = (faces) => faces.flatMap(([a, b, c]) => {
  const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
  return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]];
});

// A slightly lumpy rock/crystal: radius varies smoothly with direction.
const bump = ([x, y, z]) => 1 + 0.09 * Math.sin(3.1 * x + 1.3) * Math.cos(2.7 * y - 0.4) + 0.06 * Math.sin(4.3 * z + 2.1);
const shape = (p) => { const r = bump(p); return [p[0] * r, p[1] * r * 1.08, p[2] * r]; };

function rotate([x, y, z]) {
  const ay = 0.62, ax = -0.38;
  const x1 = x * Math.cos(ay) + z * Math.sin(ay);
  const z1 = -x * Math.sin(ay) + z * Math.cos(ay);
  return [x1, y * Math.cos(ax) - z1 * Math.sin(ax), y * Math.sin(ax) + z1 * Math.cos(ax)];
}

const CX = 790, CY = 300, R = 150;
const project = ([x, y, z]) => [CX + x * R, CY - y * R, z];
const LIGHT = norm([-0.5, 0.7, 0.9]);

function render(faces) {
  return faces.map((f) => {
    const p = f.map((v) => rotate(shape(v)));
    const u = p[1].map((n, i) => n - p[0][i]);
    const w = p[2].map((n, i) => n - p[0][i]);
    let n = norm([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
    const centre = p.reduce((s, v) => s.map((c, i) => c + v[i] / 3), [0, 0, 0]);
    if (n[0] * centre[0] + n[1] * centre[1] + n[2] * centre[2] < 0) n = n.map((c) => -c);
    return { pts: p.map(project), n, z: centre[2] };
  }).filter((f) => f.n[2] > 0).sort((a, b) => a.z - b.z);
}

const pts = (f) => f.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
// Shade from deep violet (away from the light) to warm amber (facing it).
function shade(n) {
  const t = Math.max(0, Math.min(1, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2] + 0.15) / 1.15));
  const stops = [[52, 30, 92], [138, 64, 160], [236, 120, 92], [255, 196, 92]];
  const s = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(s)), k = s - i;
  return `rgb(${lerp(stops[i][0], stops[i + 1][0], k)},${lerp(stops[i][1], stops[i + 1][1], k)},${lerp(stops[i][2], stops[i + 1][2], k)})`;
}

const base = icosahedron();
const low = render(subdivide(base)); // 80 faces: the game-ready version
const high = render(subdivide(subdivide(subdivide(base)))); // 1,280 faces: the source

const wire = high.map((f) => `<polygon points="${pts(f)}"/>`).join('');
const solid = low.map((f) => `<polygon points="${pts(f)}" fill="${shade(f.n)}"/>`).join('');

// ---------------------------------------------------------------- pieces
const SCAN_FROM = CX - R * 1.25, SCAN_TO = CX + R * 1.25;
const SCAN_MID = (SCAN_FROM + SCAN_TO) / 2;
const scanAnim = (attr, from, to) => `<animate attributeName="${attr}" values="${from};${to};${to};${from}" keyTimes="0;0.45;0.8;1" dur="7s" repeatCount="indefinite" calcMode="spline" keySplines="0.6 0 0.4 1;0 0 1 1;0.6 0 0.4 1"/>`;

const chip = (x, y, w, label, value, delta, accent) => `
  <g transform="translate(${x} ${y})">
    <rect width="${w}" height="58" rx="12" fill="#0f1422" fill-opacity="0.86" stroke="${accent}" stroke-opacity="0.5"/>
    <text x="14" y="22" font-family="${SANS}" font-size="12" fill="#8b93a7" letter-spacing="0.06em">${label}</text>
    <text x="14" y="46" font-family="${SANS}" font-size="21" font-weight="800" fill="#f3f5fa">${value}<tspan dx="8" font-size="14" font-weight="700" fill="${accent}">${delta}</tspan></text>
  </g>`;

const pill = (x, y, text, accent) => {
  const w = 22 + text.length * 8.2;
  return `<g transform="translate(${x} ${y})"><rect width="${w}" height="30" rx="15" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-opacity="0.6"/>
    <text x="${w / 2}" y="20" text-anchor="middle" font-family="${SANS}" font-size="13" font-weight="700" fill="${accent}">${text}</text></g>`;
};

const term = [
  ['#7ee0c3', '$ ', '#e7eaf2', 'curl -X POST /api/v1/game-ready'],
  ['', '', '#9aa3b8', '    -F file=@hero.glb -F device=mid'],
  ['', '', '#9aa3b8', '    -F engine=unity'],
  ['', '', '', ''],
  ['#e7eaf2', '{', '', ''],
  ['#c49bff', '  "ready"', '#7ee0c3', ': true,'],
  ['#c49bff', '  "triangles"', '#ffc65c', ': "83,701 → 21,781",'],
  ['#c49bff', '  "lods"', '#ffc65c', ': 3,  "ktx2": true,'],
  ['#c49bff', '  "zip"', '#7ee0c3', ': "hero_game-ready.zip"'],
  ['#e7eaf2', '}', '', ''],
].map(([c1, t1, c2, t2], i) => `<text x="88" y="${208 + i * 25}" font-family="${MONO}" font-size="15" xml:space="preserve">` +
  `${t1 ? `<tspan fill="${c1}">${t1}</tspan>` : ''}${t2 ? `<tspan fill="${c2}">${t2}</tspan>` : ''}</text>`).join('');

const beam = (d, color, delay) => `
  <path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-opacity="0.9" stroke-dasharray="26 18" filter="url(#glow)">
    <animate attributeName="stroke-dashoffset" from="88" to="0" dur="1.1s" begin="${delay}s" repeatCount="indefinite"/>
  </path>`;

const icon = (x, y, s, r) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}" fill="url(#iconFill)" stroke="#ffffff" stroke-opacity="0.18"/>
  <path d="M${x + s * 0.3} ${y + s * 0.68} L${x + s * 0.5} ${y + s * 0.3} L${x + s * 0.7} ${y + s * 0.68} Z" fill="#fff" fill-opacity="0.92"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="AssetBench Cloud API: one request turns a heavy 3D model into a game-ready, low-poly version with LODs, for phones, Quest and the web">
  <defs>
    <radialGradient id="bgA" cx="72%" cy="40%" r="60%"><stop offset="0" stop-color="#3a1f5c" stop-opacity="0.9"/><stop offset="1" stop-color="#3a1f5c" stop-opacity="0"/></radialGradient>
    <radialGradient id="bgB" cx="18%" cy="30%" r="45%"><stop offset="0" stop-color="#0f4c4a" stop-opacity="0.75"/><stop offset="1" stop-color="#0f4c4a" stop-opacity="0"/></radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb547" stop-opacity="0.38"/><stop offset="0.55" stop-color="#ff7a5c" stop-opacity="0.12"/><stop offset="1" stop-color="#ff7a5c" stop-opacity="0"/></radialGradient>
    <linearGradient id="term" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151b2b"/><stop offset="1" stop-color="#0b0f19"/></linearGradient>
    <linearGradient id="iconFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb547"/><stop offset="1" stop-color="#b14cff"/></linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ee0c3" stop-opacity="0"/><stop offset="1" stop-color="#7ee0c3" stop-opacity="0.22"/></linearGradient>
    <linearGradient id="scan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7ee0c3" stop-opacity="0"/><stop offset="0.5" stop-color="#d9fff4"/><stop offset="1" stop-color="#7ee0c3" stop-opacity="0"/></linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
    <clipPath id="after"><rect x="${SCAN_FROM}" y="0" width="${SCAN_MID - SCAN_FROM}" height="${H}">${scanAnim('width', 0, SCAN_TO - SCAN_FROM)}</rect></clipPath>
    <clipPath id="before"><rect x="${SCAN_MID}" y="0" width="${SCAN_TO - SCAN_FROM + 80}" height="${H}">${scanAnim('x', SCAN_FROM, SCAN_TO)}</rect></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="#070a12"/>
  <rect width="${W}" height="${H}" fill="url(#bgA)"/>
  <rect width="${W}" height="${H}" fill="url(#bgB)"/>

  <!-- perspective floor -->
  <g stroke="#7ee0c3" stroke-opacity="0.13" stroke-width="1">
    ${Array.from({ length: 23 }, (_, i) => { const x = -200 + i * 72; return `<line x1="${x}" y1="${H}" x2="${W / 2 + (x - W / 2) * 0.25}" y2="470"/>`; }).join('')}
    ${[478, 492, 512, 540, 578, 630].map((y) => `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`).join('')}
  </g>
  <rect y="470" width="${W}" height="${H - 470}" fill="url(#floor)"/>

  <!-- stars -->
  <g fill="#fff">${Array.from({ length: 46 }, (_, i) => { const x = (i * 263.7) % W, y = (i * 97.3) % 440; return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${i % 5 ? 0.9 : 1.6}" opacity="${0.15 + (i % 4) * 0.12}"/>`; }).join('')}</g>

  <!-- beams from the request to the model -->
  ${beam('M500 238 C 580 238, 600 270, 660 290', '#7ee0c3', 0)}
  ${beam('M500 300 C 570 300, 600 300, 650 305', '#ffb547', 0.2)}
  ${beam('M500 362 C 580 362, 600 330, 660 320', '#c49bff', 0.4)}

  <!-- terminal -->
  <g>
    <rect x="58" y="128" width="446" height="336" rx="18" fill="url(#term)" stroke="#7ee0c3" stroke-opacity="0.45"/>
    <rect x="58" y="128" width="446" height="336" rx="18" fill="none" stroke="#7ee0c3" stroke-opacity="0.25" stroke-width="6" filter="url(#soft)"/>
    <circle cx="86" cy="154" r="6" fill="#ff5f57"/><circle cx="106" cy="154" r="6" fill="#febc2e"/><circle cx="126" cy="154" r="6" fill="#28c840"/>
    <text x="482" y="159" text-anchor="end" font-family="${MONO}" font-size="12" fill="#5d6680">api.assetbench</text>
    <line x1="58" y1="176" x2="504" y2="176" stroke="#ffffff" stroke-opacity="0.07"/>
    ${term}
    <rect x="96" y="440" width="9" height="16" fill="#7ee0c3"><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1s" repeatCount="indefinite"/></rect>
  </g>

  <!-- the model -->
  <ellipse cx="${CX}" cy="${CY + 196}" rx="170" ry="22" fill="#000" opacity="0.55" filter="url(#soft)"/>
  <circle cx="${CX}" cy="${CY}" r="${R * 1.9}" fill="url(#halo)"/>
  <g>
    <animateTransform attributeName="transform" type="translate" values="0 0;0 -10;0 0" dur="5s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"/>
    <g clip-path="url(#before)" fill="none" stroke="#7ee0c3" stroke-opacity="0.55" stroke-width="0.7">${wire}</g>
    <g clip-path="url(#after)" stroke="#1a1030" stroke-opacity="0.35" stroke-width="0.8" stroke-linejoin="round">${solid}</g>
    <rect x="${SCAN_MID - 14}" y="${CY - R * 1.2}" width="28" height="${R * 2.4}" fill="url(#scan)" opacity="0.85">${scanAnim('x', SCAN_FROM - 14, SCAN_TO - 14)}</rect>
  </g>

  ${chip(598, 70, 236, 'TRIANGLES', '21,781', '−74%', '#ffb547')}
  ${chip(856, 70, 206, 'FILE SIZE', '4.3 MB', '−70%', '#7ee0c3')}

  <!-- LOD chain -->
  <g font-family="${MONO}" font-size="12" fill="#c49bff">
    ${[0, 1, 2].map((i) => `<g transform="translate(${1010 + i * 22} ${200 + i * 58})"><rect width="${120 - i * 22}" height="40" rx="9" fill="#c49bff" fill-opacity="${0.16 - i * 0.04}" stroke="#c49bff" stroke-opacity="${0.7 - i * 0.18}"/><text x="12" y="25">LOD${i}</text></g>`).join('')}
  </g>

  <!-- devices and engines -->
  ${pill(640, 520, 'Phone ✓', '#7ee0c3')}${pill(748, 520, 'Quest ✓', '#7ee0c3')}${pill(856, 520, 'Web ✓', '#7ee0c3')}
  <text x="640" y="584" font-family="${SANS}" font-size="13" font-weight="600" fill="#8b93a7" letter-spacing="0.08em">UNITY · UNREAL · GODOT · ROBLOX · WEB</text>

  <!-- app store assets -->
  <g>
    ${icon(64, 500, 72, 17)}${icon(150, 514, 56, 13)}${icon(220, 526, 44, 10)}${icon(278, 536, 34, 8)}${icon(326, 544, 26, 6)}
    <text x="64" y="604" font-family="${SANS}" font-size="13" font-weight="600" fill="#8b93a7" letter-spacing="0.08em">EVERY APP ICON · EVERY STORE SIZE</text>
  </g>

  <text x="60" y="84" font-family="${SANS}" font-size="15" font-weight="800" fill="#ffb547" letter-spacing="0.22em">ASSETBENCH CLOUD API</text>
  <text x="60" y="108" font-family="${SANS}" font-size="13" fill="#8b93a7">One request. Game-ready files back.</text>
</svg>
`;

const svgPath = join(ROOT, 'public/images/api-poster.svg');
await writeFile(svgPath, svg);
await sharp(Buffer.from(svg), { density: 144 }).resize(1600).webp({ quality: 88 }).toFile(join(ROOT, 'public/images/api-poster.webp'));
console.log(`api poster: ${low.length} low-poly faces over ${high.length} wireframe faces; ${(svg.length / 1024).toFixed(0)} KB svg`);
