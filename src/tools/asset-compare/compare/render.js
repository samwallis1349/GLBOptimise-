import { getToolById } from '../../../shared/config/tools.js';
import { esc, fmtBytes, fmtCount, fmtDelta, fmtPct, fmtValue } from './format.js';

/** HTML builders for the comparison results. Every file-derived string goes through esc(). */

const STATUS_LABEL = { pass: 'Pass', warn: 'Close', fail: 'Over' };
const SEV_LABEL = { error: 'Error', warning: 'Warning', info: 'Info' };

export function renderResults(result, A, B, activeTab) {
  return `
    ${renderVerdict(result)}
    <div class="ac-grid-2">
      ${renderBytes(result, A, B)}
      ${renderBudgets(result)}
    </div>
    ${renderMetrics(result)}
    ${renderIssues(result)}
    ${renderDetails(result, activeTab)}
    <section class="ac-card ac-export">
      <div class="ac-card-h"><span class="ac-num">↓</span><div><h2>Export</h2><p>Share the comparison or keep it with the build</p></div></div>
      <div class="ac-card-b ac-export-row">
        <button type="button" class="ac-btn ac-btn--primary" data-export="json">Download comparison (JSON)</button>
        <button type="button" class="ac-btn" data-export="markdown">Copy summary (Markdown)</button>
        <button type="button" class="ac-btn" data-export="image">Save side-by-side image</button>
      </div>
    </section>`;
}

function renderVerdict({ verdict, regressions }) {
  return `
    <section class="ac-verdict ac-verdict--${verdict.tone}" aria-live="polite">
      <p class="ac-verdict-head">${esc(verdict.headline)}</p>
      <p class="ac-verdict-text">${esc(verdict.text)}</p>
      ${regressions.length ? `<ul class="ac-regressions">${regressions.map((r) => `<li class="ac-reg ac-reg--${r.severity}">${esc(r.text)}</li>`).join('')}</ul>` : ''}
    </section>`;
}

function renderMetrics({ metrics }) {
  let group = null;
  const rows = metrics
    .map((m) => {
      const head = m.group !== group ? `<tr class="ac-group"><th colspan="6">${esc(m.group)}</th></tr>` : '';
      group = m.group;
      const max = Math.max(Math.abs(m.a || 0), Math.abs(m.b || 0)) || 1;
      const bar = (v, cls) => `<span class="ac-mini ${cls}" style="width:${Math.max(2, (Math.abs(v || 0) / max) * 100).toFixed(1)}%"></span>`;
      return `${head}
        <tr class="ac-row ac-row--${m.status}">
          <th scope="row">${esc(m.label)}${m.better === 'neutral' ? ' <small>info</small>' : ''}</th>
          <td>${fmtValue(m.a, m.kind)}</td>
          <td>${fmtValue(m.b, m.kind)}</td>
          <td class="ac-delta">${fmtDelta(m.delta, m.kind)}</td>
          <td class="ac-delta">${fmtPct(m.pct)}</td>
          <td class="ac-bars">${bar(m.a, 'ac-mini--a')}${bar(m.b, 'ac-mini--b')}</td>
        </tr>`;
    })
    .join('');
  return `
    <section class="ac-card">
      <div class="ac-card-h"><span class="ac-num">Δ</span><div><h2>Metrics</h2><p>Green is better, red is worse, grey is informational</p></div></div>
      <div class="ac-card-b ac-scroll">
        <table class="ac-table ac-metrics">
          <thead><tr><th>Metric</th><th>A</th><th>B</th><th>Δ</th><th>Δ %</th><th><span class="ac-key ac-key--a"></span>A <span class="ac-key ac-key--b"></span>B</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderBytes({ bytes }, A, B) {
  const max = Math.max(A.file.bytes, B.file.bytes) || 1;
  const bar = (side, total) => `
    <div class="ac-stack-row">
      <span class="ac-stack-label"><b>${side.toUpperCase()}</b> ${fmtBytes(total)}</span>
      <div class="ac-stack" style="width:${Math.max(3, (total / max) * 100).toFixed(1)}%">
        ${bytes.filter((c) => c[side] > 0).map((c) => `<span style="flex:${c[side]};background:${c.color}" title="${esc(c.label)}: ${fmtBytes(c[side])}"></span>`).join('')}
      </div>
    </div>`;
  const rows = bytes
    .filter((c) => c.a || c.b)
    .map((c) => {
      const status = c.delta === 0 ? 'same' : c.delta < 0 ? 'good' : 'bad';
      return `<tr class="ac-row ac-row--${status}"><th scope="row"><span class="ac-swatch" style="background:${c.color}"></span>${esc(c.label)}</th><td>${fmtBytes(c.a)}</td><td>${fmtBytes(c.b)}</td><td class="ac-delta">${c.delta === 0 ? '±0' : `${c.delta > 0 ? '+' : '−'}${fmtBytes(Math.abs(c.delta))}`}</td></tr>`;
    })
    .join('');
  return `
    <section class="ac-card">
      <div class="ac-card-h"><span class="ac-num">B</span><div><h2>Where are the bytes</h2><p>On-disk size by category, bars to scale</p></div></div>
      <div class="ac-card-b">
        ${bar('a', A.file.bytes)}
        ${bar('b', B.file.bytes)}
        <div class="ac-scroll">
          <table class="ac-table ac-compact"><thead><tr><th>Category</th><th>A</th><th>B</th><th>Δ</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
      </div>
    </section>`;
}

function chip(status) {
  return `<span class="ac-chip ac-chip--${status}">${STATUS_LABEL[status] || status}</span>`;
}

function renderBudgets({ budgets }) {
  return `
    <section class="ac-card">
      <div class="ac-card-h"><span class="ac-num">$</span><div><h2>Budgets</h2><p>Per-asset realtime budgets for each target</p></div></div>
      <div class="ac-card-b">
        <ul class="ac-budgets">
          ${budgets
            .map(
              (b) => `
            <li>
              <div class="ac-budget-line"><strong>${esc(b.label)}</strong><span class="ac-budget-chips">${chip(b.a)}<span class="ac-arrow">→</span>${chip(b.b)}</span></div>
              ${b.changes.length ? `<small>${b.changes.map((c) => `${esc(c.label)}: ${STATUS_LABEL[c.a]} → ${STATUS_LABEL[c.b]}`).join(' · ')}</small>` : '<small>No budget line changed</small>'}
            </li>`,
            )
            .join('')}
        </ul>
      </div>
    </section>`;
}

function fixLink(issue) {
  if (!issue.fix) return '';
  const tool = getToolById(issue.fix.tool);
  if (!tool) return '';
  return `<button type="button" class="ac-fix" data-route="${esc(tool.route)}">Fix with ${esc(issue.fix.label)} →</button>`;
}

function issueItem(issue, { showFix, before } = {}) {
  const sevChange = before && before.severity !== issue.severity ? ` <small>(was ${SEV_LABEL[before.severity].toLowerCase()})</small>` : '';
  return `
    <li class="ac-issue ac-issue--${issue.severity}">
      <div><span class="ac-sev">${SEV_LABEL[issue.severity]}</span><strong>${esc(issue.title)}</strong>${sevChange}</div>
      <p>${esc(issue.detail)}</p>
      ${showFix ? fixLink(issue) : ''}
    </li>`;
}

function renderIssues({ issues }) {
  const col = (title, cls, list, opts, empty) => `
    <div class="ac-issue-col ac-issue-col--${cls}">
      <h3>${title} <span>${list.length}</span></h3>
      ${list.length ? `<ul>${list.map((i) => issueItem(i, { ...opts, before: i.before })).join('')}</ul>` : `<p class="ac-empty">${empty}</p>`}
    </div>`;
  return `
    <section class="ac-card">
      <div class="ac-card-h"><span class="ac-num">!</span><div><h2>Health checks</h2><p>What B fixed, what it introduced, and what’s still there</p></div></div>
      <div class="ac-card-b ac-issue-cols">
        ${col('Fixed', 'fixed', issues.fixed, {}, 'Nothing fixed')}
        ${col('New in B', 'added', issues.added, { showFix: true }, 'No new issues')}
        ${col('Still present', 'remaining', issues.remaining, { showFix: true }, 'Nothing carried over')}
      </div>
    </section>`;
}

const TABS = [
  { id: 'textures', label: 'Textures' },
  { id: 'materials', label: 'Materials' },
  { id: 'animations', label: 'Animations' },
  { id: 'meshes', label: 'Meshes' },
];

function pairStatus(p, changed) {
  if (!p.a) return 'added';
  if (!p.b) return 'removed';
  return changed ? 'changed' : 'same';
}

function statusCell(status, by) {
  const label = { added: 'Added', removed: 'Removed', changed: 'Changed', same: 'Same' }[status];
  return `<td><span class="ac-pair ac-pair--${status}">${label}</span>${by === 'position' ? '<small class="ac-by">matched by order</small>' : ''}</td>`;
}

function detailRows(result, tab) {
  if (tab === 'textures') {
    const desc = (t) => (t ? `${t.width}×${t.height} ${esc(t.format)} · ${fmtBytes(t.byteLength)}` : '—');
    return {
      head: '<th>Texture</th><th>A</th><th>B</th><th>Status</th>',
      rows: result.textures.map((p) => `<tr><th scope="row">${esc((p.a || p.b).name)}${p.b && p.a && p.b.name !== p.a.name ? `<small>→ ${esc(p.b.name)}</small>` : ''}</th><td>${desc(p.a)}</td><td>${desc(p.b)}</td>${statusCell(pairStatus(p, p.changed), p.by)}</tr>`),
    };
  }
  if (tab === 'materials') {
    const desc = (m) => (m ? `${esc(m.alphaMode)}${m.doubleSided ? ' · double-sided' : ''} · ${Object.keys(m.textures).length} map${Object.keys(m.textures).length === 1 ? '' : 's'}` : '—');
    return {
      head: '<th>Material</th><th>A</th><th>B</th><th>Changes</th><th>Status</th>',
      rows: result.materials.map((p) => `<tr><th scope="row">${esc((p.a || p.b).name)}</th><td>${desc(p.a)}</td><td>${desc(p.b)}</td><td>${p.changes.length ? esc(p.changes.join(', ')) : '—'}</td>${statusCell(pairStatus(p, p.changes.length > 0), p.by)}</tr>`),
    };
  }
  if (tab === 'animations') {
    const desc = (x) => (x ? `${x.duration.toFixed(2)} s · ${fmtCount(x.keyframes)} keys · ${x.channelCount} ch` : '—');
    return {
      head: '<th>Animation</th><th>A</th><th>B</th><th>Status</th>',
      rows: result.animations.map((p) => {
        const changed = p.a && p.b && (Math.abs(p.a.duration - p.b.duration) > 1e-3 || p.a.keyframes !== p.b.keyframes || p.a.channelCount !== p.b.channelCount);
        return `<tr><th scope="row">${esc((p.a || p.b).name)}</th><td>${desc(p.a)}</td><td>${desc(p.b)}</td>${statusCell(pairStatus(p, changed), p.by)}</tr>`;
      }),
    };
  }
  const desc = (x) => (x ? `${fmtCount(x.triangleCount)} tris · ${fmtCount(x.vertexCount)} verts${x.instances > 1 ? ` · ×${x.instances}` : ''}` : '—');
  return {
    head: '<th>Mesh</th><th>A</th><th>B</th><th>Δ tris</th><th>Status</th>',
    rows: result.meshes.map((p) => {
      const changed = p.a && p.b && (p.a.triangleCount !== p.b.triangleCount || p.a.vertexCount !== p.b.vertexCount);
      const d = p.a && p.b ? p.b.triangleCount - p.a.triangleCount : null;
      const pct = p.a && p.b && p.a.triangleCount ? (d / p.a.triangleCount) * 100 : null;
      return `<tr><th scope="row">${esc((p.a || p.b).name)}</th><td>${desc(p.a)}</td><td>${desc(p.b)}</td><td class="ac-delta">${d == null ? '—' : `${fmtDelta(d, 'count')} (${fmtPct(pct)})`}</td>${statusCell(pairStatus(p, changed), p.by)}</tr>`;
    }),
  };
}

function renderDetails(result, activeTab) {
  const counts = { textures: result.textures.length, materials: result.materials.length, animations: result.animations.length, meshes: result.meshes.length };
  const { head, rows } = detailRows(result, activeTab);
  return `
    <section class="ac-card">
      <div class="ac-card-h"><span class="ac-num">≡</span><div><h2>Details</h2><p>Item-by-item changes, matched by name</p></div></div>
      <div class="ac-card-b">
        <div class="ac-tabs" role="tablist">
          ${TABS.map((t) => `<button type="button" role="tab" class="ac-tab" data-tab="${t.id}" aria-selected="${t.id === activeTab}">${t.label} <span>${counts[t.id]}</span></button>`).join('')}
        </div>
        <div class="ac-scroll" role="tabpanel">
          ${rows.length ? `<table class="ac-table ac-detail"><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<p class="ac-empty">Neither model has any ${activeTab}.</p>`}
        </div>
      </div>
    </section>`;
}
