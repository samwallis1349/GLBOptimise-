/**
 * Character Workshop — wires the modules to the page.
 *   viewport.js  rendering + the single render loop
 *   formats.js   format adapters and loading
 *   inspect.js   statistics, rest pose, track binding
 *   animation.js playback controller and category suggestions
 *   validate.js  PASS / WARNING / FAIL checks
 *   export.js    export + round-trip verification
 *   agent.js     in-place clips and category names for game agents
 */
import { Viewport } from './viewport.js';
import { ADAPTERS, ACCEPT, UserError, badgeFor, loadAnimationFile, loadFiles } from './formats.js';
import { inspectModel, snapshotRestPose, trackBinding } from './inspect.js';
import { AnimationController, CATEGORIES, suggestCategories } from './animation.js';
import { validateAsset, summarise } from './validate.js';
import { availableTargets, downloadBlob, exportAsset, sanitiseFileName, verifyExport, TARGETS } from './export.js';
import { disposeObject } from './dispose.js';
import { exportClipList, makeInPlace } from './agent.js';
import { $, el, formatBytes, formatSeconds, statRows, statusPill, toast, ICONS } from './ui.js';

const SAMPLE = { url: new URL('../samples/robot-expressive.glb', import.meta.url).href, name: 'RobotExpressive.glb' };

const DEFAULT_SETTINGS = { scale: 1, rotationX: 0, rotationY: 0, groundFeet: true, shadows: true, grid: true, background: 'charcoal', skeleton: false };

const viewport = new Viewport($('canvas'));
const anim = new AnimationController();
anim.playableFor = (clip) => {
  if (!asset?.inPlace) return clip;
  if (!asset.inPlaceCache.has(clip)) asset.inPlaceCache.set(clip, makeInPlace(clip, asset.root).clip);
  return asset.inPlaceCache.get(clip) ?? clip;
};
viewport.onFrame((dt) => { anim.update(dt); updateTransportTime(); });

/** Everything about the current asset. Replaced wholesale on each import. */
let asset = null;
// asset = { loaded, root, clips, meta: Map<clip,{source,loop}>, restPose, stats, checks, categories, assigned, selected, exportSel:Set, target, lastExport }

// ---------------------------------------------------------------- navigation
function showPanel(name) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const on = b.dataset.panel === name;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll('.side .panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (name === 'export') renderExport();
}
document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => showPanel(b.dataset.panel)));

// ---------------------------------------------------------------- overlay
function overlay(state, info = {}) {
  $('ovIdle').hidden = state !== 'idle';
  $('ovLoading').hidden = state !== 'loading';
  $('ovError').hidden = state !== 'error';
  $('overlay').classList.toggle('is-hidden', state === 'none');
  if (state === 'loading') $('loadingText').textContent = info.text ?? 'Loading…';
  if (state === 'error') { $('errorTitle').textContent = info.title ?? 'Something went wrong'; $('errorDetail').textContent = info.detail ?? ''; }
}
$('errorDismiss').addEventListener('click', () => overlay(asset ? 'none' : 'idle'));

// ---------------------------------------------------------------- import
const fileInput = $('fileInput');
fileInput.accept = ACCEPT;
const browse = () => fileInput.click();
$('dropZone').addEventListener('click', browse);
$('dropZone').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); browse(); } });
$('browseBtn').addEventListener('click', browse);
fileInput.addEventListener('change', () => { if (fileInput.files.length) importFiles(fileInput.files); fileInput.value = ''; });

const dropTargets = [$('viewportWrap'), $('dropZone')];
for (const t of dropTargets) {
  t.addEventListener('dragover', (e) => { e.preventDefault(); t.classList.add('is-over'); });
  t.addEventListener('dragleave', () => t.classList.remove('is-over'));
  t.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    t.classList.remove('is-over');
    if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files);
  });
}
// Files dropped anywhere else on the page are imported too (and never navigate the frame away).
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files);
});

async function loadSample() {
  overlay('loading', { text: 'Loading the sample robot…' });
  try {
    const res = await fetch(SAMPLE.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    await importFiles([new File([blob], SAMPLE.name, { type: 'model/gltf-binary' })]);
  } catch (error) {
    overlay('error', { title: 'The sample could not be loaded', detail: `${error.message}. Check that samples/robot-expressive.glb sits next to this tool.` });
  }
}
document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', loadSample));

let importToken = 0;
async function importFiles(fileList) {
  const token = ++importToken;
  const files = [...fileList];
  overlay('loading', { text: `Loading ${files.length === 1 ? files[0].name : files.length + ' files'}…` });
  let loaded;
  try {
    loaded = await loadFiles(files);
  } catch (error) {
    if (token !== importToken) return;
    console.error(error);
    overlay('error', error instanceof UserError ? { title: error.title, detail: error.detail } : { title: 'Could not load the file', detail: String(error?.message || error) });
    return;
  }
  if (token !== importToken) { disposeObject(loaded.root); loaded.dispose(); return; }
  try {
    setAsset(loaded);
    overlay('none');
    toast(`Loaded ${loaded.source.fileName}`);
  } catch (error) {
    console.error(error);
    overlay('error', { title: 'The file loaded but could not be displayed', detail: String(error?.message || error) });
  }
}

/** Removes the current asset and frees its GPU memory and blob URLs. */
function clearAsset() {
  if (!asset) return;
  anim.detach();
  viewport.clearModel();
  disposeObject(asset.root);
  asset.loaded.dispose();
  asset = null;
}

function setAsset(loaded) {
  clearAsset();
  const root = loaded.root;
  if (!root.name) root.name = loaded.source.fileName.replace(/\.[^.]+$/, '');
  const restPose = snapshotRestPose(root);
  const clips = loaded.clips.filter(Boolean);
  const meta = new Map(clips.map((c) => [c, { source: 'embedded', loop: true }]));
  asset = {
    loaded, root, clips, meta, restPose,
    stats: null, checks: [], categories: {}, assigned: {},
    selected: clips[0] ?? null,
    exportSel: new Set(clips.filter((c) => c.tracks.length > 0)),
    target: 'glb',
    lastExport: null,
    inPlace: false,
    inPlaceCache: new Map(),
    renameOnExport: false,
    selectedBone: null,
  };
  viewport.setModel(root);
  anim.attach(root, clips, restPose);
  refreshAnalysis();
  renderAll();
  if (asset.selected) selectClip(asset.selected, { autoplay: true });
}

function refreshAnalysis() {
  asset.stats = inspectModel(asset.root, asset.clips);
  asset.checks = validateAsset(asset.stats, { root: asset.root, clips: asset.clips, source: asset.loaded.source, exportTarget: asset.target });
  asset.categories = suggestCategories(asset.clips);
}

// ---------------------------------------------------------------- character panel
function renderCharacter() {
  $('charInfo').hidden = !asset;
  $('dropZone').classList.toggle('is-compact', !!asset);
  $('dropZone').querySelector('strong').textContent = asset ? 'Replace character' : 'Import character';
  $('stageBadge').hidden = !asset;
  if (!asset) { $('stageName').textContent = 'No character loaded'; return; }
  const { source, notes } = asset.loaded;
  const s = asset.stats;
  const badge = badgeFor(source.adapter);
  $('fileName').textContent = source.fileName;
  $('fileName').title = source.fileName;
  $('formatBadge').textContent = badge;
  $('stageName').textContent = source.fileName;
  $('stageBadge').textContent = badge;
  statRows($('statsList'), [
    ['File size', formatBytes(source.fileSize)],
    ['Meshes', s.meshCount],
    ['Triangles', s.triangles.toLocaleString()],
    ['Materials', s.materialCount],
    ['Textures', s.textureCount],
    ['Skeleton', s.hasSkeleton ? `${s.boneCount} bones` : 'None'],
    ['Skinned meshes', s.skinnedMeshCount],
    ['Animation clips', asset.clips.length],
    ['Height (units)', s.size.y.toFixed(2)],
  ]);
  const a = source.adapter;
  const targets = availableTargets(a, s).filter((t) => t.enabled).map((t) => t.ext.toUpperCase());
  const conversion = a.id === 'glb' ? 'Not needed'
    : a.exportTargets.includes('glb') ? `${a.label} → GLB` : 'Not available';
  statRows($('importSummary'), [
    ['Source format', `${a.label}${source.extraFiles.length ? ` + ${source.extraFiles.length} files` : ''}`],
    ['Rig detected', s.skinnedMeshCount ? 'Yes' : s.hasSkeleton ? 'Bones only' : 'No'],
    ['Animations', asset.clips.length],
    ['Materials / textures', `${s.materialCount} / ${s.textureCount}${source.missingResources.length ? ` (${source.missingResources.length} missing)` : ''}`],
    ['Conversion', conversion],
    ['Export formats', targets.join(', ') || 'None'],
  ]);
  const noteEls = [...notes];
  if (source.missingResources.length) noteEls.push(`Missing files: ${source.missingResources.join(', ')}. Select them together with the model to include them.`);
  if (a.status === 'experimental') noteEls.push(`${a.label} support is experimental — check the preview carefully.`);
  $('importNotes').replaceChildren(...noteEls.map((n) => el('p', { class: 'note', text: n })));
  $('formatLimits').replaceChildren(...a.limitations.map((l) => el('li', { text: l })));
  renderBones();
}

// ---------------------------------------------------------------- bone inspector
function boneRows() {
  const rows = [];
  const skin = new Set();
  asset.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton?.bones.forEach((b) => b && skin.add(b)); });
  const walk = (node, depth) => {
    if (node.isBone) rows.push({ bone: node, depth, skinned: skin.has(node), children: node.children.filter((c) => c.isBone).length });
    for (const c of node.children) walk(c, node.isBone ? depth + 1 : depth);
  };
  walk(asset.root, 0);
  return rows;
}

function renderBones() {
  const fold = $('boneFold');
  if (!asset || !asset.stats.hasSkeleton) { fold.hidden = true; viewport.clearBoneHighlight(); return; }
  fold.hidden = false;
  const rows = boneRows();
  $('boneCount').textContent = rows.length;
  const q = $('boneSearch').value.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.bone.name.toLowerCase().includes(q)) : rows;
  $('boneTree').replaceChildren(...shown.slice(0, 500).map((r) => {
    const item = el('li', { class: `bone${asset.selectedBone === r.bone ? ' is-selected' : ''}`, style: `--depth:${q ? 0 : Math.min(r.depth, 14)}`, title: r.bone.name },
      el('span', { class: 'bone-name', text: r.bone.name || '(unnamed bone)' }),
      r.skinned ? null : el('span', { class: 'tag', text: 'not skinned', title: 'No skinned mesh uses this bone' }),
      r.children ? el('span', { class: 'bone-kids', text: r.children }) : null);
    item.addEventListener('click', () => {
      asset.selectedBone = asset.selectedBone === r.bone ? null : r.bone;
      viewport.highlightBone(asset.selectedBone);
      renderBones();
    });
    return item;
  }));
  $('boneEmpty').hidden = shown.length > 0;
}
$('boneSearch').addEventListener('input', () => asset && renderBones());

function renderFormatTable() {
  const statusText = { tested: 'Tested', static: 'Static mesh', experimental: 'Experimental', unsupported: 'Explained only' };
  $('formatRows').replaceChildren(...ADAPTERS.map((a) => el('tr', {},
    el('td', { text: a.extensions.map((e) => '.' + e).join(' ') }),
    el('td', { text: a.rig ? 'Yes' : '—' }),
    el('td', { text: a.animation ? 'Yes' : '—' }),
    el('td', { text: statusText[a.status] ?? a.status, title: a.limitations.join(' ') }),
  )));
}

// ---------------------------------------------------------------- clip list
function categoryOf(clip) {
  const cat = CATEGORIES.find((c) => (asset.assigned[c.id] ?? asset.categories[c.id]?.clip) === clip);
  return cat?.label ?? null;
}

function renderClips() {
  const list = $('clipList');
  const clips = asset?.clips ?? [];
  $('clipCount').textContent = clips.length;
  $('clipEmpty').hidden = clips.length > 0;
  if (!asset) $('clipEmptyText').textContent = 'Import a rigged GLB or FBX to see its clips here.';
  else if (!clips.length) $('clipEmptyText').textContent = asset.stats.hasSkeleton
    ? 'This rig has no embedded clips. Use Animations → Import animation pack to add GLB/FBX clips with matching bone names.'
    : 'This model has no skeleton, so it cannot play character animations. Rig it first (e.g. Blender or Mixamo), then re-import.';
  list.replaceChildren(...clips.map((clip) => {
    const meta = asset.meta.get(clip);
    const isCurrent = anim.current?.clip === clip;
    const playing = isCurrent && anim.playing;
    const cat = categoryOf(clip);
    const item = el('li', { class: `clip${asset.selected === clip ? ' is-selected' : ''}${isCurrent ? ' is-current' : ''}`, 'data-clip': clip.name, role: 'option', 'aria-selected': String(asset.selected === clip) },
      el('button', { class: 'play', title: playing ? 'Pause' : 'Play', 'aria-label': `${playing ? 'Pause' : 'Play'} ${clip.name}`, html: playing ? ICONS.pause : ICONS.play,
        onclick: (e) => { e.stopPropagation(); if (asset.selected !== clip) selectClip(clip, { autoplay: true }); else { anim.toggle(clip); } } }),
      el('div', { class: 'clip-text' },
        el('div', { class: 'clip-name', text: clip.name || '(unnamed clip)', title: clip.name }),
        el('div', { class: 'clip-meta' },
          el('span', { text: `${clip.tracks.length} tracks` }),
          meta.source !== 'embedded' ? el('span', { class: 'tag', text: 'pack' }) : null,
          cat ? el('span', { class: 'tag', text: cat }) : null)),
      el('span', { class: 'clip-dur', text: `${formatSeconds(clip.duration)}s` }),
      isCurrent ? el('div', { class: 'clip-progress', 'aria-hidden': 'true' }, el('i')) : null,
      el('button', { class: `loop${meta.loop ? ' is-on' : ''}`, title: meta.loop ? 'Looping — click to play once' : 'Plays once — click to loop', 'aria-pressed': String(meta.loop), html: ICONS.loop,
        onclick: (e) => { e.stopPropagation(); meta.loop = !meta.loop; if (anim.current?.clip === clip) anim.setLoop(meta.loop); renderClips(); renderTransport(); } }),
    );
    item.addEventListener('click', () => selectClip(clip, { autoplay: true }));
    return item;
  }));
}

function selectClip(clip, { autoplay = false } = {}) {
  if (!asset || !clip) return;
  asset.selected = clip;
  anim.setLoop(asset.meta.get(clip)?.loop ?? true);
  if (autoplay) anim.play(clip);
  renderClips();
  renderTransport();
}

anim.onChange(() => { if (asset) { renderTransport(); renderClipsSoon(); } });
let clipsQueued = false;
function renderClipsSoon() {
  if (clipsQueued) return;
  clipsQueued = true;
  requestAnimationFrame(() => { clipsQueued = false; if (asset) renderClips(); });
}

// ---------------------------------------------------------------- transport
const playBtn = $('playBtn'), stopBtn = $('stopBtn'), loopBtn = $('loopBtn'), scrub = $('scrub'), speed = $('speed');
let scrubbing = false;
function renderTransport() {
  const has = !!(asset && asset.clips.length);
  for (const c of [playBtn, stopBtn, loopBtn, scrub, speed]) c.disabled = !has;
  playBtn.classList.toggle('is-playing', anim.playing);
  playBtn.title = anim.playing ? 'Pause (Space)' : 'Play (Space)';
  loopBtn.classList.toggle('is-on', anim.loop);
  loopBtn.setAttribute('aria-pressed', String(anim.loop));
  scrub.max = String(Math.max(anim.duration || asset?.selected?.duration || 1, 0.001));
  updateTransportTime(true);
}
function updateTransportTime(force = false) {
  if (!asset || (!anim.playing && !force)) return;
  const d = anim.duration || asset.selected?.duration || 0;
  const t = anim.current ? Math.min(anim.time, d) : 0;
  if (!scrubbing) scrub.value = String(t);
  $('timeLabel').textContent = `${formatSeconds(t)} / ${formatSeconds(d)} s`;
  const bar = document.querySelector('.clip.is-current .clip-progress i');
  if (bar) bar.style.width = `${d ? (t / d) * 100 : 0}%`;
}
playBtn.addEventListener('click', () => anim.toggle(asset?.selected));
stopBtn.addEventListener('click', () => anim.stop());
loopBtn.addEventListener('click', () => {
  const next = !anim.loop;
  anim.setLoop(next);
  const meta = asset?.selected && asset.meta.get(asset.selected);
  if (meta) meta.loop = next;
  renderClips();
});
scrub.addEventListener('input', () => {
  scrubbing = true;
  if (anim.current?.clip !== asset.selected) { anim.play(asset.selected); anim.pause(); }
  anim.seek(Number(scrub.value));
  updateTransportTime(true);
});
scrub.addEventListener('change', () => { scrubbing = false; });
speed.addEventListener('change', () => anim.setSpeed(Number(speed.value)));
$('crossFade').addEventListener('change', (e) => { anim.crossFade = Number(e.target.value); });
function setInPlace(on) {
  if (!asset) return;
  asset.inPlace = on;
  $('inPlacePreview').checked = on;
  $('exportInPlace').checked = on;
  anim.refresh();
  if (on && asset.selected) {
    const r = makeInPlace(asset.selected, asset.root);
    toast(r.clip ? `In place: root motion removed from ${r.node.name || 'the root'}` : `"${asset.selected.name}" has no root motion to remove`);
  }
}
$('inPlacePreview').addEventListener('change', (e) => setInPlace(e.target.checked));
$('exportInPlace').addEventListener('change', (e) => setInPlace(e.target.checked));
$('exportRename').addEventListener('change', (e) => { if (asset) { asset.renameOnExport = e.target.checked; renderExport(); } });
$('thumbBtn').addEventListener('click', () => saveSnapshot(true));

// ---------------------------------------------------------------- camera
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('frameBtn').addEventListener('click', () => viewport.frame());
$('resetCamBtn').addEventListener('click', () => viewport.resetCamera());
function setView(mode) {
  document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('is-on', x.dataset.view === mode));
  viewport.setMode(mode);
}
function step(dir) {
  if (!asset?.selected) return;
  if (anim.current?.clip !== asset.selected) anim.play(asset.selected);
  anim.pause();
  const d = anim.duration || 1;
  anim.seek(((anim.time + dir / 30) % d + d) % d);
}
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space' && asset?.clips.length) { e.preventDefault(); anim.toggle(asset.selected); }
  else if (k === 'f') viewport.frame();
  else if (k === 'i') setView(viewport.mode === 'isometric' ? 'perspective' : 'isometric');
  else if (k === 's' && asset) $('skelBtn').click();
  else if (e.key === 'ArrowRight' && asset?.clips.length) { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowLeft' && asset?.clips.length) { e.preventDefault(); step(-1); }
  else if (e.key === 'Escape') closeDrawer();
});
$('snapBtn').addEventListener('click', () => saveSnapshot(false));
async function saveSnapshot(square) {
  if (!asset) return;
  try {
    const blob = await viewport.snapshot({ square });
    const base = asset.loaded.source.fileName.replace(/\.[^.]+$/, '');
    const name = `${base}${square ? '-thumbnail' : ''}.png`;
    downloadBlob(blob, name);
    toast(`Saved ${name}`);
  } catch (error) {
    toast(String(error.message || error), 'error');
  }
}

// ---------------------------------------------------------------- categories + packs
function renderCategories() {
  const list = $('categoryList');
  const clips = asset?.clips ?? [];
  list.replaceChildren(...CATEGORIES.map((cat) => {
    const manual = asset?.assigned[cat.id];
    const suggested = asset?.categories[cat.id]?.clip;
    const clip = manual ?? suggested ?? null;
    const select = el('select', { 'aria-label': `Clip for ${cat.label}`, disabled: !clips.length },
      el('option', { value: '', text: clips.length ? 'Assign a clip…' : 'No clips loaded' }),
      ...clips.map((c, i) => el('option', { value: String(i), text: c.name, selected: c === clip })));
    select.addEventListener('change', () => {
      asset.assigned[cat.id] = select.value === '' ? null : clips[Number(select.value)];
      renderCategories();
      renderClips();
      renderExport();
    });
    return el('li', { class: `cat${clip ? '' : ' is-missing'}` },
      el('div', { class: 'cat-top' },
        el('span', { class: 'cat-label', text: cat.label }),
        el('span', { class: 'cat-state', text: clip ? `${clip.name}${manual ? ' (assigned)' : ' (by name)'}` : 'Animation not available' }),
        clip ? el('button', { class: 'chip', text: 'Play', onclick: () => selectClip(clip, { autoplay: true }) }) : null),
      select,
      clip ? null : el('div', { class: 'help', text: `No clip is named like "${cat.label}". Import an animation pack containing one, or assign a clip you know is a ${cat.label.toLowerCase()} animation.` }));
  }));
  $('inPlacePreview').disabled = !asset || !clips.length;
  $('inPlacePreview').checked = !!asset?.inPlace;
  const canPack = !!asset && asset.stats.hasSkeleton;
  $('packBtn').disabled = !canPack;
  $('packHelp').textContent = !asset ? 'Load a rigged character first. Packs are GLB or FBX files using the same bone names — e.g. Mixamo downloads ("Without Skin") for a Mixamo-rigged character.'
    : !asset.stats.hasSkeleton ? 'This model has no skeleton, so external animations cannot drive it.'
    : 'Pick a GLB or FBX that uses the same bone names. Only clips whose tracks match this skeleton are added.';
}

$('packBtn').addEventListener('click', () => $('packInput').click());
$('packInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !asset) return;
  const out = $('packResult');
  out.replaceChildren(el('p', { class: 'note', text: `Reading ${file.name}…` }));
  let pack;
  try {
    pack = await loadAnimationFile(file);
  } catch (error) {
    out.replaceChildren(el('p', { class: 'note is-strong', text: error.title ? `${error.title} ${error.detail}` : String(error.message || error) }));
    return;
  }
  try {
    const added = [], rejected = [], scaleWarnings = [];
    const names = new Set(asset.clips.map((c) => c.name));
    for (const clip of pack.clips) {
      const b = trackBinding(clip, asset.root);
      if (!b.total || b.bound / b.total < 0.6) { rejected.push(`${clip.name} (${b.bound}/${b.total} tracks match)`); continue; }
      let c = clip;
      if (names.has(c.name)) { c = clip.clone(); let i = 2; while (names.has(`${clip.name} (${i})`)) i++; c.name = `${clip.name} (${i})`; }
      names.add(c.name);
      const ratio = positionScaleRatio(c, asset.root);
      if (ratio && (ratio > 20 || ratio < 0.05)) scaleWarnings.push(c.name);
      asset.clips.push(c);
      asset.meta.set(c, { source: `pack: ${file.name}`, loop: true });
      asset.exportSel.add(c);
      added.push(`${c.name} (${b.bound}/${b.total} tracks)`);
    }
    anim.addClips(added.length ? asset.clips.slice(-added.length) : []);
    refreshAnalysis();
    renderAll();
    const msgs = [];
    if (added.length) msgs.push(`Added ${added.length} clip(s): ${added.join(', ')}.`);
    if (rejected.length) msgs.push(`Skipped ${rejected.length} incompatible clip(s): ${rejected.join(', ')}. Their bone names don't match this skeleton (retargeting is not supported yet).`);
    if (!pack.clips.length) msgs.push(`${file.name} contains no animation clips.`);
    if (scaleWarnings.length) msgs.push(`Position tracks in ${scaleWarnings.join(', ')} are on a very different scale from this rig (e.g. centimetres vs metres); the hips may float or sink.`);
    out.replaceChildren(...msgs.map((m) => el('p', { class: 'note', text: m })));
  } finally {
    disposeObject(pack.root);
    pack.dispose();
  }
});

/** Ratio of a clip's position-track magnitudes to the matching bones' rest offsets. */
function positionScaleRatio(clip, root) {
  let sumTrack = 0, sumRest = 0;
  for (const t of clip.tracks) {
    if (!t.name.endsWith('.position')) continue;
    const node = root.getObjectByName(t.name.slice(0, -'.position'.length));
    if (!node) continue;
    const rest = node.position.length();
    if (rest < 1e-6) continue;
    const v = t.values;
    sumTrack += Math.hypot(v[0], v[1], v[2]);
    sumRest += rest;
  }
  return sumRest > 0 ? sumTrack / sumRest : null;
}

// ---------------------------------------------------------------- settings
const settingInputs = { scale: $('setScale'), rotationX: $('setRotX'), rotationY: $('setRotY'), groundFeet: $('setGround'), shadows: $('setShadows'), grid: $('setGrid'), skeleton: $('setSkeleton'), background: $('setBg') };
function readSettings() {
  return {
    scale: Math.max(0.0001, Number(settingInputs.scale.value) || 1),
    rotationX: Number(settingInputs.rotationX.value),
    rotationY: Number(settingInputs.rotationY.value),
    groundFeet: settingInputs.groundFeet.checked,
    shadows: settingInputs.shadows.checked,
    grid: settingInputs.grid.checked,
    skeleton: settingInputs.skeleton.checked,
    background: settingInputs.background.value,
  };
}
function writeSettings(s) {
  settingInputs.scale.value = String(s.scale);
  settingInputs.rotationX.value = String(s.rotationX);
  settingInputs.rotationY.value = String(s.rotationY);
  settingInputs.groundFeet.checked = s.groundFeet;
  settingInputs.shadows.checked = s.shadows;
  settingInputs.grid.checked = s.grid;
  settingInputs.skeleton.checked = s.skeleton;
  settingInputs.background.value = s.background;
}
function applySettings({ reframe = false } = {}) {
  const before = viewport.settings.scale;
  viewport.applySettings(readSettings());
  $('skelBtn').classList.toggle('is-on', viewport.settings.skeleton);
  $('skelBtn').setAttribute('aria-pressed', String(viewport.settings.skeleton));
  if (reframe || before !== viewport.settings.scale) viewport.frame();
}
for (const [key, input] of Object.entries(settingInputs)) {
  input.addEventListener(input.type === 'number' ? 'input' : 'change', () => applySettings({ reframe: key === 'rotationX' || key === 'rotationY' }));
}
document.querySelectorAll('[data-scale]').forEach((b) => b.addEventListener('click', () => { settingInputs.scale.value = b.dataset.scale; applySettings({ reframe: true }); }));
$('skelBtn').addEventListener('click', () => { settingInputs.skeleton.checked = !settingInputs.skeleton.checked; applySettings(); });
$('resetSettings').addEventListener('click', () => { writeSettings(DEFAULT_SETTINGS); applySettings({ reframe: true }); });

// ---------------------------------------------------------------- export
function categoryMapping() {
  const m = {};
  for (const c of CATEGORIES) { const clip = asset.assigned[c.id] ?? asset.categories[c.id]?.clip; if (clip) m[c.id] = clip; }
  return m;
}

function plannedExportClips() {
  const selected = asset.clips.filter((c) => asset.exportSel.has(c));
  return exportClipList(selected, { mapping: categoryMapping(), rename: asset.renameOnExport, inPlace: asset.inPlace, root: asset.root });
}

function renderExport() {
  $('exportEmpty').hidden = !!asset;
  $('exportForm').hidden = !asset;
  if (!asset) return;
  const name = $('exportName');
  if (!name.value || name.dataset.for !== asset.loaded.source.fileName) {
    name.value = sanitiseFileName(asset.loaded.source.fileName, TARGETS[asset.target].ext);
    name.dataset.for = asset.loaded.source.fileName;
  }
  const targets = availableTargets(asset.loaded.source.adapter, asset.stats);
  if (!targets.find((t) => t.id === asset.target)?.enabled) asset.target = targets.find((t) => t.enabled)?.id ?? 'glb';
  $('targetList').replaceChildren(...targets.map((t) => {
    const input = el('input', { type: 'radio', name: 'target', value: t.id, checked: t.id === asset.target, disabled: !t.enabled });
    input.addEventListener('change', () => {
      asset.target = t.id;
      name.value = sanitiseFileName(name.value, t.ext);
      refreshAnalysis(); renderValidation(); renderExport();
    });
    return el('label', { class: `target${t.enabled ? '' : ' is-disabled'}`, title: t.reason || '' }, input,
      el('span', {}, t.label, t.reason ? el('small', { text: t.reason }) : t.id === 'glb' ? el('small', { text: 'Recommended for Three.js and game engines' }) : null));
  }));
  const spec = TARGETS[asset.target];
  $('clipPick').hidden = !spec.animation || !asset.clips.length;
  $('clipPickList').replaceChildren(...asset.clips.map((clip) => {
    const b = trackBinding(clip, asset.root);
    const box = el('input', { type: 'checkbox', checked: asset.exportSel.has(clip) });
    box.addEventListener('change', () => { if (box.checked) asset.exportSel.add(clip); else asset.exportSel.delete(clip); updateExportButton(); });
    const cats = asset.renameOnExport ? CATEGORIES.filter((c) => categoryMapping()[c.id] === clip).map((c) => c.label) : [];
    return el('li', {}, el('label', {}, box, el('span', { text: clip.name }), cats.length ? el('span', { class: 'tag', text: `→ ${cats.join(', ')}` }) : null, el('span', { class: 'bind', text: `${b.bound}/${b.total}` })));
  }));
  const hasMapping = Object.keys(categoryMapping()).length > 0;
  $('agentOpts').hidden = !spec.animation || !asset.clips.length;
  $('exportRename').disabled = !hasMapping;
  $('exportRename').checked = asset.renameOnExport && hasMapping;
  $('exportInPlace').checked = asset.inPlace;
  $('renameHelp').textContent = hasMapping ? 'Clips matched to Idle, Walk, Run… on the Animations tab are exported under those names.' : 'No clips are matched to a category yet (Animations tab).';
  const conv = [];
  const a = asset.loaded.source.adapter;
  conv.push(`${a.label} → ${spec.ext.toUpperCase()}. The source file is not modified.`);
  for (const c of asset.checks.filter((x) => x.status !== 'pass' && /convert|export|missing|discard|Shader/i.test(x.title + x.detail))) conv.push(`${c.title}: ${c.detail}`);
  if (asset.stats.hasSkeleton && spec.rig) conv.push('Skeleton and skin weights are exported; the rest pose is used, not the current animation frame.');
  $('conversionSummary').replaceChildren(...conv.map((t) => el('li', { text: t })));
  updateExportButton();
  renderExportResult();
}

function updateExportButton() {
  if (!asset) return;
  const spec = TARGETS[asset.target];
  const n = spec.animation ? plannedExportClips().clips.length : 0;
  $('exportBtn').textContent = `Export ${spec.ext.toUpperCase()}${spec.animation && asset.clips.length ? ` (${n} clip${n === 1 ? '' : 's'})` : ''}`;
  $('footExport').textContent = `Export ${spec.ext.toUpperCase()}`;
}

$('clipsAll').addEventListener('click', () => { asset?.clips.forEach((c) => asset.exportSel.add(c)); renderExport(); });
$('clipsNone').addEventListener('click', () => { asset?.exportSel.clear(); renderExport(); });
$('footExport').addEventListener('click', () => showPanel('export'));

$('exportBtn').addEventListener('click', async () => {
  if (!asset) return;
  const btn = $('exportBtn');
  const current = asset;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Exporting…';
  try {
    const plan = plannedExportClips();
    const clips = plan.clips;
    const out = await exportAsset({
      model: current.root, restPose: current.restPose, clips, target: current.target,
      fileName: $('exportName').value, displayTransform: $('bakeDisplay').checked ? viewport.settings : null,
    });
    let verification = null, verifyError = null;
    try { verification = await verifyExport(out); } catch (error) { verifyError = String(error?.message || error); }
    current.lastExport = { ...out, verification, verifyError, agentReport: plan.report };
    const worstFail = verification?.checks.some((c) => c.status === 'fail');
    toast(verification ? (worstFail ? `${out.fileName} exported, but the round-trip check found differences` : `${out.fileName} exported and verified`) : `${out.fileName} exported; reload check failed`, worstFail || !verification ? 'error' : 'ok');
  } catch (error) {
    console.error(error);
    current.lastExport = { error: String(error?.message || error) };
    toast('Export failed', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
  if (asset === current) renderExportResult();
});

function renderExportResult() {
  const box = $('exportResult');
  const r = asset?.lastExport;
  if (!r) { box.replaceChildren(); return; }
  if (r.error) { box.replaceChildren(el('div', { class: 'result is-error' }, el('strong', { text: 'Export failed' }), el('span', { text: r.error }))); return; }
  const v = r.verification;
  const worst = v ? (v.checks.some((c) => c.status === 'fail') ? 'fail' : v.checks.some((c) => c.status === 'warn') ? 'warn' : 'pass') : 'fail';
  box.replaceChildren(el('div', { class: 'result', 'data-status': worst },
    el('div', { class: 'result-head' }, el('strong', { text: r.fileName, title: r.fileName }), el('span', { class: 'clip-dur', text: formatBytes(r.size) })),
    el('div', {}, statusPill(worst), ' ', el('span', { class: 'muted small', text: v ? 'File generated and reloaded for a round-trip check.' : `File generated, but reloading it failed: ${r.verifyError}` })),
    v ? el('table', { class: 'rt' }, el('tbody', {}, ...v.checks.map((c) => el('tr', {}, el('td', { text: c.label }), el('td', { text: String(c.expected) }), el('td', { text: String(c.actual) }), el('td', {}, statusPill(c.status)))))) : null,
    r.agentReport?.length ? el('details', { class: 'fold', open: true }, el('summary', { text: `Game-agent changes (${r.agentReport.length})` }), el('ul', { class: 'limits' }, ...r.agentReport.map((w) => el('li', { text: w })))) : null,
    r.warnings.length ? el('details', { class: 'fold', open: true }, el('summary', { text: `Exporter messages (${r.warnings.length})` }), el('ul', { class: 'limits' }, ...r.warnings.map((w) => el('li', { text: w })))) : null,
    el('button', { class: 'btn btn-primary btn-wide', text: `Save ${r.fileName}`, onclick: () => downloadBlob(r.blob, r.fileName) }),
  ));
}

// ---------------------------------------------------------------- validation footer
function renderValidation() {
  const checks = asset?.checks ?? [];
  const sum = summarise(checks);
  $('valToggle').disabled = !asset;
  $('footExport').disabled = !asset;
  $('valPass').textContent = `${sum.pass} PASS`;
  $('valWarn').textContent = `${sum.warn} WARNING`;
  $('valFail').textContent = `${sum.fail} FAIL`;
  $('valFail').classList.toggle('is-zero', sum.fail === 0);
  $('checkList').replaceChildren(...checks.map((c) => el('li', { class: 'check' }, statusPill(c.status),
    el('div', {}, el('b', { text: c.title }), c.status === 'warn' ? el('em', { text: c.kind === 'failure' ? 'problem' : 'recommendation' }) : null, el('p', { text: c.detail })))));
  if (!asset) { $('valDrawer').hidden = true; $('valToggle').setAttribute('aria-expanded', 'false'); }
}
$('valToggle').addEventListener('click', () => {
  const open = $('valDrawer').hidden;
  $('valDrawer').hidden = !open;
  $('valToggle').setAttribute('aria-expanded', String(open));
});
function closeDrawer() { $('valDrawer').hidden = true; $('valToggle').setAttribute('aria-expanded', 'false'); }
$('valClose').addEventListener('click', closeDrawer);

function renderAll() {
  $('snapBtn').disabled = !asset;
  renderCharacter();
  renderClips();
  renderTransport();
  renderCategories();
  renderValidation();
  renderExport();
}

// ---------------------------------------------------------------- boot
renderFormatTable();
renderAll();
overlay('idle');
window.addEventListener('pagehide', () => { clearAsset(); viewport.dispose(); });
if (window.parent !== window) {
  new ResizeObserver(() => window.parent.postMessage({ type: 'assetbench:height', height: Math.ceil(document.body.getBoundingClientRect().height) + 2 }, '*')).observe(document.body);
}

// Read-only hooks for automated tests.
window.__characterWorkshop = { viewport, anim, get asset() { return asset; }, importFiles, clearAsset };
