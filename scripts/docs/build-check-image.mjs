// Draws a real /check response as the annotated image on the API page:
//   node scripts/docs/build-check-image.mjs check.json public/docs/img/check-response.webp
// where check.json is the report from POST /api/v1/check (role=character, device=mid).
import sharp from 'sharp';
const [,, input, out] = process.argv;
const r = JSON.parse((await import('node:fs')).readFileSync(input, 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const C = { key: '#C9CED6', str: '#9FE3B8', num: '#FFC861', punct: '#5E5C59', note: '#8C8A86', ok: '#3DDC84', bad: '#FF6B5E', ink: '#F3EFE6' };
// Each line: array of [text, colour] spans, plus an optional note on the right.
const k = (t) => [`"${t}"`, C.key], p = (t) => [t, C.punct], s = (t) => [`"${t}"`, C.str], n = (t) => [String(t), C.num];
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
const st = r.stats, ev = r.evaluation;
const check = (key) => ev.checks.find((c) => c.key === key);
const row = (key, label) => { const c = check(key); return [[p('    { '), k('name'), p(': '), s(c.name.replace(/ \(.*\)/, '')), p(', '), k('value'), p(': '), n(c.value), p(', '), k('budget'), p(': '), n(c.budget), p(', '), k('status'), p(': '), [`"${c.status}"`, c.status === 'pass' ? C.ok : C.bad], p(' },')], label]; };
const lines = [
  [[p('{')]],
  [[p('  '), k('stats'), p(': {')], 'What is in the file'],
  [[p('    '), k('fileBytes'), p(': '), n(st.fileBytes), p(',')], mb(st.fileBytes) + ' on disk'],
  [[p('    '), k('triangles'), p(': '), n(st.triangles), p(', '), k('drawCalls'), p(': '), n(st.drawCalls), p(',')], 'Geometry and draw calls'],
  [[p('    '), k('textureMemoryBytes'), p(': '), n(st.textureMemoryBytes), p(',')], mb(st.textureMemoryBytes) + ' of GPU memory'],
  [[p('    '), k('largestTexture'), p(': '), n(st.largestTexture), p(', '), k('skins'), p(': '), n(st.skins), p(', '), k('animations'), p(': '), n(st.animations)], 'Pixels · rigs · clips'],
  [[p('  },')]],
  [[p('  '), k('evaluation'), p(': {')], 'Scored against your role + device'],
  [[p('    '), k('target'), p(': '), s(ev.target), p(',')], ev.targetName],
  [[p('    '), k('score'), p(': '), n(ev.score), p(',')], '0–100 · 90+ mobile-ready'],
  [[p('    '), k('verdict'), p(': '), [`"${ev.verdict}"`, C.bad], p(',')], 'mobile-ready · needs-work · not-ready'],
  [[p('    '), k('checks'), p(': [')], 'One per budget: your value vs the limit'],
  row('triangles', '4.2× over: reduce or add LODs'),
  row('textureMemory', '5.3× over: shrink textures'),
  row('drawCalls', 'Within budget'),
  [[p('      … '), n(ev.checks.length - 3), p(' more (materials, bones, file size, compression…)')]],
  [[p('    ]')]],
  [[p('  },')]],
  [[p('  '), k('devices'), p(': { '), k('results'), p(': [')], 'The same model, every device class'],
  ...r.devices.results.map((d) => [[p('    { '), k('device'), p(': '), s(d.device), p(', '), k('score'), p(': '), n(d.score), p(', '), k('triangleBudget'), p(': '), n(d.triangleBudget), p(' },')], d.name]),
  [[p('  ] }')]],
  [[p('}')]],
];
const W = 1720, top = 180, lh = 40, H = top + lines.length * lh + 50, codeX = 48, noteX = 1250;
const text = lines.map(([spans, note], i) => {
  const y = top + i * lh;
  const code = `<text x="${codeX}" y="${y}" xml:space="preserve">${spans.map(([t, c]) => `<tspan fill="${c}">${esc(t)}</tspan>`).join('')}</text>`;
  const ann = note ? `<line x1="${noteX - 26}" y1="${y - 7}" x2="${noteX - 10}" y2="${y - 7}" stroke="#2E3138" stroke-width="2"/><text x="${noteX}" y="${y}" class="note">${esc(note)}</text>` : '';
  return code + ann;
}).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>text{font-family:Consolas,'JetBrains Mono',monospace;font-size:22px} .note{font-family:'Segoe UI',Inter,sans-serif;font-size:21px;fill:${C.note}} .h{font-family:'Segoe UI',Inter,sans-serif}</style>
<rect width="${W}" height="${H}" rx="24" fill="#0B0C0E"/><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="23" fill="none" stroke="#24262B" stroke-width="2"/>
<rect x="${noteX - 40}" y="${top - 80}" width="${W - noteX + 16}" height="${H - top - 10}" rx="14" fill="#111214"/>
<rect x="${codeX}" y="34" width="84" height="38" rx="8" fill="#C9CED6"/><text x="${codeX + 42}" y="61" text-anchor="middle" font-weight="700" fill="#0B0C0E">POST</text>
<text x="${codeX + 104}" y="61" fill="${C.ink}" font-weight="700">/api/v1/check</text>
<text x="${codeX + 330}" y="61" fill="${C.note}">file=@sunny-gecko.glb  role=character  device=mid  engine=unity</text>
<text x="${noteX - 12}" y="${top - 44}" class="h" font-size="15" font-weight="700" letter-spacing="3" fill="#5E5C59">WHAT IT MEANS</text>
<text x="${codeX}" y="${top - 44}" class="h" font-size="15" font-weight="700" letter-spacing="3" fill="#5E5C59">200 OK · REAL RESPONSE, TRIMMED</text>
${text}
</svg>`;
await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(out);
console.log('wrote', out, W, H);
