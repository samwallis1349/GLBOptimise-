import { BUDGET_TARGETS } from '../../../shared/glb/statistics.js';
import { budgetFor, maxTexture, summarise } from './library.js';
import { formatBytes, formatNumber } from '../ui/format.js';

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  // Guard against spreadsheet formula injection from file-derived names.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const CSV_COLUMNS = [
  ['name', (i) => i.name],
  ['status', (i) => i.status],
  ['error', (i) => i.error || ''],
  ['grade', (a) => a?.health.grade],
  ['score', (a) => a?.health.score],
  ['verdict', (a) => a?.health.summary],
  ['file_bytes', (a) => a?.file.bytes],
  ['format', (a) => a?.file.kind],
  ['generator', (a) => a?.file.generator],
  ['triangles', (a) => a?.totals.triangles],
  ['vertices', (a) => a?.totals.vertices],
  ['draw_calls', (a) => a?.totals.drawCalls],
  ['nodes', (a) => a?.totals.nodes],
  ['meshes', (a) => a?.totals.meshes],
  ['primitives', (a) => a?.totals.primitives],
  ['materials', (a) => a?.totals.materials],
  ['textures', (a) => a?.totals.textures],
  ['max_texture_px', (a) => a && maxTexture(a)],
  ['animations', (a) => a?.totals.animations],
  ['skins', (a) => a?.totals.skins],
  ['joints', (a) => a?.totals.joints],
  ['morph_targets', (a) => a?.totals.morphTargets],
  ['geometry_bytes', (a) => a?.bytes.geometry],
  ['texture_bytes', (a) => a?.bytes.textures],
  ['animation_bytes', (a) => a?.bytes.animation],
  ['gpu_bytes_est', (a) => a?.gpu.totalBytes],
  ['size_x', (a) => a?.bounds?.size[0]?.toFixed(4)],
  ['size_y', (a) => a?.bounds?.size[1]?.toFixed(4)],
  ['size_z', (a) => a?.bounds?.size[2]?.toFixed(4)],
  ['extensions', (a) => a?.extensions.raw.join(' ')],
  ...BUDGET_TARGETS.map((t) => [`budget_${t.id}`, (a) => a && budgetFor(a, t.id).status]),
  ['errors', (a) => a?.health.counts.error],
  ['warnings', (a) => a?.health.counts.warning],
  ['infos', (a) => a?.health.counts.info],
  ['issue_codes', (a) => a?.issues.map((x) => x.code).join(' ')],
];

export function toCsv(items) {
  const header = CSV_COLUMNS.map(([name]) => name).join(',');
  const rows = items.map((item) =>
    CSV_COLUMNS.map(([name, fn], idx) => csvCell(idx < 3 ? fn(item) : fn(item.analysis))).join(','),
  );
  // BOM so Excel opens UTF-8 names correctly.
  return `﻿${[header, ...rows].join('\r\n')}\r\n`;
}

export function toJson(items, target) {
  const summary = summarise(items, target);
  return JSON.stringify(
    {
      generator: 'Asset Bench · Asset Report',
      generatedAt: new Date().toISOString(),
      target,
      summary: {
        assets: summary.total,
        analysed: summary.okCount,
        failed: summary.failed,
        totalBytes: summary.bytes,
        totalTriangles: summary.triangles,
        totalGpuBytesEstimate: summary.gpuBytes,
        averageScore: summary.avgScore,
        grades: summary.grades,
        budgets: summary.budgets,
        topIssues: summary.topIssues.map(({ code, label, severity, count }) => ({ code, label, severity, assets: count })),
      },
      assets: items.map((i) => (i.status === 'ok' ? i.analysis : { file: { name: i.name }, error: i.error })),
    },
    null,
    2,
  );
}

export function toMarkdown(items, target) {
  const s = summarise(items, target);
  const targetLabel = BUDGET_TARGETS.find((t) => t.id === target)?.label || target;
  const lines = [
    '# Asset Bench — library report',
    '',
    `- **Assets:** ${s.total}${s.failed ? ` (${s.failed} unreadable)` : ''}`,
    `- **Total size:** ${formatBytes(s.bytes)}`,
    `- **Total triangles:** ${formatNumber(s.triangles)}`,
    `- **Est. GPU memory:** ${formatBytes(s.gpuBytes)}`,
    `- **Average health:** ${s.avgScore}/100`,
    `- **Grades:** ${Object.entries(s.grades).map(([g, n]) => `${g} ${n}`).join(' · ')}`,
    `- **${targetLabel} budget:** ${s.budgets.pass} pass · ${s.budgets.warn} near · ${s.budgets.fail} over`,
    '',
  ];
  if (s.topIssues.length) {
    lines.push('## Most common issues', '');
    s.topIssues.forEach((x) => lines.push(`- ${x.label} — ${x.count} asset${x.count === 1 ? '' : 's'}${x.fix ? ` (fix: ${x.fix.label})` : ''}`));
    lines.push('');
  }
  lines.push('## Assets', '', '| Asset | Grade | Size | Triangles | Budget |', '|---|---|---|---|---|');
  for (const i of items) {
    if (i.status !== 'ok') lines.push(`| ${i.name} | — | — | — | unreadable |`);
    else lines.push(`| ${i.name.replace(/\|/g, '\\|')} | ${i.analysis.health.grade} (${i.analysis.health.score}) | ${formatBytes(i.analysis.file.bytes)} | ${formatNumber(i.analysis.totals.triangles)} | ${budgetFor(i.analysis, target).status} |`);
  }
  return `${lines.join('\n')}\n`;
}
