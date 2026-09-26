/**
 * Derived numbers on top of an analysis: a 0–100 health score with a
 * letter grade, and pass/warn/fail against per-platform budgets. Kept
 * separate from analyseGLB.js so raw measurement and opinionated scoring
 * have independent boundaries.
 */

const MB = 1024 * 1024;

const PENALTY = { error: 18, warning: 7, info: 1.5 };
// The score is judged against the web target: each web budget miss costs extra.
const BUDGET_PENALTY = { warn: 4, fail: 10 };
const SCORE_TARGET = 'web';

/**
 * @param {{ severity: 'error'|'warning'|'info' }[]} issues
 * @param {ReturnType<typeof evaluateBudgets>} [budgets]
 */
export function scoreIssues(issues, budgets = []) {
  const web = budgets.find((b) => b.id === SCORE_TARGET);
  const budgetPenalty = web ? web.metrics.reduce((sum, m) => sum + (BUDGET_PENALTY[m.status] || 0), 0) : 0;
  const penalty = issues.reduce((sum, issue) => sum + PENALTY[issue.severity], 0) + budgetPenalty;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F';
  const counts = { error: 0, warning: 0, info: 0 };
  issues.forEach((i) => counts[i.severity]++);
  const summary =
    score >= 90 ? 'Game-ready' : score >= 80 ? 'Good, minor tweaks' : score >= 70 ? 'Needs some work' : score >= 55 ? 'Heavy for realtime' : 'Not realtime-ready';
  return { score, grade, summary, counts };
}

/**
 * Realtime budgets per target. These are pragmatic per-asset guides for a
 * single hero/prop asset, not hard engine limits.
 */
export const BUDGET_TARGETS = [
  { id: 'mobile', label: 'Mobile', fileBytes: 5 * MB, triangles: 50_000, drawCalls: 20, maxTexture: 1024, gpuBytes: 64 * MB },
  { id: 'vr', label: 'Standalone VR', fileBytes: 10 * MB, triangles: 100_000, drawCalls: 30, maxTexture: 2048, gpuBytes: 128 * MB },
  { id: 'web', label: 'Web / WebGL', fileBytes: 10 * MB, triangles: 150_000, drawCalls: 50, maxTexture: 2048, gpuBytes: 256 * MB },
  { id: 'desktop', label: 'Desktop / Console', fileBytes: 50 * MB, triangles: 1_000_000, drawCalls: 200, maxTexture: 4096, gpuBytes: 1024 * MB },
];

export const BUDGET_METRICS = [
  { key: 'fileBytes', label: 'File size', read: (a) => a.file.bytes, unit: 'bytes' },
  { key: 'triangles', label: 'Triangles', read: (a) => a.totals.triangles, unit: 'count' },
  { key: 'drawCalls', label: 'Draw calls', read: (a) => a.totals.drawCalls, unit: 'count' },
  { key: 'maxTexture', label: 'Largest texture', read: (a) => Math.max(0, ...a.textures.map((t) => Math.max(t.width, t.height))), unit: 'px' },
  { key: 'gpuBytes', label: 'Est. GPU memory', read: (a) => a.gpu.totalBytes, unit: 'bytes' },
];

/** status: 'pass' (≤ budget), 'warn' (≤ 1.5× budget), 'fail'. */
export function evaluateBudgets(analysis) {
  return BUDGET_TARGETS.map((target) => {
    const metrics = BUDGET_METRICS.map((m) => {
      const value = m.read(analysis);
      const limit = target[m.key];
      const status = value <= limit ? 'pass' : value <= limit * 1.5 ? 'warn' : 'fail';
      return { key: m.key, label: m.label, unit: m.unit, value, limit, status };
    });
    const status = metrics.some((m) => m.status === 'fail') ? 'fail' : metrics.some((m) => m.status === 'warn') ? 'warn' : 'pass';
    return { id: target.id, label: target.label, status, metrics };
  });
}
