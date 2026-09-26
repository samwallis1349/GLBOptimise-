import { BUDGET_METRICS, BUDGET_TARGETS } from '../../../shared/glb/statistics.js';
import { BYTE_CATEGORIES, GRADES } from '../config.js';
import { COLUMNS, budgetFor, maxTexture } from '../processing/library.js';
import { escapeHtml as esc, formatBytes, formatCompact, formatMetric, formatNumber, formatSeconds } from './format.js';

/** HTML builders for the Asset Report. Every file-derived string goes through esc(). */

const STATUS_LABEL = { pass: 'Pass', warn: 'Near', fail: 'Over' };
const SEVERITY_LABEL = { error: 'Errors', warning: 'Warnings', info: 'Suggestions' };

const gradeChip = (health) => `<span class="ar-grade ar-grade--${health.grade}" title="${esc(health.summary)}">${health.grade}<small>${health.score}</small></span>`;
const statusChip = (status) => `<span class="ar-status ar-status--${status}">${STATUS_LABEL[status]}</span>`;
const fixButton = (fix) => (fix ? `<button type="button" class="ar-fix" data-nav="/${esc(fix.tool)}">Fix with ${esc(fix.label)} →</button>` : '');
const targetLabel = (id) => BUDGET_TARGETS.find((t) => t.id === id)?.label || id;

function stat(label, value, sub = '') {
  return `<div class="ar-stat"><dt>${label}</dt><dd>${value}</dd>${sub ? `<span>${sub}</span>` : ''}</div>`;
}

// ---------------------------------------------------------------- summary

export function renderSummary(s, target) {
  const maxGrade = Math.max(1, ...Object.values(s.grades));
  const budgetTotal = Math.max(1, s.budgets.pass + s.budgets.warn + s.budgets.fail);
  const pct = (n) => `${((n / budgetTotal) * 100).toFixed(1)}%`;
  const ranked = (list, fn) =>
    list.length
      ? `<ol class="ar-rank">${list.map((i) => `<li><button type="button" class="ar-link" data-select="${i.id}">${esc(i.name)}</button><span>${fn(i.analysis)}</span></li>`).join('')}</ol>`
      : '<p class="ar-empty">—</p>';

  return `
    <dl class="ar-stats">
      ${stat('Assets', formatNumber(s.total), s.failed ? `${s.failed} unreadable` : 'all readable')}
      ${stat('Total size', formatBytes(s.bytes))}
      ${stat('Triangles', formatCompact(s.triangles), `${formatNumber(s.drawCalls)} draw calls`)}
      ${stat('Est. GPU memory', formatBytes(s.gpuBytes))}
      ${stat('Average health', `${s.avgScore}<small>/100</small>`)}
    </dl>

    <div class="ar-summary-grid">
      <div class="ar-panel">
        <h3>Grade distribution</h3>
        <div class="ar-grades">
          ${GRADES.map((g) => `
            <div class="ar-grade-col" title="${s.grades[g]} asset(s) graded ${g}">
              <span class="ar-grade-count">${s.grades[g]}</span>
              <span class="ar-grade-bar ar-grade-bar--${g}" style="height:${(s.grades[g] / maxGrade) * 100}%"></span>
              <span class="ar-grade-label">${g}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="ar-panel">
        <h3>${esc(targetLabel(target))} budget</h3>
        <div class="ar-budget-bar" role="img" aria-label="${s.budgets.pass} pass, ${s.budgets.warn} near, ${s.budgets.fail} over budget">
          <span class="ar-status--pass" style="width:${pct(s.budgets.pass)}"></span>
          <span class="ar-status--warn" style="width:${pct(s.budgets.warn)}"></span>
          <span class="ar-status--fail" style="width:${pct(s.budgets.fail)}"></span>
        </div>
        <ul class="ar-legend">
          <li><i class="ar-dot ar-status--pass"></i>${s.budgets.pass} within budget</li>
          <li><i class="ar-dot ar-status--warn"></i>${s.budgets.warn} near (≤1.5×)</li>
          <li><i class="ar-dot ar-status--fail"></i>${s.budgets.fail} over budget</li>
        </ul>
      </div>

      <div class="ar-panel ar-panel--wide">
        <h3>Most common issues</h3>
        ${
          s.topIssues.length
            ? `<ul class="ar-top-issues">${s.topIssues
                .map((x) => `
                  <li>
                    <span class="ar-sev ar-sev--${x.severity}" aria-label="${x.severity}"></span>
                    <span class="ar-top-issue-label">${esc(x.label)}</span>
                    <span class="ar-top-issue-count">${x.count} / ${s.okCount}</span>
                    ${fixButton(x.fix)}
                  </li>`)
                .join('')}</ul>`
            : '<p class="ar-empty">No issues found across the library.</p>'
        }
      </div>

      <div class="ar-panel">
        <h3>Largest by size</h3>
        ${ranked(s.largestBySize, (a) => formatBytes(a.file.bytes))}
      </div>
      <div class="ar-panel">
        <h3>Most triangles</h3>
        ${ranked(s.largestByTris, (a) => formatCompact(a.totals.triangles))}
      </div>
    </div>`;
}

// ------------------------------------------------------------------ table

export function renderTable(items, sort, target, selectedId) {
  const head = COLUMNS.map((c) => {
    if (!c.sortable && c.sortable !== undefined) return `<th class="ar-col-${c.key}"><span class="ar-sr">Thumbnail</span></th>`;
    const active = sort.key === c.key;
    const aria = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th class="ar-col-${c.key}" aria-sort="${aria}"><button type="button" data-sort="${c.key}">${c.label}${active ? `<i>${sort.dir === 'asc' ? '▲' : '▼'}</i>` : ''}</button></th>`;
  }).join('');

  const rows = items.map((item) => {
    const selected = item.id === selectedId ? ' is-selected' : '';
    if (item.status !== 'ok') {
      return `
        <tr class="ar-row ar-row--failed${selected}" data-id="${item.id}" tabindex="0">
          <td class="ar-col-thumb"><span class="ar-thumb ar-thumb--failed">!</span></td>
          <td class="ar-col-name"><strong>${esc(item.name)}</strong><small class="ar-error-text">${esc(item.error)}</small></td>
          <td colspan="${COLUMNS.length - 2}" class="ar-failed-cell">Couldn’t be read</td>
        </tr>`;
    }
    const a = item.analysis;
    const c = a.health.counts;
    const mt = maxTexture(a);
    return `
      <tr class="ar-row${selected}" data-id="${item.id}" tabindex="0">
        <td class="ar-col-thumb">${item.thumb ? `<img class="ar-thumb" src="${item.thumb}" alt="">` : '<span class="ar-thumb"></span>'}</td>
        <td class="ar-col-name"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${esc(a.health.summary)}</small></td>
        <td>${gradeChip(a.health)}</td>
        <td class="ar-num-cell">${formatBytes(a.file.bytes)}</td>
        <td class="ar-num-cell">${formatNumber(a.totals.triangles)}</td>
        <td class="ar-num-cell">${formatNumber(a.totals.drawCalls)}</td>
        <td class="ar-num-cell">${a.totals.materials}</td>
        <td class="ar-num-cell">${a.totals.textures}</td>
        <td class="ar-num-cell">${mt ? `${mt}px` : '—'}</td>
        <td class="ar-num-cell">${a.totals.animations}</td>
        <td>${statusChip(budgetFor(a, target).status)}</td>
        <td><span class="ar-issue-counts">
          <span class="ar-count ar-count--error${c.error ? '' : ' is-zero'}" title="Errors">${c.error}</span>
          <span class="ar-count ar-count--warning${c.warning ? '' : ' is-zero'}" title="Warnings">${c.warning}</span>
          <span class="ar-count ar-count--info${c.info ? '' : ' is-zero'}" title="Suggestions">${c.info}</span>
        </span></td>
      </tr>`;
  }).join('');

  return `<thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${COLUMNS.length}" class="ar-empty">No assets match these filters.</td></tr>`}</tbody>`;
}

// ----------------------------------------------------------------- detail

function scoreRing(health) {
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - health.score / 100);
  return `
    <div class="ar-ring ar-ring--${health.grade}" role="img" aria-label="Health score ${health.score} out of 100, grade ${health.grade}">
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="${r}" class="ar-ring-track"></circle>
        <circle cx="40" cy="40" r="${r}" class="ar-ring-value" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
      </svg>
      <span><b>${health.grade}</b><small>${health.score}</small></span>
    </div>`;
}

function bytesBar(bytes, total) {
  const parts = BYTE_CATEGORIES.filter((c) => bytes[c.key] > 0);
  const sum = Math.max(1, parts.reduce((s, c) => s + bytes[c.key], 0));
  return `
    <div class="ar-bytes-bar" role="img" aria-label="Byte breakdown">
      ${parts.map((c) => `<span style="width:${((bytes[c.key] / sum) * 100).toFixed(2)}%;background:${c.color}" title="${c.label}: ${formatBytes(bytes[c.key])}"></span>`).join('')}
    </div>
    <ul class="ar-legend ar-legend--bytes">
      ${parts.map((c) => `<li><i class="ar-dot" style="background:${c.color}"></i>${c.label}<b>${formatBytes(bytes[c.key])}</b><small>${((bytes[c.key] / Math.max(1, total)) * 100).toFixed(1)}%</small></li>`).join('')}
    </ul>`;
}

function budgetsTable(budgets) {
  return `
    <div class="ar-table-wrap">
      <table class="ar-mini ar-budget-table">
        <thead><tr><th>Metric</th>${budgets.map((b) => `<th>${esc(b.label)} ${statusChip(b.status)}</th>`).join('')}</tr></thead>
        <tbody>
          ${BUDGET_METRICS.map((m) => `
            <tr>
              <th scope="row">${m.label}</th>
              ${budgets.map((b) => {
                const metric = b.metrics.find((x) => x.key === m.key);
                return `<td class="ar-budget-cell ar-budget-cell--${metric.status}"><b>${formatMetric(metric.value, metric.unit)}</b><small>of ${formatMetric(metric.limit, metric.unit)}</small></td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function issuesList(issues) {
  if (!issues.length) return '<p class="ar-empty ar-empty--good">No issues — this asset passes every check.</p>';
  return ['error', 'warning', 'info']
    .map((sev) => {
      const group = issues.filter((i) => i.severity === sev);
      if (!group.length) return '';
      return `
        <div class="ar-issue-group">
          <h4><span class="ar-sev ar-sev--${sev}"></span>${SEVERITY_LABEL[sev]} <small>${group.length}</small></h4>
          <ul class="ar-issues">
            ${group.map((i) => `
              <li class="ar-issue">
                <div><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p></div>
                ${fixButton(i.fix)}
              </li>`).join('')}
          </ul>
        </div>`;
    })
    .join('');
}

function texturesTable(textures) {
  if (!textures.length) return '<p class="ar-empty">No textures.</p>';
  return `
    <div class="ar-table-wrap">
      <table class="ar-mini">
        <thead><tr><th>Texture</th><th>Format</th><th>Size</th><th>File</th><th>GPU est.</th><th>Used as</th></tr></thead>
        <tbody>
          ${[...textures].sort((a, b) => b.gpuBytes - a.gpuBytes).map((t) => `
            <tr>
              <td class="ar-cell-name" title="${esc(t.name)}">${esc(t.name)}${t.duplicateOf != null ? ' <em class="ar-flag">duplicate</em>' : ''}${t.width && !t.pot ? ' <em class="ar-flag">NPOT</em>' : ''}</td>
              <td>${esc(t.format)}</td>
              <td class="ar-num-cell">${t.width ? `${t.width}×${t.height}` : '—'}</td>
              <td class="ar-num-cell">${formatBytes(t.byteLength)}</td>
              <td class="ar-num-cell">${formatBytes(t.gpuBytes)}</td>
              <td>${esc(t.slots.map((s) => s.replace(/Texture$/, '')).join(', ') || 'unused')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function meshesTable(meshes) {
  if (!meshes.length) return '<p class="ar-empty">No meshes.</p>';
  const top = [...meshes].sort((a, b) => b.triangleCount * b.instances - a.triangleCount * a.instances).slice(0, 10);
  return `
    <div class="ar-table-wrap">
      <table class="ar-mini">
        <thead><tr><th>Mesh</th><th>Triangles</th><th>Vertices</th><th>Instances</th><th>Primitives</th><th>Memory</th></tr></thead>
        <tbody>
          ${top.map((m) => `
            <tr>
              <td class="ar-cell-name" title="${esc(m.name)}">${esc(m.name)}${m.primitives.some((p) => p.compression) ? ' <em class="ar-flag">draco</em>' : ''}${m.morphTargets ? ` <em class="ar-flag">${m.morphTargets} morphs</em>` : ''}</td>
              <td class="ar-num-cell">${formatNumber(m.triangleCount)}</td>
              <td class="ar-num-cell">${formatNumber(m.vertexCount)}</td>
              <td class="ar-num-cell">${m.instances}</td>
              <td class="ar-num-cell">${m.primitives.length}</td>
              <td class="ar-num-cell">${formatBytes(m.byteLength)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${meshes.length > 10 ? `<p class="ar-note">Showing the 10 heaviest of ${meshes.length} meshes.</p>` : ''}`;
}

function animationsTable(animations, skins) {
  const skinLine = skins.length
    ? `<p class="ar-note">${skins.map((s) => `${esc(s.name)}: ${s.jointCount} joints, up to ${s.maxInfluences} influences`).join(' · ')}</p>`
    : '';
  if (!animations.length) return `<p class="ar-empty">No animation clips.</p>${skinLine}`;
  return `
    <div class="ar-table-wrap">
      <table class="ar-mini">
        <thead><tr><th>Clip</th><th>Duration</th><th>Channels</th><th>Keyframes</th><th>Static</th><th>Keys/s</th></tr></thead>
        <tbody>
          ${animations.map((x) => `
            <tr>
              <td class="ar-cell-name" title="${esc(x.name)}">${esc(x.name)}</td>
              <td class="ar-num-cell">${formatSeconds(x.duration)}</td>
              <td class="ar-num-cell">${x.channelCount}</td>
              <td class="ar-num-cell">${formatNumber(x.keyframes)}</td>
              <td class="ar-num-cell">${x.staticChannels}</td>
              <td class="ar-num-cell">${x.sampleRate}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>${skinLine}`;
}

/** Full per-asset report. `nav` = { index, count } for prev/next (omit for print). */
export function renderDetail(item, nav) {
  const navBar = nav
    ? `
      <div class="ar-detail-nav ar-no-print">
        <button type="button" class="ar-btn ar-btn--quiet" data-step="-1" ${nav.index <= 0 ? 'disabled' : ''}>← Previous</button>
        <span>${nav.index + 1} of ${nav.count}</span>
        <button type="button" class="ar-btn ar-btn--quiet" data-step="1" ${nav.index >= nav.count - 1 ? 'disabled' : ''}>Next →</button>
        <button type="button" class="ar-btn ar-btn--quiet" data-close aria-label="Close report">×</button>
      </div>`
    : '';

  if (item.status !== 'ok') {
    return `${navBar}
      <div class="ar-detail-head">
        <span class="ar-thumb ar-thumb--lg ar-thumb--failed">!</span>
        <div><p class="ar-eyebrow">Asset report</p><h2>${esc(item.name)}</h2><p class="ar-error-text">${esc(item.error)}</p></div>
      </div>`;
  }

  const a = item.analysis;
  const size = a.bounds ? a.bounds.size.map((v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2))).join(' × ') : '—';
  return `${navBar}
    <div class="ar-detail-head">
      ${item.thumb ? `<img class="ar-thumb ar-thumb--lg" src="${item.thumb}" alt="Preview of ${esc(item.name)}">` : '<span class="ar-thumb ar-thumb--lg"></span>'}
      <div class="ar-detail-title">
        <p class="ar-eyebrow">Asset report</p>
        <h2 title="${esc(item.name)}">${esc(item.name)}</h2>
        <p>${esc(a.health.summary)} · ${a.health.counts.error} errors · ${a.health.counts.warning} warnings · ${a.health.counts.info} suggestions</p>
        <p class="ar-meta">${esc(a.file.kind.toUpperCase())}${a.file.generator ? ` · ${esc(a.file.generator)}` : ''}${a.extensions.raw.length ? ` · ${esc(a.extensions.raw.join(', '))}` : ''}</p>
      </div>
      ${scoreRing(a.health)}
    </div>

    <dl class="ar-stats ar-stats--detail">
      ${stat('File size', formatBytes(a.file.bytes))}
      ${stat('Triangles', formatNumber(a.totals.triangles), a.totals.uniqueTriangles !== a.totals.triangles ? `${formatNumber(a.totals.uniqueTriangles)} unique` : '')}
      ${stat('Vertices', formatNumber(a.totals.vertices))}
      ${stat('Draw calls', formatNumber(a.totals.drawCalls))}
      ${stat('Meshes', `${a.totals.meshes}`, `${a.totals.primitives} primitives · ${a.totals.nodes} nodes`)}
      ${stat('Materials', `${a.totals.materials}`)}
      ${stat('Textures', `${a.totals.textures}`, maxTexture(a) ? `max ${maxTexture(a)}px` : '')}
      ${stat('Est. GPU memory', formatBytes(a.gpu.totalBytes), `${formatBytes(a.gpu.textureBytes)} textures`)}
      ${stat('Animations', `${a.totals.animations}`, a.totals.joints ? `${a.totals.joints} joints` : '')}
      ${stat('Dimensions', size, 'metres (x × y × z)')}
    </dl>

    <div class="ar-detail-section"><h3>Where are the bytes?</h3>${bytesBar(a.bytes, a.file.bytes)}</div>
    <div class="ar-detail-section"><h3>Platform budgets</h3>${budgetsTable(a.budgets)}</div>
    <div class="ar-detail-section"><h3>Issues &amp; recommendations</h3>${issuesList(a.issues)}</div>
    <div class="ar-detail-section"><h3>Textures</h3>${texturesTable(a.textures)}</div>
    <div class="ar-detail-section"><h3>Heaviest meshes</h3>${meshesTable(a.meshes)}</div>
    <div class="ar-detail-section"><h3>Animation &amp; rigging</h3>${animationsTable(a.animations, a.skins)}</div>`;
}

// ------------------------------------------------------------------ print

export function renderPrint(items, summary, target) {
  const date = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  return `
    <header class="ar-print-cover">
      <p class="ar-eyebrow">Asset Bench · Library report</p>
      <h1>Asset <span>Report</span></h1>
      <p>${date} · ${summary.total} assets · target: ${esc(targetLabel(target))}</p>
    </header>
    <section>${renderSummary(summary, target)}</section>
    <section class="ar-print-table"><h2>Assets</h2><table class="ar-table">${renderTable(items, { key: 'name', dir: 'asc' }, target, null)}</table></section>
    ${items.map((item) => `<section class="ar-print-asset">${renderDetail(item, null)}</section>`).join('')}`;
}
