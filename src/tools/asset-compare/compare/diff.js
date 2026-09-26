import { BOUNDS_TOLERANCE, BYTE_CATEGORIES, METRICS } from '../config.js';
import { fmtBytes, fmtCount, fmtDelta, fmtPct, fmtValue, pxLabel } from './format.js';

/**
 * Pure A→B comparison of two analyses from shared/glb/analyseGLB.js.
 * Nothing here touches the DOM, so the same result drives the UI, the
 * JSON export and the Markdown summary.
 */

const SLOT_LABELS = { baseColor: 'base colour map', metallicRoughness: 'metal/rough map', normal: 'normal map', occlusion: 'occlusion map', emissive: 'emissive map' };

export function compareAnalyses(A, B) {
  const metrics = METRICS.map((m) => metricRow(m, A, B));
  const byKey = Object.fromEntries(metrics.map((m) => [m.key, m]));

  const bytes = BYTE_CATEGORIES.map((c) => ({ ...c, a: A.bytes[c.key] || 0, b: B.bytes[c.key] || 0, delta: (B.bytes[c.key] || 0) - (A.bytes[c.key] || 0) }));

  const budgets = A.budgets.map((ta) => {
    const tb = B.budgets.find((t) => t.id === ta.id);
    const changes = ta.metrics
      .map((ma) => {
        const mb = tb?.metrics.find((m) => m.key === ma.key);
        return mb && mb.status !== ma.status ? { label: ma.label, a: ma.status, b: mb.status } : null;
      })
      .filter(Boolean);
    return { id: ta.id, label: ta.label, a: ta.status, b: tb?.status || 'fail', changes };
  });

  const issues = diffIssues(A.issues, B.issues);

  const textures = pairItems(A.textures, B.textures, (t) => t.name, true).map((p) => ({
    ...p,
    changed: p.a && p.b ? p.a.width !== p.b.width || p.a.height !== p.b.height || p.a.format !== p.b.format || p.a.byteLength !== p.b.byteLength : true,
  }));

  const materials = pairItems(A.materials, B.materials, (m) => m.name, false).map((p) => {
    if (!p.a || !p.b) return { ...p, changes: [], lostSlots: [], addedSlots: [] };
    const slotsA = Object.keys(p.a.textures);
    const slotsB = Object.keys(p.b.textures);
    const changes = [];
    if (p.a.alphaMode !== p.b.alphaMode) changes.push(`alpha ${p.a.alphaMode} → ${p.b.alphaMode}`);
    if (p.a.doubleSided !== p.b.doubleSided) changes.push(p.b.doubleSided ? 'now double-sided' : 'no longer double-sided');
    const lostSlots = slotsA.filter((s) => !slotsB.includes(s));
    const addedSlots = slotsB.filter((s) => !slotsA.includes(s));
    lostSlots.forEach((s) => changes.push(`lost ${SLOT_LABELS[s] || s}`));
    addedSlots.forEach((s) => changes.push(`gained ${SLOT_LABELS[s] || s}`));
    return { ...p, changes, lostSlots, addedSlots };
  });

  const animations = pairItems(A.animations, B.animations, (x) => x.name, false);
  const meshes = pairItems(A.meshes, B.meshes, (x) => x.name, false);

  const regressions = findRegressions({ A, B, byKey, issues, materials, animations });
  const verdict = buildVerdict({ byKey, regressions, animations, materials });

  return { metrics, bytes, budgets, issues, textures, materials, animations, meshes, regressions, verdict };
}

function metricRow(m, A, B) {
  const a = m.read(A);
  const b = m.read(B);
  const valid = Number.isFinite(a) && Number.isFinite(b);
  const delta = valid ? b - a : null;
  const pct = !valid ? null : a === 0 ? (b === 0 ? 0 : Infinity) : ((b - a) / Math.abs(a)) * 100;
  // A percentage of a 0–100 score reads oddly; the point delta says it all.
  const shownPct = m.kind === 'score' ? null : pct;
  let status = 'same';
  if (!valid) status = a == null && b == null ? 'same' : 'neutral';
  else if (Math.abs(delta) > 1e-9 && (a === 0 || Math.abs(pct) >= 0.05)) {
    if (m.bounds) status = Math.abs(pct) / 100 > BOUNDS_TOLERANCE || !Number.isFinite(pct) ? 'bad' : 'neutral';
    else if (m.better === 'neutral') status = 'neutral';
    else if (m.better === 'lower') status = delta < 0 ? 'good' : 'bad';
    else status = delta > 0 ? 'good' : 'bad';
  }
  return { key: m.key, label: m.label, group: m.group, kind: m.kind, better: m.better, a, b, delta, pct: shownPct, status };
}

/**
 * Pairs items by exact name first. With `byPosition`, leftovers are then
 * paired in order (textures are often unnamed or renamed by exporters);
 * otherwise leftovers are reported as removed (a) / added (b).
 */
export function pairItems(listA, listB, nameOf, byPosition) {
  const pairs = [];
  const usedB = new Set();
  const indexB = new Map();
  listB.forEach((x, i) => {
    const n = nameOf(x);
    if (!indexB.has(n)) indexB.set(n, []);
    indexB.get(n).push(i);
  });
  const leftA = [];
  for (const x of listA) {
    const j = indexB.get(nameOf(x))?.find((i) => !usedB.has(i));
    if (j != null) {
      usedB.add(j);
      pairs.push({ a: x, b: listB[j], by: 'name' });
    } else {
      leftA.push(x);
    }
  }
  const leftB = listB.filter((_, i) => !usedB.has(i));
  const n = byPosition ? Math.min(leftA.length, leftB.length) : 0;
  for (let i = 0; i < n; i++) pairs.push({ a: leftA[i], b: leftB[i], by: 'position' });
  leftA.slice(n).forEach((a) => pairs.push({ a, b: null, by: 'removed' }));
  leftB.slice(n).forEach((b) => pairs.push({ a: null, b, by: 'added' }));
  return pairs;
}

function diffIssues(issuesA, issuesB) {
  const codesA = new Map(issuesA.map((i) => [i.code, i]));
  const codesB = new Map(issuesB.map((i) => [i.code, i]));
  return {
    fixed: issuesA.filter((i) => !codesB.has(i.code)),
    added: issuesB.filter((i) => !codesA.has(i.code)),
    remaining: issuesB.filter((i) => codesA.has(i.code)).map((i) => ({ ...i, before: codesA.get(i.code) })),
  };
}

function findRegressions({ A, B, byKey, issues, materials, animations }) {
  const out = [];
  const add = (severity, text) => out.push({ severity, text });

  const lostAnims = animations.filter((p) => p.a && !p.b).map((p) => p.a.name);
  if (lostAnims.length) add('bad', `Lost ${lostAnims.length} animation${lostAnims.length === 1 ? '' : 's'}: ${list(lostAnims)}`);
  for (const p of animations.filter((x) => x.a && x.b)) {
    if (p.b.channelCount < p.a.channelCount) add('warn', `Animation "${p.a.name}" lost ${p.a.channelCount - p.b.channelCount} channel${p.a.channelCount - p.b.channelCount === 1 ? '' : 's'}`);
    if (p.a.duration > 0 && Math.abs(p.b.duration - p.a.duration) / p.a.duration > 0.01) add('warn', `Animation "${p.a.name}" length changed ${p.a.duration.toFixed(2)}s → ${p.b.duration.toFixed(2)}s`);
  }

  const lostMats = materials.filter((p) => p.a && !p.b).map((p) => p.a.name);
  if (lostMats.length) add('warn', `${lostMats.length} material${lostMats.length === 1 ? '' : 's'} removed: ${list(lostMats)}`);
  for (const p of materials) {
    if (p.lostSlots?.length) add('bad', `Material "${p.a.name}" lost its ${p.lostSlots.map((s) => SLOT_LABELS[s] || s).join(', ')}`);
  }

  const lostTex = A.totals.textures - B.totals.textures;
  if (lostTex > 0) add('warn', `${lostTex} fewer texture${lostTex === 1 ? '' : 's'} (${A.totals.textures} → ${B.totals.textures})`);

  if (B.totals.skins < A.totals.skins) add('bad', `Lost ${A.totals.skins - B.totals.skins} skin${A.totals.skins - B.totals.skins === 1 ? '' : 's'} — the rig is gone`);
  else if (B.totals.joints < A.totals.joints) add('warn', `Joint count dropped ${A.totals.joints} → ${B.totals.joints}`);
  if (B.totals.morphTargets < A.totals.morphTargets) add('bad', `Lost morph targets (${A.totals.morphTargets} → ${B.totals.morphTargets})`);

  if (A.bounds && !B.bounds) add('bad', 'B has no measurable geometry bounds');
  else if (A.bounds && B.bounds) {
    const axes = ['boundsX', 'boundsY', 'boundsZ'].map((k) => byKey[k]).filter((m) => m.status === 'bad');
    if (axes.length) add('bad', `Size changed by more than ${BOUNDS_TOLERANCE * 100}%: ${axes.map((m) => `${m.label.slice(-1)} ${fmtValue(m.a, 'units')} → ${fmtValue(m.b, 'units')} (${fmtPct(m.pct)})`).join(', ')}`);
  }

  const newErrors = issues.added.filter((i) => i.severity === 'error');
  newErrors.forEach((i) => add('bad', `New error: ${i.title}`));
  issues.added.filter((i) => i.severity !== 'error' && ['no-normals', 'textured-no-uv', 'missing-resources'].includes(i.code)).forEach((i) => add('bad', `Introduced: ${i.title}`));

  return out;
}

function list(names, max = 4) {
  const shown = names.slice(0, max).map((n) => `"${n}"`).join(', ');
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

function buildVerdict({ byKey, regressions, animations, materials }) {
  const size = byKey.fileBytes;
  const tris = byKey.triangles;
  const score = byKey.health;
  const clauses = [];

  if (size.status === 'same') clauses.push(`B is the same size (${fmtBytes(size.b)})`);
  else if (size.delta < 0) clauses.push(`B is ${pctWords(100 - (size.b / size.a) * 100)} smaller (${fmtBytes(size.a)} → ${fmtBytes(size.b)})`);
  else clauses.push(`B is ${growth(size.a, size.b)} larger (${fmtBytes(size.a)} → ${fmtBytes(size.b)})`);

  if (tris.status === 'same') clauses.push('has the same triangle count');
  else if (tris.delta < 0) clauses.push(`has ${pctWords(Math.abs(tris.pct))} fewer triangles`);
  else clauses.push(tris.a ? `has ${growth(tris.a, tris.b)} more triangles` : 'adds triangles');

  const pts = Math.round(score.delta);
  if (pts === 0) clauses.push(`scores the same (${score.b})`);
  else clauses.push(`scores ${Math.abs(pts)} point${Math.abs(pts) === 1 ? '' : 's'} ${pts > 0 ? 'higher' : 'lower'}`);

  const sentences = [`${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}.`];

  const maxA = byKey.maxTexture.a;
  const maxB = byKey.maxTexture.b;
  if (maxA && !maxB) sentences.push('B has no textures at all.');
  else if (!maxA && maxB) sentences.push(`B adds textures (up to ${pxLabel(maxB)}).`);
  else if (maxA !== maxB) sentences.push(`Textures ${maxB < maxA ? 'dropped' : 'grew'} from ${pxLabel(maxA)} to ${pxLabel(maxB)}.`);

  const lostAnim = animations.some((p) => p.a && !p.b);
  const lostMat = materials.some((p) => p.a && !p.b);
  if (!lostAnim && !lostMat) sentences.push('No animations or materials were lost.');

  const bad = regressions.filter((r) => r.severity === 'bad').length;
  const warn = regressions.length - bad;
  const unchanged = size.status === 'same' && score.delta === 0 && tris.status === 'same';
  const better = !unchanged && size.delta <= 0 && score.delta >= 0 && tris.delta <= 0;
  const worse = !unchanged && size.delta >= 0 && score.delta <= 0 && tris.delta >= 0;
  const tone = bad ? 'regression' : unchanged ? 'same' : better ? 'better' : worse ? 'worse' : 'mixed';
  const extra = warn ? ` and ${warn} thing${warn === 1 ? '' : 's'} to check` : '';
  const headline = {
    regression: `B has ${bad} regression${bad === 1 ? '' : 's'}${extra}`,
    better: warn ? `B is an improvement, with ${warn} thing${warn === 1 ? '' : 's'} to check` : 'B is an improvement',
    worse: 'B is heavier than A on every headline number',
    same: 'No meaningful difference',
    mixed: warn ? `Mixed result, ${warn} thing${warn === 1 ? '' : 's'} to check` : 'Mixed result',
  }[tone];
  return { tone, headline, text: sentences.join(' ') };
}

/** "62%" for modest growth, "12.5×" once B is at least double A. */
function growth(a, b) {
  const ratio = b / a;
  return ratio >= 2 ? `${ratio >= 10 ? Math.round(ratio) : Number(ratio.toFixed(1))}×` : pctWords((ratio - 1) * 100);
}

function pctWords(p) {
  return `${p >= 10 ? Math.round(p) : Number(p.toFixed(1))}%`;
}

/** Markdown summary for pasting into a PR, ticket or chat. */
export function toMarkdown(result, A, B) {
  const lines = [
    `## Asset Compare: ${A.file.name} → ${B.file.name}`,
    '',
    `**${result.verdict.headline}.** ${result.verdict.text}`,
    '',
    '| Metric | A | B | Change |',
    '| --- | ---: | ---: | ---: |',
    ...result.metrics.filter((m) => m.a != null || m.b != null).map((m) => `| ${m.label} | ${fmtValue(m.a, m.kind)} | ${fmtValue(m.b, m.kind)} | ${fmtDelta(m.delta, m.kind)}${m.pct == null ? '' : ` (${fmtPct(m.pct)})`} |`),
  ];
  if (result.regressions.length) lines.push('', '### Check these', ...result.regressions.map((r) => `- ${r.severity === 'bad' ? '⚠️' : '•'} ${r.text}`));
  if (result.issues.fixed.length) lines.push('', '### Fixed', ...result.issues.fixed.map((i) => `- ${i.title}`));
  if (result.issues.added.length) lines.push('', '### New issues', ...result.issues.added.map((i) => `- [${i.severity}] ${i.title}`));
  lines.push('', `Budgets: ${result.budgets.map((b) => `${b.label} ${b.a} → ${b.b}`).join(' · ')}`);
  lines.push('', `_Generated by Asset Bench · ${fmtCount(A.totals.triangles)} → ${fmtCount(B.totals.triangles)} triangles_`);
  return lines.join('\n');
}

/** JSON export: both summaries plus the full diff, without raw glTF JSON. */
export function toJson(result, A, B) {
  const strip = ({ rawJson: _raw, ...rest }) => rest;
  return JSON.stringify({ tool: 'asset-bench/asset-compare', generatedAt: new Date().toISOString(), a: strip(A), b: strip(B), diff: result }, null, 2);
}
