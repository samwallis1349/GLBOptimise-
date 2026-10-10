import { ENGINE_PRESETS, MAX_SIZE_CHOICES, MODES, TEXTURE_FORMATS, TEXTURE_ROLES } from '../engine/settings.js';
import { STAGES, checkStageOrder } from '../engine/stages.js';
import { BUDGET_METRICS } from '../engine/budgets.js';
import { esc } from './format.js';

/**
 * Right-hand panel: every pipeline setting, bound by dotted path to the
 * settings object. Sections are <details> so advanced groups stay folded.
 * Options that change appearance, hierarchy or behaviour carry a ⚠ and an
 * explanation; capabilities this build does not have are shown disabled
 * with the reason, never as working toggles.
 */

const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function set(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

const warnMark = (text) => `<span class="ap-warn-mark" title="${esc(text)}" aria-label="${esc(text)}">⚠</span>`;

function check(path, label, { hint = '', warn = '' } = {}) {
  return `<label class="ap-check"><input type="checkbox" data-path="${path}"><span>${esc(label)}${warn ? warnMark(warn) : ''}${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;
}
function num(path, label, { min = 0, max = '', step = 1, unit = '', hint = '' } = {}) {
  return `<label class="ap-field"><span>${esc(label)}</span><span class="ap-input-unit"><input type="number" data-path="${path}" min="${min}" max="${max}" step="${step}" inputmode="decimal">${unit ? `<em>${esc(unit)}</em>` : ''}</span>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}
function select(path, label, options, { hint = '', warn = '' } = {}) {
  return `<label class="ap-field"><span>${esc(label)}${warn ? warnMark(warn) : ''}</span><select data-path="${path}">${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}
function text(path, label, { hint = '' } = {}) {
  return `<label class="ap-field"><span>${esc(label)}</span><input type="text" data-path="${path}" spellcheck="false">${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}
function inherent(items) {
  return `<ul class="ap-facts">${items.map(([label, state, note]) => `<li class="is-${state}"><b>${state === 'yes' ? '✓' : state === 'no' ? '—' : '•'}</b><span>${esc(label)}<small>${esc(note)}</small></span></li>`).join('')}</ul>`;
}
const section = (id, title, body, open = false) => `<details class="ap-sec" data-sec="${id}"${open ? ' open' : ''}><summary>${esc(title)}<span class="ap-sec-badge" data-badge="${id}"></span></summary><div class="ap-sec-body">${body}</div></details>`;

const sizeOptions = MAX_SIZE_CHOICES.map((v) => [String(v), v === 0 ? 'Original' : `${v}px`]).concat([['custom', 'Custom…']]);

export function renderSettingsPanel(host, { formats }) {
  host.innerHTML = [
    `<div class="ap-presets">
      ${select('engine', 'Engine / platform preset', Object.entries(ENGINE_PRESETS).map(([k, v]) => [k, v.label]))}
      <div class="ap-field"><span>Optimisation mode</span><div class="ap-seg" role="group" aria-label="Optimisation mode">${Object.entries(MODES).map(([k, m]) => `<button type="button" data-mode="${k}" title="${esc(m.blurb)}">${esc(m.label)}</button>`).join('')}</div></div>
      <p class="ap-note" data-note="engine"></p>
      <p class="ap-note" data-note="mode"></p>
    </div>`,
    section('stages', 'Pipeline stages', `<ol class="ap-stages" data-stages></ol><div class="ap-order-msgs" data-order></div>`, true),
    section(
      'geometry',
      'Geometry',
      [
        check('geometry.simplify', 'Polygon reduction', { warn: 'Removes triangles: silhouettes and small details can change.' }),
        `<div class="ap-quality"><label class="ap-field"><span>Target quality: keep <b data-out="keepPercent"></b>% of triangles</span><input type="range" min="1" max="100" step="1" data-path="geometry.keepPercent"></label></div>`,
        `<div class="ap-grid2">`,
        select('geometry.targetMode', 'Target by', [['percent', 'Percentage kept'], ['triangles', 'Triangle count']]),
        num('geometry.keepPercent', 'Keep', { min: 1, max: 100, unit: '%' }),
        num('geometry.targetTriangles', 'Target triangles', { min: 1 }),
        select('geometry.scope', 'Applies to', [['model', 'Whole model'], ['mesh', 'Each mesh']]),
        num('geometry.minTriangles', 'Minimum triangles', { min: 0, hint: 'Never reduce below' }),
        num('geometry.maxTriangles', 'Maximum triangles', { min: 0, hint: '0 = no cap' }),
        num('geometry.error', 'Error limit', { min: 0.0001, max: 1, step: 0.001, hint: 'Fraction of mesh size' }),
        `</div>`,
        check('geometry.lockBorder', 'Preserve mesh boundaries', { hint: 'Locks open edges and UV/material borders' }),
        check('geometry.allowDeforming', 'Simplify skinned & morph-target meshes', { warn: 'Can break deformation, skin weights and blend shapes. Off by default; animated characters are left alone.' }),
        `<details class="ap-sub"><summary>Clean-up &amp; draw calls</summary>`,
        check('geometry.weld', 'Weld duplicate vertices'),
        check('geometry.removeDegenerate', 'Remove degenerate triangles'),
        check('geometry.dedupe', 'Remove duplicate geometry'),
        check('geometry.joinPrimitives', 'Simplify draw calls where safe', { hint: 'Joins primitives sharing a material inside one mesh' }),
        check('geometry.recalcNormals', 'Recalculate normals', { warn: 'Replaces authored smoothing and custom normals.' }),
        `<label class="ap-check is-disabled"><input type="checkbox" disabled><span>Recalculate tangents<small>Not available: needs a MikkTSpace generator, which this build does not include. Existing tangents are preserved.</small></span></label>`,
        check('geometry.reorder', 'Reorder for vertex cache'),
        check('geometry.quantize', 'Quantize vertex attributes', { hint: 'Smaller files; requires KHR_mesh_quantization support' }),
        `</details>`,
        `<details class="ap-sub"><summary>Always preserved</summary>`,
        inherent([
          ['UVs & seams', 'yes', 'Welding is exact, so seam vertices never merge'],
          ['Hard edges', 'yes', 'Split normals keep hard-edge vertices separate'],
          ['Vertex colours, normals, tangents', 'yes', 'Carried through simplification'],
          ['Mesh names, node hierarchy, transforms', 'yes', 'Unless you merge meshes or convert axes'],
          ['Material assignments', 'yes', 'Each primitive keeps its material'],
          ['Skin weights & morph targets', 'yes', 'Deforming meshes are skipped unless allowed'],
          ['Animation compatibility', 'yes', 'Joints, node names and clips are untouched by geometry stages'],
          ['Points / lines', 'no', 'Never simplified, passed through'],
        ]),
        `</details>`,
      ].join(''),
      true
    ),
    section(
      'textures',
      'Textures',
      `<div class="ap-tex-roles" role="table" aria-label="Texture settings per role">
        <div class="ap-tex-row ap-tex-head" role="row"><span>Role</span><span>Max size</span><span>Format</span><span>Quality</span></div>
        ${TEXTURE_ROLES.map(
          (r) => `<div class="ap-tex-row" role="row" data-role="${r.id}">
            <span>${esc(r.label)}${r.colour ? '' : '<small>data</small>'}</span>
            <span class="ap-size"><select data-size="${r.id}" aria-label="${esc(r.label)} max size">${sizeOptions.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><input type="number" min="16" max="16384" step="1" data-size-custom="${r.id}" aria-label="${esc(r.label)} custom size" hidden></span>
            <select data-path="textures.roles.${r.id}.format" aria-label="${esc(r.label)} format">${TEXTURE_FORMATS.map((f) => `<option value="${f.id}"${formats[f.id] ? '' : ' disabled'}>${esc(f.label)}${formats[f.id] ? '' : ' (unavailable)'}</option>`).join('')}</select>
            <input type="number" min="1" max="100" data-path="textures.roles.${r.id}.quality" aria-label="${esc(r.label)} quality">
          </div>`
        ).join('')}
      </div>
      <p class="ap-note">Only textures larger than their limit are resized; nothing is upscaled. Normal and packed data maps stay lossless unless you allow lossy data maps.</p>
      <div class="ap-estimate" data-estimate></div>
      ${check('textures.powerOfTwo', 'Power-of-two sizes', { hint: 'For mipmap compatibility on older GPUs' })}
      ${check('textures.dedupe', 'Deduplicate identical textures')}
      ${check('textures.removeUnused', 'Remove unused textures')}
      ${check('textures.lossyDataMaps', 'Allow lossy formats on normal / data maps', { warn: 'JPEG/WebP/ETC1S on normal or packed maps causes lighting artefacts.' })}
      ${check('textures.keepOriginals', 'Keep original textures as a backup', { hint: 'Adds <asset>_original_textures/ to the download' })}
      ${select('textures.output', 'Texture output', [['embedded', 'Embedded in the GLB'], ['separate', 'Separate files (.gltf + .bin + images)']])}
      <details class="ap-sub"><summary>KTX2 / Basis</summary>
        ${select('textures.ktx2.mode', 'Mode', [['auto', 'Auto (UASTC for data maps, ETC1S for colour)'], ['etc1s', 'ETC1S: smallest'], ['uastc', 'UASTC: highest quality']])}
        ${num('textures.ktx2.quality', 'ETC1S quality', { min: 1, max: 255 })}
        ${check('textures.ktx2.mipmaps', 'Generate mipmaps')}
        <p class="ap-note">${formats.ktx2 ? 'KTX2 output marks KHR_texture_basisu as required: loaders need a Basis transcoder (three.js KTX2Loader, glTFast + KTX package). Unreal’s importer does not read it.' : 'KTX2 encoder unavailable in this browser.'}</p>
      </details>
      ${formats.webp ? '' : '<p class="ap-note">WebP is unavailable: this browser cannot encode it.</p>'}`
    ),
    section(
      'lods',
      'LODs',
      `<p class="ap-note">Enable <b>Generate LODs</b> in the stage list to use these. Each level is simplified from the geometry entering the stage (LOD0), not from the previous level.</p>
      <div class="ap-seg ap-seg--small" role="group" aria-label="LOD presets">
        <button type="button" data-lodpreset="100,50,25,10">100/50/25/10</button>
        <button type="button" data-lodpreset="100,35,15,5">Aggressive</button>
        <button type="button" data-lodpreset="100,50">Two levels</button>
      </div>
      <div class="ap-lod-table" data-lods></div>
      <button type="button" class="ap-btn ap-btn--xs" data-lod-add>Add level</button>
      <div class="ap-grid2">
        ${num('lods.error', 'Error limit', { min: 0.0001, max: 1, step: 0.001 })}
        ${select('lods.grouping', 'Export', [['separate', 'Separate files'], ['grouped', 'One grouped file']])}
      </div>
      ${check('lods.lockBorder', 'Preserve mesh boundaries in LODs')}
      ${check('lods.collision', 'Generate a collision mesh', { hint: 'Positions only, from LOD0; skipped for skinned characters' })}
      ${num('lods.collisionTriangles', 'Collision triangles', { min: 12, hint: 'Unity convex colliders allow 255' })}
      <p class="ap-note">A generated LOD file does not switch automatically. Your engine (Unity LOD Group, Unreal LOD settings, Godot visibility ranges, THREE.LOD) or runtime code decides when each level shows. Distances and screen sizes are written to the manifest and scene extras as hints.</p>`
    ),
    section(
      'animation',
      'Animation',
      `${check('animation.resample', 'Remove redundant keyframes', { hint: 'Drops keys exactly interpolable from neighbours' })}
      ${num('animation.tolerance', 'Tolerance', { min: 0, max: 0.1, step: 0.0001 })}
      ${check('animation.removeAnimations', 'Remove all animations', { warn: 'Deletes every clip. Characters will no longer animate.' })}
      ${inherent([
        ['Clip names', 'yes', 'Validated after export'],
        ['Skins & skeletons', 'yes', 'Joint counts validated after export'],
      ])}`
    ),
    section(
      'advanced',
      'Advanced asset settings',
      `<div class="ap-grid2">
        ${num('advanced.scale', 'Scale / unit conversion', { min: 0.000001, step: 0.01, hint: '0.01 = centimetres → metres' })}
        ${select('advanced.sourceUp', 'Source up axis', [['y', 'Y-up (glTF standard)'], ['z', 'Z-up → convert to Y-up']], { warn: 'Rotates the asset.' })}
        ${select('advanced.origin', 'Origin', [['preserve', 'Preserve'], ['center', 'Centre of bounds'], ['below', 'Base centre (sits on ground)']], { warn: 'Moves the asset relative to its pivot. Skipped on animated or skinned assets.' })}
      </div>
      ${check('advanced.removeEmptyNodes', 'Remove empty nodes', { warn: 'Changes the hierarchy if empty nodes were used as locators.' })}
      ${check('advanced.removeUnusedMaterials', 'Remove unused materials')}
      ${check('advanced.keepExtras', 'Preserve extras & custom metadata')}
      ${check('advanced.keepCameras', 'Preserve cameras')}
      ${check('advanced.keepLights', 'Preserve lights')}
      ${check('advanced.mergeMeshes', 'Merge compatible meshes', { warn: 'Changes the node hierarchy and mesh names. Skipped on animated or skinned assets.' })}
      ${check('advanced.instance', 'Instance repeated geometry (EXT_mesh_gpu_instancing)', { warn: 'Needs engine support for the extension.' })}
      ${inherent([
        ['Embedded images, animation clips & names, skins, morph targets', 'yes', 'Preserved by every stage; checked by validation'],
        ['Transform baking', 'no', 'Not offered: baking node transforms into vertices is unsafe for animated and skinned assets'],
        ['Thumbnails, JSON manifest, processing report', '•', 'See Export'],
      ])}`
    ),
    section(
      'budgets',
      'Budgets',
      `${check('budgets.enabled', 'Check outputs against budgets')}
      ${select('budgets.onExceed', 'When an asset is over a failure limit', [['review', 'Mark for manual review'], ['optimise', 'Try further optimisation, then review']])}
      ${num('budgets.minTextureSize', 'Never shrink textures below', { min: 16, unit: 'px' })}
      <div class="ap-budget-table">
        <div class="ap-budget-row ap-budget-head"><span>Limit</span><span>Warn</span><span>Fail</span></div>
        ${BUDGET_METRICS.map((m) => `<div class="ap-budget-row"><span>${esc(m.label)}${m.unit ? ` <small>${esc(m.unit)}</small>` : ''}</span><input type="number" min="0" step="any" data-path="budgets.limits.${m.id}.warn" aria-label="${esc(m.label)} warning"><input type="number" min="0" step="any" data-path="budgets.limits.${m.id}.fail" aria-label="${esc(m.label)} failure"></div>`).join('')}
      </div>
      <div class="ap-grid2">
        ${num('budgets.batch.fileMB', 'Batch total size', { min: 0, unit: 'MB', hint: '0 = no limit' })}
        ${num('budgets.batch.triangles', 'Batch total triangles', { min: 0, hint: '0 = no limit' })}
      </div>
      <p class="ap-note">Further optimisation never goes below your minimum triangle count, the texture floor or deforming-mesh protection. Assets that still miss the budget are marked for review.</p>`
    ),
    section(
      'export',
      'Export',
      `${select('export.compression', 'Mesh compression', [['none', 'None (widest engine support)'], ['meshopt', 'Meshopt (EXT_meshopt_compression)']])}
      <div class="ap-grid2">
        ${text('export.suffix', 'File suffix', { hint: 'asset_optimized.glb' })}
        ${text('export.lodSuffix', 'LOD suffix', { hint: '{i} = level number' })}
      </div>
      ${select('export.folders', 'Folder organisation', [['mirror', 'Preserve original folders'], ['flat', 'Flat (one folder)'], ['per-asset', 'One folder per asset']])}
      ${check('export.manifest', 'JSON manifest')}
      ${check('export.reportJson', 'Per-asset JSON report')}
      ${check('export.reportHtml', 'HTML batch report')}
      ${check('export.csv', 'CSV batch summary')}
      ${check('export.thumbnails', 'Thumbnails (PNG)')}
      <p class="ap-note">Exports are GLB / glTF 2.0 files that Unity, Unreal and Godot import. They are not native engine project assets. Source files are never modified.</p>`
    ),
  ].join('');
}

/** Pushes settings values into the panel's inputs. */
export function syncSettingsPanel(host, settings, { structure = true } = {}) {
  for (const el of host.querySelectorAll('[data-path]')) {
    const v = get(settings, el.dataset.path);
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (document.activeElement !== el) el.value = v ?? '';
  }
  for (const btn of host.querySelectorAll('[data-mode]')) btn.setAttribute('aria-pressed', String(btn.dataset.mode === settings.mode));
  host.querySelector('[data-out="keepPercent"]').textContent = settings.geometry.keepPercent;
  host.querySelector('[data-note="engine"]').textContent = ENGINE_PRESETS[settings.engine]?.note || '';
  host.querySelector('[data-note="mode"]').textContent = MODES[settings.mode]?.blurb || '';
  for (const r of TEXTURE_ROLES) {
    const sel = host.querySelector(`[data-size="${r.id}"]`);
    const custom = host.querySelector(`[data-size-custom="${r.id}"]`);
    const v = settings.textures.roles[r.id].maxSize;
    const known = MAX_SIZE_CHOICES.includes(v);
    if (document.activeElement !== sel) sel.value = known && !custom.dataset.forced ? String(v) : 'custom';
    custom.hidden = known && !custom.dataset.forced;
    if (document.activeElement !== custom) custom.value = v || '';
  }
  if (structure) {
    renderStages(host, settings);
    renderLods(host, settings);
  }
  const geomOn = settings.geometry.simplify;
  host.querySelector('.ap-quality').classList.toggle('is-off', !geomOn);
}

function renderStages(host, settings) {
  const list = host.querySelector('[data-stages]');
  const ids = settings.stages.map((s) => s.id);
  list.innerHTML = settings.stages
    .map((s, i) => {
      const def = STAGES[s.id];
      const deps = [...(def.after || []), ...(def.prefersAfter || [])].filter((d) => ids.includes(d)).map((d) => STAGES[d].label);
      return `<li class="ap-stage${s.enabled ? '' : ' is-off'}${def.locked ? ' is-locked' : ''}" data-stage="${s.id}">
        <label class="ap-stage-toggle"><input type="checkbox" data-stage-toggle="${s.id}"${s.enabled ? ' checked' : ''}${def.required ? ' disabled' : ''} aria-label="Enable ${esc(def.label)}"></label>
        <span class="ap-stage-n">${i + 1}</span>
        <span class="ap-stage-text"><b>${esc(def.label)}</b><small>${esc(def.blurb)}${deps.length ? ` · after ${esc(deps.join(', '))}` : ''}</small></span>
        <span class="ap-stage-move">${def.locked ? '<span class="ap-lock" title="Fixed position">⎯</span>' : `<button type="button" class="ap-icon-btn" data-stage-up="${s.id}" aria-label="Move ${esc(def.label)} up"${i <= 1 ? ' disabled' : ''}>▲</button><button type="button" class="ap-icon-btn" data-stage-down="${s.id}" aria-label="Move ${esc(def.label)} down"${i >= settings.stages.length - 2 ? ' disabled' : ''}>▼</button>`}</span>
      </li>`;
    })
    .join('');
  const { errors, warnings } = checkStageOrder(settings.stages);
  host.querySelector('[data-order]').innerHTML = [...errors.map((e) => `<p class="ap-msg is-error">${esc(e)}</p>`), ...warnings.map((w) => `<p class="ap-msg is-warn">${esc(w)}</p>`)].join('');
  const badge = host.querySelector('[data-badge="stages"]');
  badge.textContent = errors.length ? `${errors.length} error` : `${settings.stages.filter((s) => s.enabled).length} on`;
  badge.classList.toggle('is-error', errors.length > 0);
}

function renderLods(host, settings) {
  const el = host.querySelector('[data-lods]');
  el.innerHTML = `<div class="ap-lod-row ap-lod-head"><span>Level</span><span>Keep %</span><span>Min tris</span><span>Distance</span><span>Screen</span><span></span></div>${settings.lods.levels
    .map(
      (lv, i) => `<div class="ap-lod-row"><span>LOD${i}</span>
      <input type="number" min="1" max="100" data-path="lods.levels.${i}.keep" aria-label="LOD${i} keep percent">
      <input type="number" min="0" data-path="lods.levels.${i}.minTriangles" aria-label="LOD${i} minimum triangles">
      <input type="number" min="0" step="any" data-path="lods.levels.${i}.distance" aria-label="LOD${i} distance">
      <input type="number" min="0" max="1" step="0.01" data-path="lods.levels.${i}.screenSize" aria-label="LOD${i} screen size">
      <button type="button" class="ap-icon-btn" data-lod-remove="${i}" aria-label="Remove LOD${i}"${settings.lods.levels.length <= 1 ? ' disabled' : ''}>✕</button></div>`
    )
    .join('')}`;
  for (const input of el.querySelectorAll('[data-path]')) input.value = get(settings, input.dataset.path);
}

/**
 * Wires the panel. `onChange(kind)` fires after every mutation; kind is
 * 'value' for plain edits and 'structure' when sections must re-sync.
 */
export function bindSettingsPanel(host, getSettings, { onChange, onEngine, onMode }) {
  const parse = (el) => {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range') {
      const n = Number(el.value);
      return Number.isFinite(n) ? n : 0;
    }
    return el.value;
  };

  host.addEventListener('change', (e) => {
    const el = e.target;
    const s = getSettings();
    if (el.dataset.path === 'engine') return onEngine(el.value);
    if (el.dataset.stageToggle) {
      s.stages.find((x) => x.id === el.dataset.stageToggle).enabled = el.checked;
      return onChange('structure');
    }
    if (el.dataset.size) {
      const custom = host.querySelector(`[data-size-custom="${el.dataset.size}"]`);
      if (el.value === 'custom') {
        custom.dataset.forced = '1';
        custom.hidden = false;
        custom.focus();
        return;
      }
      delete custom.dataset.forced;
      s.textures.roles[el.dataset.size].maxSize = Number(el.value);
      return onChange('structure');
    }
    if (el.dataset.sizeCustom) {
      s.textures.roles[el.dataset.sizeCustom].maxSize = Math.max(16, Math.min(16384, Math.round(Number(el.value) || 0)));
      return onChange('value');
    }
    if (el.dataset.path) {
      set(s, el.dataset.path, parse(el));
      return onChange(el.dataset.path.startsWith('lods.levels') ? 'value' : 'structure');
    }
  });
  host.addEventListener('input', (e) => {
    const el = e.target;
    if (el.type === 'range' && el.dataset.path) {
      set(getSettings(), el.dataset.path, parse(el));
      host.querySelector('[data-out="keepPercent"]').textContent = el.value;
      const numInput = host.querySelector(`input[type="number"][data-path="${el.dataset.path}"]`);
      if (numInput) numInput.value = el.value;
      onChange('value');
    }
  });
  host.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const s = getSettings();
    if (t.dataset.mode) return onMode(t.dataset.mode);
    const move = (id, dir) => {
      const i = s.stages.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 1 || j > s.stages.length - 2) return;
      [s.stages[i], s.stages[j]] = [s.stages[j], s.stages[i]];
      onChange('structure');
      host.querySelector(`[data-stage-${dir < 0 ? 'up' : 'down'}="${id}"]`)?.focus();
    };
    if (t.dataset.stageUp) return move(t.dataset.stageUp, -1);
    if (t.dataset.stageDown) return move(t.dataset.stageDown, 1);
    if (t.dataset.lodpreset) {
      const old = s.lods.levels;
      s.lods.levels = t.dataset.lodpreset.split(',').map((k, i) => ({ keep: Number(k), minTriangles: old[i]?.minTriangles || 0, distance: old[i]?.distance ?? i * 20, screenSize: old[i]?.screenSize ?? Math.max(0.05, 1 / 2 ** i) }));
      return onChange('structure');
    }
    if (t.hasAttribute('data-lod-add')) {
      if (s.lods.levels.length >= 6) return;
      const last = s.lods.levels.at(-1);
      s.lods.levels.push({ keep: Math.max(1, Math.round(last.keep / 2)), minTriangles: 0, distance: Math.round((last.distance || 10) * 2), screenSize: Math.max(0.01, Math.round((last.screenSize / 2) * 100) / 100) });
      return onChange('structure');
    }
    if (t.dataset.lodRemove) {
      s.lods.levels.splice(Number(t.dataset.lodRemove), 1);
      return onChange('structure');
    }
  });
}
