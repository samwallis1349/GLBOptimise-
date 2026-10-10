import { bytes, esc, int, ms, reduction } from './format.js';
import { textureGpuBytes } from '../engine/inspect.js';
import { sizeOf } from '../engine/reports.js';

/**
 * Centre-panel detail tabs for the active asset: before/after stats, the
 * pipeline plan, issues and validation, materials, output files and log.
 */

export function renderStats(item, settings) {
  const ins = item.inspection;
  if (!ins) return `<p class="ap-muted">${item.status === 'inspecting' ? 'Inspecting…' : esc(item.error || 'Not inspected.')}</p>`;
  if (!ins.ok && !ins.stats) return `<p class="ap-msg is-error">${esc(ins.error || 'This file cannot be read.')}</p>`;
  const b = ins.stats;
  const r = item.result;
  const a = r?.after?.stats;
  const row = (label, before, after, fmt = int, note = '') => `<tr><th>${esc(label)}${note ? ` <small>${esc(note)}</small>` : ''}</th><td>${fmt(before)}</td><td>${a ? fmt(after) : '—'}</td><td>${a && before != null && after != null ? reduction(before, after) : '—'}</td></tr>`;
  const resized = r ? r.textures.filter((t) => t.resized).length : null;
  const reencoded = r ? r.textures.filter((t) => t.reencoded).length : null;
  const est = estimateTextures(ins, settings);
  const feat = ins.features;
  return `
    <table class="ap-stats">
      <thead><tr><th></th><th>Original</th><th>Optimised</th><th>Change</th></tr></thead>
      <tbody>
        ${row('File size', ins.fileBytes, r?.outputBytes, bytes)}
        ${row('Triangles', b.triangles, a?.triangles)}
        ${row('Vertices', b.vertices, a?.vertices)}
        ${row('Draw calls', b.drawCalls, a?.drawCalls)}
        ${row('Meshes', b.meshes, a?.meshes)}
        ${row('Materials', b.materials, a?.materials)}
        ${row('Textures', b.textures, a?.textures)}
        ${row('Largest texture', b.maxTexture, a?.maxTexture, (v) => (v ? `${v}px` : '—'))}
        ${row('GPU texture memory', b.gpuTextureBytes, a?.gpuTextureBytes, bytes, 'estimate')}
      </tbody>
    </table>
    <div class="ap-kv">
      ${kv('Animations', feat.animations.length ? feat.animations.map((x) => `${x.name || '(unnamed)'} ${x.duration}s`).join(', ') : 'none')}
      ${kv('Skinning', feat.skins ? `${feat.skins} skin, ${feat.joints} joints, ${feat.skinnedMeshes} skinned mesh(es)` : 'none')}
      ${kv('Morph targets', feat.morphTargets ? `${feat.morphTargets} on ${feat.morphMeshes} mesh(es)` : 'none')}
      ${kv('Cameras / lights', `${feat.cameras} / ${feat.lights}`)}
      ${kv('Compression in', [ins.compression.draco && 'Draco', ins.compression.meshopt && 'Meshopt', ins.compression.ktx2 && 'KTX2', ins.compression.webp && 'WebP'].filter(Boolean).join(', ') || 'none')}
      ${kv('Bounds', feat.bounds ? feat.bounds.size.map((v) => v.toFixed(3)).join(' × ') : '—')}
      ${r ? kv('Textures', `${resized} resized, ${reencoded} re-encoded`) : ''}
      ${r?.lods ? kv('LODs', r.lods.map((l) => `LOD${l.level} ${int(l.triangles)}`).join(' · ')) : ''}
      ${r ? kv('Processing time', ms(r.timing?.totalMs)) : ''}
      ${r?.budgets ? kv('Budget', r.budgets.status.toUpperCase()) : ''}
    </div>
    ${!r && est ? `<p class="ap-note">Estimated with current settings: GPU texture memory ${bytes(est.before)} → ~${bytes(est.after)} (estimate; file-size savings are only known after processing).</p>` : ''}
    ${r?.budgets ? budgetTable(r.budgets) : ''}`;
}

const kv = (k, v) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`;

function budgetTable(b) {
  return `<table class="ap-stats ap-budgets"><thead><tr><th>Budget</th><th>Value</th><th>Warn</th><th>Fail</th><th></th></tr></thead><tbody>${b.results
    .filter((r) => r.warn || r.fail)
    .map((r) => `<tr><th>${esc(r.label)}</th><td>${r.value}${r.unit ? ` ${r.unit}` : ''}</td><td>${r.warn || '—'}</td><td>${r.fail || '—'}</td><td><span class="ap-badge is-${r.status === 'pass' ? 'done' : r.status === 'warn' ? 'review' : 'failed'}">${r.status}</span></td></tr>`)
    .join('')}</tbody></table>`;
}

/** GPU texture-memory estimate for the current settings, before processing (labelled as an estimate). */
export function estimateTextures(inspection, settings) {
  if (!inspection?.textures?.length) return null;
  const resize = settings.stages.find((s) => s.id === 'resizeTextures')?.enabled;
  const compress = settings.stages.find((s) => s.id === 'compressTextures')?.enabled;
  let before = 0;
  let after = 0;
  for (const t of inspection.textures) {
    if (!t.width) continue;
    before += textureGpuBytes(t.width, t.height, t.mime);
    const role = settings.textures.roles[t.role];
    let { width: w, height: h } = t;
    const cap = resize ? role.maxSize : 0;
    if (cap && Math.max(w, h) > cap && t.mime !== 'image/ktx2') {
      const s = cap / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    const mime = compress && role.format === 'ktx2' ? 'image/ktx2' : t.mime;
    after += textureGpuBytes(w, h, mime);
  }
  return { before, after };
}

export function renderPlan(plan) {
  if (!plan) return '<p class="ap-muted">Select an inspected asset to see what the pipeline will do to it.</p>';
  return `
    ${plan.orderErrors.map((e) => `<p class="ap-msg is-error">${esc(e)}</p>`).join('')}
    <ol class="ap-plan">${plan.stages
      .map((s) => `<li class="${s.enabled ? '' : 'is-off'}"><b>${esc(s.label)}</b>${s.enabled ? '' : ' <small>(off)</small>'}${s.ops.length ? `<span>${esc(s.ops.join(' · '))}</span>` : ''}${s.skipped.map((x) => `<span class="ap-skip">Skipped: ${esc(x)}</span>`).join('')}</li>`)
      .join('')}</ol>
    ${plan.confirm.length ? `<div class="ap-msg is-warn"><b>Needs confirmation before processing:</b><ul>${plan.confirm.map((c) => `<li>${esc(c.message)}</li>`).join('')}</ul></div>` : ''}
    ${plan.notes.map((n) => `<p class="ap-note">${esc(n)}</p>`).join('')}
    ${plan.orderWarnings.map((w) => `<p class="ap-msg is-warn">${esc(w)}</p>`).join('')}`;
}

export function renderChecks(item) {
  const issues = item.inspection?.issues || [];
  const parts = [];
  parts.push(`<h3>Inspection</h3>${issues.length ? `<ul class="ap-checks">${issues.map((i) => `<li class="is-${i.severity === 'error' ? 'fail' : i.severity === 'warning' ? 'warn' : 'info'}">${esc(i.message)}</li>`).join('')}</ul>` : '<p class="ap-muted">No problems found.</p>'}`);
  const r = item.result;
  if (r?.validation?.length) {
    parts.push(
      `<h3>Validation</h3>${r.validation
        .map((v) => `<details class="ap-sub"${v.status !== 'pass' ? ' open' : ''}><summary><span class="ap-badge is-${v.status === 'pass' ? 'done' : v.status === 'warn' ? 'review' : 'failed'}">${v.status}</span> ${esc(v.path)}</summary><ul class="ap-checks">${v.checks.map((c) => `<li class="is-${c.status}">${esc(c.message)}</li>`).join('')}</ul></details>`)
        .join('')}`
    );
  } else if (r && !r.validation?.length && r.status !== 'failed') {
    parts.push('<p class="ap-msg is-warn">Validation was disabled for this run.</p>');
  }
  if (r?.error) parts.push(`<p class="ap-msg is-error">${esc(r.error)}</p>`);
  const warns = (r?.log || []).filter((l) => l.level === 'warn' || l.level === 'error');
  if (warns.length) parts.push(`<h3>Warnings</h3><ul class="ap-checks">${warns.map((l) => `<li class="is-${l.level === 'error' ? 'fail' : 'warn'}">${esc(l.message)}</li>`).join('')}</ul>`);
  return parts.join('');
}

export function renderMaterials(materials, item) {
  const tex = item.result?.textures || (item.inspection?.textures || []).map((t) => ({ name: t.name, role: t.role, before: t, after: null, actions: [], notes: [] }));
  return `
    ${materials?.length ? `<table class="ap-stats"><thead><tr><th>Material</th><th>Type</th><th>Maps</th><th>Alpha</th></tr></thead><tbody>${materials.map((m) => `<tr><th>${esc(m.name)}</th><td>${esc(m.type.replace('Mesh', '').replace('Material', ''))}</td><td>${esc(m.maps.join(', ') || '—')}</td><td>${m.transparent ? 'blend' : m.alphaTest ? 'mask' : 'opaque'}${m.doubleSided ? ', 2-sided' : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="ap-muted">Load the preview to list materials.</p>'}
    ${tex.length ? `<h3>Textures</h3><table class="ap-stats"><thead><tr><th>Texture</th><th>Role</th><th>Before</th><th>After</th></tr></thead><tbody>${tex
      .map((t) => `<tr><th>${esc(t.name)}${t.notes?.length ? `<small>${esc(t.notes.join(' '))}</small>` : ''}</th><td>${esc(t.role)}</td><td>${t.before.width}×${t.before.height} ${esc(short(t.before.mime))} · ${bytes(t.before.bytes)}</td><td>${t.after ? `${t.after.width}×${t.after.height} ${esc(short(t.after.mime))} · ${bytes(t.after.bytes)}` : '—'}</td></tr>`)
      .join('')}</tbody></table>` : ''}`;
}

const short = (mime) => String(mime || '').replace('image/', '').toUpperCase();

export function renderFiles(item) {
  const r = item.result;
  if (!r?.outputs?.length) return '<p class="ap-muted">Process the asset to produce files.</p>';
  return `<ul class="ap-files">${r.outputs
    .map((o, idx) => `<li class="${o.heldBack ? 'is-held' : ''}"><span><b>${esc(o.path)}</b><small>${esc(o.kind)}${o.level != null ? ` ${o.level}` : ''} · ${bytes(sizeOf(o))}${o.validation ? ` · ${o.validation}` : ''}${o.heldBack ? ' · held back (failed validation)' : ''}</small></span><button type="button" class="ap-btn ap-btn--xs" data-download-output="${idx}">Download</button></li>`)
    .join('')}</ul>`;
}

export function renderLog(item) {
  const log = item.result?.log || [];
  const stages = item.result?.stages || [];
  if (!log.length && !stages.length) return '<p class="ap-muted">No log yet.</p>';
  return `${stages.length ? `<ol class="ap-plan">${stages.map((s) => `<li><b>${esc(s.label)}</b> <small>${ms(s.ms)}</small><span>${esc(s.ops.join(' · ') || '—')}</span></li>`).join('')}</ol>` : ''}
    ${log.length ? `<ul class="ap-log">${log.map((l) => `<li class="is-${l.level}"><span>${esc(l.stage || '')}</span>${esc(l.message)}</li>`).join('')}</ul>` : ''}`;
}
