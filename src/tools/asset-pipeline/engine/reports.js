import { outputNames } from './naming.js';

/**
 * Reports: per-asset JSON, batch manifest, CSV summary and a self-contained
 * HTML report. Pure data → strings; every figure comes from the result
 * objects (measured, never estimated, except values labelled "estimate").
 */

/** Output payloads are Uint8Array in Node and Blob in the browser. */
export const sizeOf = (o) => (o.bytes ? o.bytes.byteLength ?? o.bytes.size : o.size ?? 0);

const pct = (before, after) => (before > 0 ? Math.round(((before - after) / before) * 1000) / 10 : 0);

export function assetSummary(r) {
  const b = r.inspection?.stats || {};
  const a = r.after?.stats || {};
  const texturesResized = (r.textures || []).filter((t) => t.resized).length;
  const texturesReencoded = (r.textures || []).filter((t) => t.reencoded).length;
  return {
    asset: r.dir ? `${r.dir}${r.name}` : r.name,
    status: r.status,
    error: r.error || null,
    sourceBytes: r.inspection?.fileBytes ?? null,
    outputBytes: r.outputBytes ?? null,
    sizeReductionPercent: r.outputBytes != null && r.inspection?.fileBytes ? pct(r.inspection.fileBytes, r.outputBytes) : null,
    trianglesBefore: b.triangles ?? null,
    trianglesAfter: a.triangles ?? null,
    triangleReductionPercent: b.triangles != null && a.triangles != null ? pct(b.triangles, a.triangles) : null,
    verticesBefore: b.vertices ?? null,
    verticesAfter: a.vertices ?? null,
    gpuTextureBytesBeforeEstimate: b.gpuTextureBytes ?? null,
    gpuTextureBytesAfterEstimate: a.gpuTextureBytes ?? null,
    texturesResized,
    texturesReencoded,
    lodLevels: r.lods ? r.lods.length : 0,
    validation: worst((r.validation || []).map((v) => v.status)),
    budget: r.budgets?.status || null,
    warnings: (r.log || []).filter((l) => l.level === 'warn').length,
    processingMs: r.timing?.totalMs ?? null,
  };
}

const worst = (list) => (list.includes('fail') ? 'fail' : list.includes('warn') ? 'warn' : list.length ? 'pass' : null);

/** Full per-asset report (the `<asset>_report.json` file). */
export function assetReport(r, settings) {
  return {
    generator: 'AssetBench Asset Pipeline',
    generatedAt: new Date().toISOString(),
    summary: assetSummary(r),
    engine: settings.engine,
    mode: settings.mode,
    before: r.inspection ? { fileBytes: r.inspection.fileBytes, stats: r.inspection.stats, features: stripBounds(r.inspection.features), issues: r.inspection.issues } : null,
    after: r.after?.stats ? { fileBytes: r.outputBytes, stats: r.after.stats, features: stripBounds(r.after.features) } : null,
    stages: r.stages || [],
    geometry: r.geometry || null,
    lods: r.lods || null,
    textures: r.textures || [],
    validation: r.validation || [],
    budgets: r.budgets || null,
    budgetAttempts: r.attempts || [],
    outputs: (r.outputs || []).map((o) => ({ path: o.path, kind: o.kind, level: o.level ?? null, bytes: sizeOf(o), validation: o.validation || null, heldBack: Boolean(o.heldBack) })),
    log: r.log || [],
    timing: r.timing || null,
    notes: [
      'GPU texture memory figures are estimates (RGBA8 + mip chain, ~1 byte/pixel for KTX2) and depend on how the engine uploads textures.',
      'LOD files do not switch automatically: the engine or runtime decides when each level is shown.',
    ],
  };
}

const stripBounds = (f) => (f ? { ...f, meshNames: undefined } : null);

export function manifest(results, settings) {
  return {
    generator: 'AssetBench Asset Pipeline',
    generatedAt: new Date().toISOString(),
    engine: settings.engine,
    mode: settings.mode,
    assets: results.map((r) => ({
      source: r.dir ? `${r.dir}${r.name}` : r.name,
      status: r.status,
      outputs: (r.outputs || []).filter((o) => !o.heldBack).map((o) => ({ path: o.path, kind: o.kind, level: o.level ?? null, bytes: sizeOf(o) })),
      lods: r.lods ? r.lods.map(({ level, keepPercent, triangles, distance, screenSize }) => ({ level, keepPercent, triangles, distance, screenSize })) : null,
      triangles: r.after?.stats?.triangles ?? null,
      report: r.status !== 'failed' ? outputNames(r, settings).report : null,
    })),
  };
}

const CSV_COLUMNS = ['asset', 'status', 'sourceBytes', 'outputBytes', 'sizeReductionPercent', 'trianglesBefore', 'trianglesAfter', 'triangleReductionPercent', 'verticesBefore', 'verticesAfter', 'gpuTextureBytesBeforeEstimate', 'gpuTextureBytesAfterEstimate', 'texturesResized', 'texturesReencoded', 'lodLevels', 'validation', 'budget', 'warnings', 'processingMs', 'error'];

export function batchCsv(results) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = results.map((r) => assetSummary(r));
  return [CSV_COLUMNS.join(','), ...rows.map((row) => CSV_COLUMNS.map((c) => esc(row[c])).join(','))].join('\n');
}

const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mb = (b) => (b == null ? '—' : b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const n = (v) => (v == null ? '—' : Number(v).toLocaleString('en-GB'));

export function htmlReport(results, settings) {
  const rows = results.map(assetSummary);
  const total = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const body = results
    .map((r) => {
      const s = assetSummary(r);
      const checks = (r.validation || []).flatMap((v) => v.checks.filter((c) => c.status !== 'pass').map((c) => `<li class="${c.status}">${h(v.path)}: ${h(c.message)}</li>`));
      const warns = (r.log || []).filter((l) => l.level !== 'info').map((l) => `<li class="${l.level}">${h(l.message)}</li>`);
      return `<section><h2>${h(s.asset)} <span class="tag ${h(s.status)}">${h(s.status)}</span></h2>
<table><tr><th></th><th>Before</th><th>After</th><th>Change</th></tr>
<tr><td>File size</td><td>${mb(s.sourceBytes)}</td><td>${mb(s.outputBytes)}</td><td>${s.sizeReductionPercent ?? '—'}%</td></tr>
<tr><td>Triangles</td><td>${n(s.trianglesBefore)}</td><td>${n(s.trianglesAfter)}</td><td>${s.triangleReductionPercent ?? '—'}%</td></tr>
<tr><td>Vertices</td><td>${n(s.verticesBefore)}</td><td>${n(s.verticesAfter)}</td><td></td></tr>
<tr><td>GPU texture memory (estimate)</td><td>${mb(s.gpuTextureBytesBeforeEstimate)}</td><td>${mb(s.gpuTextureBytesAfterEstimate)}</td><td></td></tr></table>
<p>${s.texturesResized} texture(s) resized, ${s.texturesReencoded} re-encoded, ${s.lodLevels} LOD level(s), validation: ${h(s.validation || 'not run')}, ${n(s.processingMs)} ms.</p>
${r.stages?.length ? `<ol>${r.stages.map((st) => `<li><b>${h(st.label)}</b>: ${h(st.ops.join('; '))}</li>`).join('')}</ol>` : ''}
${checks.length || warns.length ? `<ul>${[...warns, ...checks].join('')}</ul>` : ''}</section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Asset Pipeline report</title>
<style>body{margin:0;padding:24px;background:#0b0b0b;color:#e9e6df;font:14px/1.5 system-ui,sans-serif}h1{margin:0 0 4px}h2{font-size:16px;margin:0 0 8px}section{border:1px solid #2a2a2a;border-radius:10px;padding:14px;margin:14px 0;background:#131313}table{border-collapse:collapse;width:100%;max-width:720px}td,th{border-bottom:1px solid #2a2a2a;padding:4px 8px;text-align:left;font-variant-numeric:tabular-nums}.tag{font-size:11px;padding:2px 8px;border-radius:99px;background:#2a2a2a}.done,.pass{color:#5fce8f}.review,.warn{color:#ffb547}.failed,.fail,.error{color:#ff6b5e}small{color:#8a8a8a}</style></head><body>
<h1>Asset Pipeline report</h1><small>${h(new Date().toISOString())} · engine preset ${h(settings.engine)} · ${h(settings.mode)} mode</small>
<p>${rows.length} asset(s): ${rows.filter((r) => r.status === 'done').length} done, ${rows.filter((r) => r.status === 'review').length} for review, ${rows.filter((r) => r.status === 'failed').length} failed. Total ${mb(total('sourceBytes'))} → ${mb(total('outputBytes'))}; ${n(total('trianglesBefore'))} → ${n(total('trianglesAfter'))} triangles.</p>
${body}
<p><small>GPU memory values are estimates. LOD files do not switch automatically; your engine or runtime decides when each level shows.</small></p></body></html>`;
}
