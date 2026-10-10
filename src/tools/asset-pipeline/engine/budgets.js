/**
 * File-size and performance budgets. Each limit has a warning and a failure
 * threshold (0 disables that side). Values are measured on the final output.
 */

const MB = 1048576;

export const BUDGET_METRICS = [
  { id: 'fileMB', label: 'File size', unit: 'MB', value: (m) => m.fileBytes / MB },
  { id: 'triangles', label: 'Triangles', unit: '', value: (m) => m.triangles },
  { id: 'textureSize', label: 'Largest texture', unit: 'px', value: (m) => m.maxTexture },
  { id: 'gpuMB', label: 'GPU texture memory (est.)', unit: 'MB', value: (m) => m.gpuTextureBytes / MB },
  { id: 'materials', label: 'Materials', unit: '', value: (m) => m.materials },
  { id: 'meshes', label: 'Meshes', unit: '', value: (m) => m.meshes },
  { id: 'animationKB', label: 'Animation data', unit: 'KB', value: (m) => m.animationBytes / 1024 },
];

/**
 * @param {{fileBytes:number, triangles:number, maxTexture:number, gpuTextureBytes:number, materials:number, meshes:number, animationBytes:number}} metrics
 * @param {Record<string, {warn:number, fail:number}>} limits
 */
export function evaluateBudgets(metrics, limits) {
  const results = BUDGET_METRICS.map((metric) => {
    const limit = limits[metric.id] || { warn: 0, fail: 0 };
    const value = metric.value(metrics);
    let status = 'pass';
    if (limit.fail > 0 && value > limit.fail) status = 'fail';
    else if (limit.warn > 0 && value > limit.warn) status = 'warn';
    return { id: metric.id, label: metric.label, unit: metric.unit, value: Math.round(value * 100) / 100, warn: limit.warn, fail: limit.fail, status };
  });
  const status = results.some((r) => r.status === 'fail') ? 'fail' : results.some((r) => r.status === 'warn') ? 'warn' : 'pass';
  return { status, results };
}

/**
 * One tightening step for a re-run when an asset is over budget. Returns
 * null when nothing can be tightened without breaking a minimum — the caller
 * then marks the asset for manual review instead of degrading it further.
 *
 * @returns {{ settings: object, changes: string[] } | null}
 */
export function tightenForBudget(settings, evaluation, inspection, deforming) {
  const next = structuredClone(settings);
  const changes = [];
  const failing = new Set(evaluation.results.filter((r) => r.status !== 'pass').map((r) => r.id));
  const limits = settings.budgets.limits;

  if (failing.has('triangles') && limits.triangles) {
    const target = limits.triangles.warn || limits.triangles.fail;
    const current = evaluation.results.find((r) => r.id === 'triangles').value;
    const floor = settings.geometry.minTriangles || 0;
    if (deforming && !settings.geometry.allowDeforming) {
      // Never silently switch on deforming-mesh simplification.
    } else if (target > floor && current > target) {
      next.geometry.simplify = true;
      next.geometry.targetMode = 'triangles';
      next.geometry.scope = 'model';
      next.geometry.targetTriangles = Math.max(floor, Math.round(target * 0.95));
      changes.push(`target ${next.geometry.targetTriangles.toLocaleString('en-GB')} triangles`);
    }
  }

  if (failing.has('textureSize') || failing.has('gpuMB') || failing.has('fileMB')) {
    const floor = settings.budgets.minTextureSize;
    const maxNow = inspection.maxTexture || 0;
    for (const [id, role] of Object.entries(next.textures.roles)) {
      const current = role.maxSize || maxNow;
      const halved = Math.max(floor, Math.floor(current / 2));
      if (current > floor && halved < current) {
        role.maxSize = halved;
        changes.push(`${id} ≤ ${halved}px`);
      }
    }
    if (changes.length) {
      const resize = next.stages.find((s) => s.id === 'resizeTextures');
      if (resize) resize.enabled = true;
    }
  }

  return changes.length ? { settings: next, changes } : null;
}

/** Batch-level totals against the batch limits (0 = off). */
export function evaluateBatch(results, batchLimits) {
  const done = results.filter((r) => r.after);
  const fileBytes = done.reduce((n, r) => n + r.outputBytes, 0);
  const triangles = done.reduce((n, r) => n + r.after.stats.triangles, 0);
  const checks = [];
  if (batchLimits.fileMB > 0) checks.push({ label: 'Total output size', value: fileBytes / MB, limit: batchLimits.fileMB, unit: 'MB', status: fileBytes / MB > batchLimits.fileMB ? 'fail' : 'pass' });
  if (batchLimits.triangles > 0) checks.push({ label: 'Total triangles', value: triangles, limit: batchLimits.triangles, unit: '', status: triangles > batchLimits.triangles ? 'fail' : 'pass' });
  return { fileBytes, triangles, checks };
}
