import { bytes, esc, int, reduction } from './format.js';

/**
 * Asset table. Rows are plain UI records:
 *   { id, name, dir, sourceBytes, status, inspection, result, thumbUrl, selected, progress, error }
 * Every number shown comes from `inspection` (measured from the source) or
 * `result` (measured from the written output).
 */

const STATUS_LABEL = {
  queued: 'Queued',
  inspecting: 'Inspecting',
  ready: 'Ready',
  processing: 'Processing',
  done: 'Done',
  review: 'Review',
  failed: 'Failed',
  invalid: 'Unreadable',
  cancelled: 'Cancelled',
};

const st = (i) => i.inspection?.stats;
const f = (i) => i.inspection?.features;

export const COLUMNS = [
  { key: 'select', label: '', compact: true },
  { key: 'name', label: 'Asset', compact: true, sort: (i) => `${i.dir}${i.name}`.toLowerCase(), text: true },
  { key: 'size', label: 'Size', compact: true, sort: (i) => i.sourceBytes, cell: (i) => bytes(i.sourceBytes) },
  { key: 'tris', label: 'Tris', compact: true, sort: (i) => st(i)?.triangles ?? -1, cell: (i) => int(st(i)?.triangles) },
  { key: 'verts', label: 'Verts', sort: (i) => st(i)?.vertices ?? -1, cell: (i) => int(st(i)?.vertices) },
  { key: 'meshes', label: 'Meshes', sort: (i) => st(i)?.meshes ?? -1, cell: (i) => int(st(i)?.meshes) },
  { key: 'mats', label: 'Mats', sort: (i) => st(i)?.materials ?? -1, cell: (i) => int(st(i)?.materials) },
  { key: 'tex', label: 'Tex', sort: (i) => st(i)?.textures ?? -1, cell: (i) => int(st(i)?.textures) },
  { key: 'dims', label: 'Max tex', sort: (i) => st(i)?.maxTexture ?? -1, cell: (i) => (st(i)?.maxTexture ? `${st(i).maxTexture}px` : '—'), title: (i) => (i.inspection?.textures || []).map((t) => `${t.name}: ${t.width}×${t.height} ${t.role}`).join('\n') },
  { key: 'anim', label: 'Anim / skin', sort: (i) => (f(i)?.animations?.length || 0) + (f(i)?.skins ? 100 : 0), cell: (i) => animCell(i) },
  { key: 'gpu', label: 'GPU tex (est.)', sort: (i) => st(i)?.gpuTextureBytes ?? -1, cell: (i) => bytes(st(i)?.gpuTextureBytes) },
  { key: 'status', label: 'Status', compact: true, sort: (i) => Object.keys(STATUS_LABEL).indexOf(i.status), cell: (i) => statusCell(i) },
  { key: 'out', label: 'Output', sort: (i) => i.result?.outputBytes ?? -1, cell: (i) => bytes(i.result?.outputBytes) },
  { key: 'saved', label: 'Saved', compact: true, sort: (i) => (i.result?.outputBytes != null ? (i.sourceBytes - i.result.outputBytes) / i.sourceBytes : -9), cell: (i) => savedCell(i) },
];

function animCell(i) {
  const feat = f(i);
  if (!feat) return '—';
  const parts = [];
  if (feat.animations.length) parts.push(`${feat.animations.length} clip${feat.animations.length > 1 ? 's' : ''}`);
  if (feat.skins) parts.push(`skin ${feat.joints}j`);
  if (feat.morphTargets) parts.push(`${feat.morphTargets} morph`);
  return parts.length ? `<span class="ap-tag ap-tag--anim">${esc(parts.join(' · '))}</span>` : '—';
}

function statusCell(i) {
  const issues = i.inspection?.issues || [];
  const errs = issues.filter((x) => x.severity === 'error').length;
  const warns = issues.filter((x) => x.severity === 'warning').length;
  const pct = i.status === 'processing' && i.progress?.total ? Math.round((i.progress.index / i.progress.total) * 100) : null;
  const label = i.status === 'processing' && i.progress?.label ? i.progress.label : STATUS_LABEL[i.status] || i.status;
  return `<span class="ap-status-cell"><span class="ap-badge is-${i.status}">${esc(label)}</span>${pct != null ? `<span class="ap-mini-bar"><span style="width:${pct}%"></span></span>` : ''}${errs ? `<span class="ap-dot is-error" title="${errs} error(s)">${errs}</span>` : ''}${warns ? `<span class="ap-dot is-warn" title="${warns} warning(s)">${warns}</span>` : ''}</span>`;
}

function savedCell(i) {
  if (i.result?.outputBytes == null) return '—';
  const text = reduction(i.sourceBytes, i.result.outputBytes);
  return `<span class="${text.startsWith('+') ? 'is-worse' : 'is-better'}">${text}</span>`;
}

export function filterItems(items, { query, filter }) {
  const q = query.trim().toLowerCase();
  return items.filter((i) => {
    if (q && !`${i.dir}${i.name}`.toLowerCase().includes(q)) return false;
    switch (filter) {
      case 'ready':
        return i.status === 'ready';
      case 'issues':
        return (i.inspection?.issues || []).some((x) => x.severity !== 'info') || i.status === 'invalid';
      case 'animated':
        return Boolean(f(i)?.animations?.length || f(i)?.skins || f(i)?.morphTargets);
      case 'done':
        return i.status === 'done';
      case 'review':
        return i.status === 'review';
      case 'failed':
        return i.status === 'failed' || i.status === 'invalid' || i.status === 'cancelled';
      default:
        return true;
    }
  });
}

export function sortItems(items, sort) {
  const col = COLUMNS.find((c) => c.key === sort.key && c.sort) || COLUMNS[1];
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const va = col.sort(a);
    const vb = col.sort(b);
    return (col.text ? String(va).localeCompare(String(vb)) : va - vb) * dir;
  });
}

export function renderTable(table, rows, { sort, activeId, expanded }) {
  const cols = COLUMNS.filter((c) => expanded || c.compact);
  const head = `<thead><tr>${cols
    .map((c) => {
      if (c.key === 'select') return '<th class="ap-col-select"><span class="ap-sr">Select</span></th>';
      const active = sort.key === c.key;
      return `<th${c.key === 'name' ? ' class="ap-col-name"' : ''} aria-sort="${active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}"><button type="button" data-sort="${c.key}">${esc(c.label)}${active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}</button></th>`;
    })
    .join('')}</tr></thead>`;
  const body = rows
    .map(
      (i) => `<tr data-id="${i.id}" class="${i.id === activeId ? 'is-active' : ''}${i.selected ? ' is-selected' : ''}">${cols
        .map((c) => {
          if (c.key === 'select') return `<td class="ap-col-select"><input type="checkbox" data-select="${i.id}"${i.selected ? ' checked' : ''} aria-label="Select ${esc(i.name)}"></td>`;
          if (c.key === 'name') {
            return `<td class="ap-col-name"><button type="button" class="ap-name" data-open="${i.id}" title="${esc(i.dir + i.name)}">${i.thumbUrl ? `<img src="${i.thumbUrl}" alt="" loading="lazy">` : '<span class="ap-thumb-ph" aria-hidden="true"></span>'}<span><b>${esc(i.name)}</b>${i.dir ? `<small>${esc(i.dir)}</small>` : ''}</span></button></td>`;
          }
          const title = c.title?.(i);
          return `<td${title ? ` title="${esc(title)}"` : ''}>${c.cell(i)}</td>`;
        })
        .join('')}</tr>`
    )
    .join('');
  table.innerHTML = head + `<tbody>${body}</tbody>`;
}

/** Updates one row in place during processing (cheaper than a full re-render). */
export function updateRow(table, item, { expanded }) {
  const row = table.querySelector(`tr[data-id="${item.id}"]`);
  if (!row) return false;
  const cols = COLUMNS.filter((c) => expanded || c.compact);
  cols.forEach((c, idx) => {
    if (c.key === 'select' || c.key === 'name') return;
    const cell = row.children[idx];
    if (cell) cell.innerHTML = c.cell(item);
  });
  return true;
}
