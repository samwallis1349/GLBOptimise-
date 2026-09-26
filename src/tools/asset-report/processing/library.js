import { ISSUE_LABELS } from '../config.js';

/**
 * Pure helpers over the library: a list of items
 *   { id, name, status: 'ok'|'error', error?, analysis?, thumb? }
 * where `analysis` is analyseAsset()'s result minus `rawJson`.
 */

export const ok = (items) => items.filter((i) => i.status === 'ok');

export const budgetFor = (analysis, target) => analysis.budgets.find((b) => b.id === target);

export const maxTexture = (analysis) => Math.max(0, ...analysis.textures.map((t) => Math.max(t.width, t.height)));

export function summarise(items, target) {
  const good = ok(items);
  const sum = (fn) => good.reduce((s, i) => s + fn(i.analysis), 0);
  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const budgets = { pass: 0, warn: 0, fail: 0 };
  const issueMap = new Map();

  for (const { analysis } of good) {
    grades[analysis.health.grade]++;
    budgets[budgetFor(analysis, target).status]++;
    const seen = new Set();
    for (const issue of analysis.issues) {
      if (seen.has(issue.code)) continue;
      seen.add(issue.code);
      const entry = issueMap.get(issue.code) || { code: issue.code, label: ISSUE_LABELS[issue.code] || issue.title, severity: issue.severity, fix: issue.fix, count: 0 };
      entry.count++;
      issueMap.set(issue.code, entry);
    }
  }

  const rank = { error: 0, warning: 1, info: 2 };
  const topIssues = [...issueMap.values()].sort((a, b) => b.count - a.count || rank[a.severity] - rank[b.severity]).slice(0, 5);
  const by = (fn) => [...good].sort((a, b) => fn(b.analysis) - fn(a.analysis)).slice(0, 5);

  return {
    total: items.length,
    okCount: good.length,
    failed: items.length - good.length,
    bytes: sum((a) => a.file.bytes),
    triangles: sum((a) => a.totals.triangles),
    drawCalls: sum((a) => a.totals.drawCalls),
    gpuBytes: sum((a) => a.gpu.totalBytes),
    avgScore: good.length ? Math.round(sum((a) => a.health.score) / good.length) : 0,
    grades,
    budgets,
    topIssues,
    largestBySize: by((a) => a.file.bytes),
    largestByTris: by((a) => a.totals.triangles),
  };
}

/** Column definitions: key → sort value. Failed rows always sort last. */
export const COLUMNS = [
  { key: 'thumb', label: '', sortable: false },
  { key: 'name', label: 'Asset', value: (i) => i.name.toLowerCase(), text: true },
  { key: 'score', label: 'Score', value: (i) => i.analysis.health.score },
  { key: 'bytes', label: 'Size', value: (i) => i.analysis.file.bytes },
  { key: 'triangles', label: 'Triangles', value: (i) => i.analysis.totals.triangles },
  { key: 'drawCalls', label: 'Draws', value: (i) => i.analysis.totals.drawCalls },
  { key: 'materials', label: 'Mats', value: (i) => i.analysis.totals.materials },
  { key: 'textures', label: 'Tex', value: (i) => i.analysis.totals.textures },
  { key: 'maxTexture', label: 'Max tex', value: (i) => maxTexture(i.analysis) },
  { key: 'animations', label: 'Anims', value: (i) => i.analysis.totals.animations },
  { key: 'budget', label: 'Budget', value: (i, target) => ({ pass: 0, warn: 1, fail: 2 })[budgetFor(i.analysis, target).status] },
  { key: 'issues', label: 'Issues', value: (i) => i.analysis.health.counts.error * 10000 + i.analysis.health.counts.warning * 100 + i.analysis.health.counts.info },
];

export function sortItems(items, sort, target) {
  const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[1];
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ok' ? -1 : 1;
    if (a.status !== 'ok') return a.name.localeCompare(b.name);
    const va = col.value(a, target);
    const vb = col.value(b, target);
    if (col.text) return va.localeCompare(vb) * dir;
    return (va - vb) * dir;
  });
}

export function filterItems(items, filters, target) {
  const q = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (q && !item.name.toLowerCase().includes(q)) return false;
    if (filters.failed) return item.status !== 'ok';
    if (item.status !== 'ok') return !filters.grades.size && !filters.budget && !filters.errors;
    const a = item.analysis;
    if (filters.grades.size && !filters.grades.has(a.health.grade)) return false;
    if (filters.budget && budgetFor(a, target).status !== 'fail') return false;
    if (filters.errors && !a.health.counts.error) return false;
    return true;
  });
}
