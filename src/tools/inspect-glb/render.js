import { BYTE_CATEGORIES, INSPECT_GLB_CONFIG } from './config.js';
import { getToolById } from '../../shared/config/tools.js';

/**
 * Pure HTML renderers for each Inspect GLB tab. Every string that comes
 * from the file (names, generator, extension ids…) goes through esc().
 */

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export const fmtN = (n) => (Number.isFinite(n) ? n.toLocaleString('en-GB') : '—');
const fmtNum = (n, d = 3) => (Number.isFinite(n) ? String(+n.toFixed(d)) : '—');
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

function fmtMetric(value, unit) {
  if (unit === 'bytes') return fmtBytes(value);
  if (unit === 'px') return value ? `${fmtN(value)} px` : '—';
  return fmtN(value);
}

function fmtDims(bounds) {
  if (!bounds) return '—';
  const f = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  return bounds.size.map(f).join(' × ');
}

const empty = (text) => `<p class="ig-empty">${esc(text)}</p>`;
const chip = (status) => `<span class="ig-chip ig-chip--${status}">${status}</span>`;

// ---------------------------------------------------------------- strip

export function renderStrip(a) {
  const { totals, health } = a;
  const stats = [
    ['File size', fmtBytes(a.file.bytes)],
    ['Triangles', fmtN(totals.triangles)],
    ['Vertices', fmtN(totals.vertices)],
    ['Draw calls', fmtN(totals.drawCalls)],
    ['Materials', fmtN(totals.materials)],
    ['Textures', fmtN(totals.textures)],
    ['Animations', fmtN(totals.animations)],
    ['Est. GPU memory', fmtBytes(a.gpu.totalBytes)],
    ['Size (m)', fmtDims(a.bounds)],
  ];
  return `
    <div class="ig-grade ig-grade--${health.grade.toLowerCase()}" title="Health score">
      <span class="ig-grade__letter">${health.grade}</span>
      <span class="ig-grade__text"><strong>${health.score}/100</strong><small>${esc(health.summary)}</small></span>
    </div>
    ${stats.map(([k, v]) => `<div class="ig-stat${k === 'Size (m)' ? ' ig-stat--wide' : ''}"><span>${k}</span><strong title="${esc(v)}">${esc(v)}</strong></div>`).join('')}`;
}

// ------------------------------------------------------------- overview

export function renderOverview(a) {
  const total = BYTE_CATEGORIES.reduce((s, c) => s + (a.bytes[c.key] || 0), 0);
  const cats = BYTE_CATEGORIES.filter((c) => a.bytes[c.key] > 0);
  const f = a.file;
  const list = (items) => (items.length ? items.map((e) => `<code>${esc(e)}</code>`).join(' ') : '<span class="ig-muted">none</span>');
  const info = [
    ['Format', f.kind === 'glb' ? `GLB (binary, v${f.glbVersion ?? '?'})` : 'glTF (JSON)'],
    ['glTF version', f.gltfVersion || '—'],
    ['Generator', f.generator || '—'],
    ['Copyright', f.copyright || '—'],
    ['Scenes / nodes', `${fmtN(a.totals.scenes)} / ${fmtN(a.totals.nodes)}`],
    ['Unique tris / verts', `${fmtN(a.totals.uniqueTriangles)} / ${fmtN(a.totals.uniqueVertices)}`],
    ['GPU geometry / textures', `${fmtBytes(a.gpu.geometryBytes)} / ${fmtBytes(a.gpu.textureBytes)}`],
    ['Bounds min', a.bounds ? a.bounds.min.map((v) => fmtNum(v)).join(', ') : '—'],
    ['Bounds max', a.bounds ? a.bounds.max.map((v) => fmtNum(v)).join(', ') : '—'],
    ['Analysed in', `${fmtN(a.analysedInMs)} ms`],
  ];
  return `
    <h3 class="ig-h3">Where are the bytes</h3>
    <p class="ig-sub">On-disk breakdown of ${esc(fmtBytes(total))}${total === f.bytes ? ' — adds up to the full file' : ''}.</p>
    <div class="ig-bytebar" role="img" aria-label="File size breakdown">
      ${cats.map((c) => `<span style="width:${pct(a.bytes[c.key], total).toFixed(3)}%;background:${c.color}" title="${c.label}: ${fmtBytes(a.bytes[c.key])}"></span>`).join('')}
    </div>
    <ul class="ig-legend">
      ${cats.map((c) => `<li><i style="background:${c.color}"></i><span>${c.label}</span><strong>${fmtBytes(a.bytes[c.key])}</strong><em>${pct(a.bytes[c.key], total).toFixed(1)}%</em></li>`).join('')}
    </ul>

    <h3 class="ig-h3">File info</h3>
    <dl class="ig-kv">
      ${info.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}
      <dt>Extensions used</dt><dd>${list(a.extensions.used)}</dd>
      <dt>Extensions required</dt><dd>${list(a.extensions.required)}</dd>
      <dt>Stored with</dt><dd>${list(a.extensions.raw.filter((e) => /draco|meshopt|quantization|basisu|webp|avif/i.test(e)))}</dd>
      ${f.missingResources.length ? `<dt>Missing files</dt><dd class="ig-bad">${esc(f.missingResources.join(', '))}</dd>` : ''}
    </dl>

    <h3 class="ig-h3">Platform budgets</h3>
    <p class="ig-sub">Pass ≤ budget · warn ≤ 1.5× · fail above. Guides for a single hero asset, not hard limits.</p>
    <div class="ig-scroll">
      <table class="ig-table ig-budgets">
        <thead><tr><th>Metric</th>${a.budgets.map((b) => `<th>${esc(b.label)} ${chip(b.status)}</th>`).join('')}</tr></thead>
        <tbody>
          ${a.budgets[0].metrics
            .map(
              (m, mi) => `<tr><td><strong>${esc(m.label)}</strong><br><small>${esc(fmtMetric(m.value, m.unit))}</small></td>${a.budgets
                .map((b) => {
                  const bm = b.metrics[mi];
                  return `<td>${chip(bm.status)}<small>≤ ${esc(fmtMetric(bm.limit, bm.unit))}</small></td>`;
                })
                .join('')}</tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------- scene

export function renderScene(a, state) {
  if (!a.scenes.length) return empty('This file has no scenes.');
  const selected = findNode(a, state.selectedNode);
  const renderNode = (node, depth) => {
    const open = !state.collapsed.has(node.index);
    const badges = [
      node.mesh != null && `<span class="ig-badge ig-badge--mesh">mesh</span>`,
      node.skin != null && `<span class="ig-badge ig-badge--skin">skin</span>`,
      node.joint && `<span class="ig-badge ig-badge--joint">joint</span>`,
      node.camera && `<span class="ig-badge">camera</span>`,
      node.light && `<span class="ig-badge">light</span>`,
      node.negativeScale && `<span class="ig-badge ig-badge--warn">−scale</span>`,
    ].filter(Boolean).join('');
    const hasKids = node.children.length > 0;
    return `
      <li>
        <div class="ig-node${state.selectedNode === node.index ? ' is-selected' : ''}" data-node="${node.index}" style="--depth:${depth}">
          ${hasKids ? `<button type="button" class="ig-twisty" data-toggle="${node.index}" aria-label="${open ? 'Collapse' : 'Expand'}" aria-expanded="${open}">${open ? '▾' : '▸'}</button>` : '<span class="ig-twisty ig-twisty--leaf">·</span>'}
          <span class="ig-node__name">${esc(node.name)}</span>${badges}
          ${hasKids ? `<small class="ig-muted">${node.children.length}</small>` : ''}
        </div>
        ${hasKids && open ? `<ul>${node.children.map((c) => renderNode(c, depth + 1)).join('')}</ul>` : ''}
      </li>`;
  };
  const trs = selected
    ? `<div class="ig-trs">
        <h4>${esc(selected.name)}</h4>
        <dl class="ig-kv">
          <dt>Translation</dt><dd>${selected.translation.map((v) => fmtNum(v)).join(', ')}</dd>
          <dt>Rotation (quat)</dt><dd>${selected.rotation.map((v) => fmtNum(v)).join(', ')}</dd>
          <dt>Scale</dt><dd>${selected.scale.map((v) => fmtNum(v)).join(', ')}</dd>
          <dt>Mesh</dt><dd>${selected.mesh != null ? esc(a.meshes[selected.mesh]?.name) : '—'}</dd>
          ${selected.mesh != null ? `<dt>Mesh stats</dt><dd>${fmtN(a.meshes[selected.mesh].triangleCount)} tris · ${fmtN(a.meshes[selected.mesh].vertexCount)} verts</dd>` : ''}
          <dt>Skin</dt><dd>${selected.skin != null ? esc(a.skins[selected.skin]?.name) : '—'}</dd>
          <dt>Children</dt><dd>${selected.children.length}</dd>
        </dl>
      </div>`
    : '<p class="ig-sub">Select a node to see its transform. Mesh nodes highlight in the preview.</p>';
  return `
    <div class="ig-tree-actions">
      <button type="button" class="ig-tool" data-tree="expand">Expand all</button>
      <button type="button" class="ig-tool" data-tree="collapse">Collapse all</button>
    </div>
    <div class="ig-scene">
      <div class="ig-tree">${a.scenes.map((s) => `<p class="ig-tree__scene">${esc(s.name)}</p><ul>${s.nodes.map((n) => renderNode(n, 0)).join('')}</ul>`).join('')}</div>
      ${trs}
    </div>`;
}

export function findNode(a, index) {
  if (index == null) return null;
  let hit = null;
  const walk = (n) => {
    if (hit) return;
    if (n.index === index) hit = n;
    else n.children.forEach(walk);
  };
  a.scenes.forEach((s) => s.nodes.forEach(walk));
  return hit;
}

export function allNodeIndices(a) {
  const out = [];
  const walk = (n) => {
    if (n.children.length) out.push(n.index);
    n.children.forEach(walk);
  };
  a.scenes.forEach((s) => s.nodes.forEach(walk));
  return out;
}

// --------------------------------------------------------------- meshes

/** "Mesh 3" is the engine's fallback for unnamed meshes — show the placing node's name instead. */
export function meshLabel(a, mesh) {
  if (!/^Mesh \d+$/.test(mesh.name)) return mesh.name;
  const names = [];
  const walk = (n) => {
    if (n.mesh === mesh.index && !/^Node \d+$/.test(n.name)) names.push(n.name);
    n.children.forEach(walk);
  };
  a.scenes.forEach((sc) => sc.nodes.forEach(walk));
  return names.length ? `${mesh.name} (${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''})` : mesh.name;
}

const MESH_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'instances', label: 'Inst.' },
  { key: 'triangleCount', label: 'Tris' },
  { key: 'vertexCount', label: 'Verts' },
  { key: 'primitives', label: 'Prims' },
  { key: 'morphTargets', label: 'Morphs' },
  { key: 'byteLength', label: 'Memory' },
];

export function renderMeshes(a, state) {
  if (!a.meshes.length) return empty('This file has no meshes.');
  const { key, dir } = state.meshSort;
  const value = (m) => (key === 'primitives' ? m.primitives.length : key === 'name' ? meshLabel(a, m) : m[key]);
  const rows = [...a.meshes].sort((x, y) => {
    const vx = value(x);
    const vy = value(y);
    const c = typeof vx === 'string' ? vx.localeCompare(vy) : vx - vy;
    return dir === 'asc' ? c : -c;
  });
  return `
    <p class="ig-sub">Triangle and vertex counts are per mesh; the header totals multiply by instances. Memory is the decoded (uncompressed) vertex + index data.</p>
    <div class="ig-scroll">
      <table class="ig-table ig-meshes">
        <thead><tr><th></th>${MESH_COLUMNS.map((c) => `<th><button type="button" class="ig-sort${c.key === key ? ` is-${dir}` : ''}" data-sort="${c.key}">${c.label}</button></th>`).join('')}</tr></thead>
        <tbody>
          ${rows
            .map((m) => {
              const open = state.expandedMeshes.has(m.index);
              return `
                <tr class="ig-mesh-row${state.highlight === m.index ? ' is-selected' : ''}" data-mesh="${m.index}">
                  <td><button type="button" class="ig-twisty" data-expand-mesh="${m.index}" aria-expanded="${open}" aria-label="Show primitives">${open ? '▾' : '▸'}</button></td>
                  <td class="ig-name" title="${esc(meshLabel(a, m))}">${esc(meshLabel(a, m))}</td><td>${fmtN(m.instances)}</td><td>${fmtN(m.triangleCount)}</td><td>${fmtN(m.vertexCount)}</td>
                  <td>${m.primitives.length}</td><td>${m.morphTargets || '—'}</td><td>${fmtBytes(m.byteLength)}</td>
                </tr>
                ${open ? `<tr class="ig-subrow"><td colspan="8">${renderPrimitives(a, m)}</td></tr>` : ''}`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function renderPrimitives(a, mesh) {
  return mesh.primitives
    .map(
      (p, i) => `
      <div class="ig-prim">
        <p class="ig-prim__head"><strong>Primitive ${i}</strong>
          <span>${esc(p.mode)}</span>
          <span>material: ${p.material != null ? esc(a.materials[p.material]?.name) : '<em>none</em>'}</span>
          <span>${p.indexed ? `${esc(p.indexType)} indices (${fmtN(p.indexCount)}, ${fmtBytes(p.indexBytes)})` : '<em>unindexed</em>'}</span>
          ${p.compression ? `<span class="ig-badge ig-badge--mesh">${esc(p.compression)}</span>` : ''}
          ${p.morphTargets ? `<span>${p.morphTargets} morph targets (${fmtBytes(p.morphTargetBytes)})</span>` : ''}
        </p>
        <table class="ig-table ig-attrs">
          <thead><tr><th>Semantic</th><th>Type</th><th>Component</th><th>Norm.</th><th>Count</th><th>Bytes</th></tr></thead>
          <tbody>${p.attributes.map((x) => `<tr><td><code>${esc(x.semantic)}</code></td><td>${esc(x.type)}</td><td>${esc(x.componentType)}</td><td>${x.normalized ? 'yes' : '—'}</td><td>${fmtN(x.count)}</td><td>${fmtBytes(x.byteLength)}</td></tr>`).join('')}</tbody>
        </table>
      </div>`,
    )
    .join('');
}

// ------------------------------------------------------------ materials

const SLOT_LABELS = { baseColor: 'Base colour', metallicRoughness: 'Metal / rough', normal: 'Normal', occlusion: 'Occlusion', emissive: 'Emissive' };

function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
}

export function renderMaterials(a) {
  if (!a.materials.length) return empty('This file has no materials.');
  return `<div class="ig-cards">${a.materials
    .map((m) => {
      const [r, g, b, alpha] = m.baseColorFactor;
      const base = `rgba(${linearToSrgb(r)},${linearToSrgb(g)},${linearToSrgb(b)},${alpha})`;
      const [er, eg, eb] = m.emissiveFactor;
      const emissive = `rgb(${linearToSrgb(er)},${linearToSrgb(eg)},${linearToSrgb(eb)})`;
      const slots = Object.entries(m.textures);
      return `
        <article class="ig-mat">
          <header><h4>${esc(m.name)}</h4><small>${m.users} ${m.users === 1 ? 'primitive' : 'primitives'}${m.users === 0 ? ' · <span class="ig-bad">unused</span>' : ''}</small></header>
          <div class="ig-swatches">
            <div class="ig-swatch"><i class="ig-swatch__chip ig-swatch__chip--alpha"><b style="background:${base}"></b></i><span>Base<br><small>${[r, g, b, alpha].map((v) => fmtNum(v, 2)).join(', ')}</small></span></div>
            <div class="ig-swatch"><i class="ig-swatch__chip"><b style="background:${emissive}"></b></i><span>Emissive<br><small>${m.emissiveFactor.map((v) => fmtNum(v, 2)).join(', ')}</small></span></div>
            <div class="ig-swatch"><i class="ig-meter"><b style="width:${m.metallicFactor * 100}%"></b></i><span>Metallic<br><small>${fmtNum(m.metallicFactor, 2)}</small></span></div>
            <div class="ig-swatch"><i class="ig-meter"><b style="width:${m.roughnessFactor * 100}%"></b></i><span>Roughness<br><small>${fmtNum(m.roughnessFactor, 2)}</small></span></div>
          </div>
          <dl class="ig-kv ig-kv--tight">
            <dt>Alpha</dt><dd>${esc(m.alphaMode)}${m.alphaMode === 'MASK' ? ` (cutoff ${fmtNum(m.alphaCutoff, 2)})` : ''}</dd>
            <dt>Double-sided</dt><dd>${m.doubleSided ? 'yes' : 'no'}</dd>
            <dt>Textures</dt><dd>${slots.length ? slots.map(([slot, ti]) => `<button type="button" class="ig-link" data-goto-texture="${ti}">${SLOT_LABELS[slot] || esc(slot)}: ${esc(a.textures[ti]?.name)}</button>`).join('') : '<span class="ig-muted">none</span>'}</dd>
            <dt>Extensions</dt><dd>${m.extensions.length ? m.extensions.map((e) => `<code>${esc(e)}</code>`).join(' ') : '<span class="ig-muted">none</span>'}</dd>
          </dl>
        </article>`;
    })
    .join('')}</div>`;
}

// ------------------------------------------------------------- textures

export function renderTextures(a, thumbs) {
  if (!a.textures.length) return empty('This file has no textures.');
  return `<div class="ig-texgrid">${a.textures
    .map((t) => {
      const thumb = thumbs.get(t.index);
      const usedBy = t.materials.map((mi) => a.materials[mi]?.name).filter(Boolean);
      return `
        <article class="ig-tex" id="ig-tex-${t.index}">
          <div class="ig-tex__thumb">${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : `<span>${t.format === 'KTX2' ? 'KTX2 — no preview' : 'No preview'}</span>`}</div>
          <div class="ig-tex__body">
            <h4 title="${esc(t.name)}">${esc(t.name)}</h4>
            <p class="ig-tex__badges">
              <span class="ig-badge">${esc(t.format)}</span>
              ${t.width ? `<span class="ig-badge ${t.pot ? 'ig-badge--ok' : 'ig-badge--warn'}">${t.pot ? 'POT' : 'NPOT'}</span>` : ''}
              ${t.duplicateOf != null ? `<span class="ig-badge ig-badge--warn">duplicate of #${t.duplicateOf}</span>` : ''}
              ${t.slots.length ? '' : '<span class="ig-badge ig-badge--warn">unused</span>'}
            </p>
            <dl class="ig-kv ig-kv--tight">
              <dt>Size</dt><dd>${t.width ? `${t.width} × ${t.height}` : 'unknown'}</dd>
              <dt>File</dt><dd>${fmtBytes(t.byteLength)}</dd>
              <dt>Est. GPU</dt><dd>${fmtBytes(t.gpuBytes)}</dd>
              <dt>Slots</dt><dd>${t.slots.length ? t.slots.map((s) => `<code>${esc(s)}</code>`).join(' ') : '—'}</dd>
              <dt>Used by</dt><dd>${usedBy.length ? esc(usedBy.join(', ')) : '—'}</dd>
            </dl>
          </div>
        </article>`;
    })
    .join('')}</div>`;
}

// ----------------------------------------------------------- animations

export function renderAnimations(a, state) {
  if (!a.animations.length) return empty('This file has no animation clips.');
  return a.animations
    .map((clip) => {
      const open = state.expandedClips.has(clip.index);
      const playing = state.playingClip === clip.index;
      return `
        <article class="ig-clip">
          <header>
            <h4>${esc(clip.name)}</h4>
            <button type="button" class="ig-tool${playing ? ' is-on' : ''}" data-play-clip="${clip.index}">${playing ? 'Stop' : 'Play'}</button>
          </header>
          <dl class="ig-mini">
            <div><dt>Duration</dt><dd>${fmtNum(clip.duration, 2)} s</dd></div>
            <div><dt>Channels</dt><dd>${fmtN(clip.channelCount)}</dd></div>
            <div><dt>Keyframes</dt><dd>${fmtN(clip.keyframes)}</dd></div>
            <div><dt>~Keys / s</dt><dd>${fmtN(clip.sampleRate)}</dd></div>
            <div><dt>Static</dt><dd class="${clip.staticChannels ? 'ig-warn' : ''}">${fmtN(clip.staticChannels)}</dd></div>
          </dl>
          <button type="button" class="ig-link" data-expand-clip="${clip.index}" aria-expanded="${open}">${open ? 'Hide' : 'Show'} channels</button>
          ${open ? `<div class="ig-scroll"><table class="ig-table"><thead><tr><th>Node</th><th>Path</th><th>Interp.</th><th>Keys</th><th>Static</th></tr></thead><tbody>${clip.channels.map((c) => `<tr><td class="ig-name">${esc(c.node || '—')}</td><td>${esc(c.path)}</td><td>${esc(c.interpolation)}</td><td>${fmtN(c.keyframes)}</td><td>${c.static ? '<span class="ig-warn">static</span>' : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
        </article>`;
    })
    .join('');
}

// ---------------------------------------------------------------- skins

export function renderSkins(a) {
  if (!a.skins.length) return empty('This file has no skins (not rigged).');
  return a.skins
    .map(
      (s) => `
      <article class="ig-clip">
        <header><h4>${esc(s.name)}</h4></header>
        <dl class="ig-mini">
          <div><dt>Joints</dt><dd class="${s.jointCount > 255 ? 'ig-warn' : ''}">${fmtN(s.jointCount)}</dd></div>
          <div><dt>Skeleton root</dt><dd>${esc(s.skeleton || '—')}</dd></div>
          <div><dt>Max influences</dt><dd class="${s.maxInfluences > 4 ? 'ig-warn' : ''}">${s.maxInfluences || '—'}</dd></div>
        </dl>
        <details class="ig-details"><summary>Joint names (${s.joints.length})</summary><ol class="ig-joints">${s.joints.map((j) => `<li>${esc(j)}</li>`).join('')}</ol></details>
      </article>`,
    )
    .join('');
}

// --------------------------------------------------------------- issues

const SEVERITIES = [
  { id: 'error', label: 'Errors' },
  { id: 'warning', label: 'Warnings' },
  { id: 'info', label: 'Suggestions' },
];

export function renderIssues(a) {
  if (!a.issues.length) return `<div class="ig-allclear"><strong>No issues found.</strong><span>This asset passes every check.</span></div>`;
  return SEVERITIES.map((sev) => {
    const list = a.issues.filter((i) => i.severity === sev.id);
    if (!list.length) return '';
    return `
      <h3 class="ig-h3">${sev.label} <span class="ig-count ig-count--${sev.id}">${list.length}</span></h3>
      <ul class="ig-issues">
        ${list
          .map((i) => {
            const tool = i.fix ? getToolById(i.fix.tool) : null;
            return `
              <li class="ig-issue ig-issue--${i.severity}">
                <div>
                  <p class="ig-issue__title">${esc(i.title)} <small>${esc(i.category)}</small></p>
                  <p class="ig-issue__detail">${esc(i.detail)}</p>
                </div>
                ${i.fix ? `<button type="button" class="ig-button ig-button--fix" data-fix="${esc(i.fix.tool)}"${tool && tool.status === 'coming-soon' ? ' title="Coming soon"' : ''}>Fix with ${esc(i.fix.label)} →</button>` : ''}
              </li>`;
          })
          .join('')}
      </ul>`;
  }).join('');
}

// ----------------------------------------------------------------- json

export function renderJson(jsonText) {
  const tooBig = jsonText.length > INSPECT_GLB_CONFIG.maxJsonDisplayBytes;
  const shown = tooBig ? jsonText.slice(0, INSPECT_GLB_CONFIG.maxJsonDisplayBytes) : jsonText;
  return `
    <div class="ig-json-actions">
      <button type="button" class="ig-button" data-json="copy">Copy JSON</button>
      <button type="button" class="ig-button" data-json="download">Download glTF JSON</button>
      <button type="button" class="ig-button ig-button--primary" data-json="analysis">Download analysis (JSON)</button>
      <small class="ig-muted">${fmtBytes(jsonText.length)} pretty-printed</small>
    </div>
    ${tooBig ? `<p class="ig-notice-inline">Showing the first ${fmtBytes(INSPECT_GLB_CONFIG.maxJsonDisplayBytes)}. Download for the full JSON.</p>` : ''}
    <pre class="ig-json"><code>${esc(shown)}</code></pre>`;
}
