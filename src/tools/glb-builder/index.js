import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import stylesUrl from './glb-builder.css?url';
import { GLBBuilderPage } from './GLBBuilderPage.js';
import { ARRANGER_CONFIG } from './config.js';
import { ArrangerViewer } from './arranger/ArrangerViewer.js';
import { worldBox } from './arranger/bounds.js';
import { adaptClip, disposeAsset, groupFiles, loadAsset, loadClipsFromFiles, renderThumbnails } from './arranger/library.js';
import { disposeGroundTextures, getGroundTexture, loadCustomGroundTexture } from './arranger/groundTextures.js';
import { exportInstances } from './arranger/exportScene.js';
import { icon } from './arranger/icons.js';
import { downloadBlob } from '../../shared/utils/download.js';

/**
 * GLB Builder & Merger — the Asset Arranger.
 *
 * Source assets (library) and scene instances are kept apart: an asset is
 * parsed once; every instance is a SkeletonUtils clone wrapped in its own
 * Group, whose transform is the one the UI edits and the exporter writes.
 */

const DRAG_TYPE = 'text/x-assetbench-asset';
const R2D = THREE.MathUtils.RAD2DEG;
const D2R = THREE.MathUtils.DEG2RAD;

let s; // session state
let el = {};
let viewer;
let styleLink;
let cleanupFns = [];

export function mount(container) {
  styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = stylesUrl;
  document.head.appendChild(styleLink);
  container.innerHTML = '';
  container.appendChild(GLBBuilderPage());

  s = {
    assets: [],
    instances: [],
    selection: [], // instance ids, primary last
    nextInstanceId: 1,
    filter: 'all',
    assetSearch: '',
    sceneSearch: '',
    mode: 'select',
    scaleLock: true,
    arrangeAxis: 'x',
    format: 'glb',
    planeSize: ARRANGER_CONFIG.defaultPlaneSize,
    groundId: 'dust',
    customTexture: null,
    history: [],
    historyIndex: -1,
    dupMemory: null,
    lastOffset: null,
    gizmoStart: null,
    animExpanded: false,
    renamingId: null,
    draggingAssetId: null,
    busy: 0,
  };

  cacheElements();
  viewer = new ArrangerViewer(el.canvas, {
    onPick: handlePick,
    onGizmoStart: handleGizmoStart,
    onGizmoChange: handleGizmoChange,
    onGizmoEnd: () => { s.gizmoStart = null; commit(); },
  });
  applyGround();
  wireEvents();
  setMode('select');
  commit();
  renderAll();
  return unmount;
}

function unmount() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  for (const instance of s.instances) stopMixer(instance);
  for (const asset of s.assets) disposeAsset(asset);
  s.customTexture?.dispose();
  viewer?.dispose();
  disposeGroundTextures();
  styleLink?.remove();
  viewer = null;
}

function cacheElements() {
  const q = (selector) => document.querySelector(selector);
  const id = (name) => document.getElementById(`aa-${name}`);
  el = {
    app: id('app'), canvas: id('canvas'), viewport: id('viewport'), library: id('library'),
    file: id('file'), drop: id('drop'), addAssets: id('add-assets'), assetCount: id('asset-count'),
    assetSearch: id('asset-search'), assets: id('assets'), assetsEmpty: id('assets-empty'),
    outliner: id('outliner'), instanceCount: id('instance-count'), sceneSearch: id('scene-search'),
    transformTarget: id('transform-target'), snapFloor: id('snap-floor'), scaleLockBtn: id('scale-lock'),
    anim: id('anim'), animToggle: id('anim-toggle'), animBody: id('anim-body'), animCount: id('anim-count'),
    animSummary: id('anim-summary'), animClip: id('anim-clip'), animPlay: id('anim-play'), animPause: id('anim-pause'),
    animRestart: id('anim-restart'), animLoop: id('anim-loop'), animSpeed: id('anim-speed'),
    groundTexture: id('ground-texture'), uploadTexture: id('upload-texture'), textureFile: id('texture-file'),
    planeDown: id('plane-down'), planeUp: id('plane-up'), planeSize: id('plane-size'), planePreview: id('plane-preview'),
    gridVisible: id('grid-visible'), groundVisible: id('ground-visible'), gridToggle: id('grid-toggle'),
    gap: id('gap'), arrangeMeta: id('arrange-meta'), includeGround: id('include-ground'),
    downloadSelected: id('download-selected'), exportScene: id('export-scene'), selectedMeta: id('selected-meta'), sceneMeta: id('scene-meta'),
    exportPanel: id('export'), undo: id('undo'), redo: id('redo'), settingsBtn: id('settings-btn'), settings: id('settings'),
    snapMove: id('snap-move'), snapRotate: id('snap-rotate'), shadows: id('shadows'),
    dropOverlay: id('drop-overlay'), dropLabel: id('drop-label'), hint: id('hint'), busy: id('busy'), busyLabel: id('busy-label'),
    toasts: id('toasts'),
    fields: [...document.querySelectorAll('.aa-transform input[data-field]')],
    q,
  };
}

function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  cleanupFns.push(() => target.removeEventListener(type, handler, options));
}

// ---------------------------------------------------------------- events

function wireEvents() {
  const pick = () => el.file.click();
  on(el.drop, 'click', pick);
  on(el.addAssets, 'click', pick);
  on(el.file, 'change', () => { importFiles([...el.file.files]); el.file.value = ''; });

  // Library panel accepts file drops anywhere.
  on(el.library, 'dragover', (event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    el.drop.classList.add('is-dragging');
  });
  on(el.library, 'dragleave', (event) => { if (!el.library.contains(event.relatedTarget)) el.drop.classList.remove('is-dragging'); });
  on(el.library, 'drop', (event) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    el.drop.classList.remove('is-dragging');
    importFiles([...event.dataTransfer.files]);
  });

  on(el.assetSearch, 'input', () => { s.assetSearch = el.assetSearch.value.trim().toLowerCase(); renderLibrary(); });
  document.querySelectorAll('.aa-filter').forEach((button) => on(button, 'click', () => {
    s.filter = button.dataset.filter;
    document.querySelectorAll('.aa-filter').forEach((b) => b.classList.toggle('is-active', b === button));
    renderLibrary();
  }));

  on(el.assets, 'click', (event) => {
    const card = event.target.closest('[data-asset]');
    if (!card) return;
    const asset = s.assets.find((a) => a.id === Number(card.dataset.asset));
    if (!asset) return;
    if (event.target.closest('[data-add]')) addInstance(asset);
    else if (event.target.closest('[data-remove]')) removeAsset(asset);
  });
  on(el.assets, 'dblclick', (event) => {
    const card = event.target.closest('[data-asset]');
    const asset = card && s.assets.find((a) => a.id === Number(card.dataset.asset));
    if (asset) addInstance(asset);
  });
  on(el.assets, 'dragstart', (event) => {
    const card = event.target.closest('[data-asset]');
    if (!card) return;
    s.draggingAssetId = Number(card.dataset.asset);
    event.dataTransfer.setData(DRAG_TYPE, card.dataset.asset);
    event.dataTransfer.effectAllowed = 'copy';
  });
  on(el.assets, 'dragend', () => { s.draggingAssetId = null; hideDropOverlay(); });

  // Viewport drops: library cards place instances; files add animations or import.
  on(el.viewport, 'dragover', (event) => {
    const types = event.dataTransfer.types;
    if (!types.includes(DRAG_TYPE) && !types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    showDropOverlay(types.includes(DRAG_TYPE) ? 'asset' : 'files');
  });
  on(el.viewport, 'dragleave', (event) => { if (!el.viewport.contains(event.relatedTarget)) hideDropOverlay(); });
  on(el.viewport, 'drop', (event) => {
    event.preventDefault();
    hideDropOverlay();
    const assetId = Number(event.dataTransfer.getData(DRAG_TYPE));
    if (assetId) {
      const asset = s.assets.find((a) => a.id === assetId);
      if (asset) addInstance(asset, viewer.groundPoint(event.clientX, event.clientY));
    } else if (event.dataTransfer.files.length) {
      handleViewportFiles([...event.dataTransfer.files]);
    }
  });

  document.querySelectorAll('[data-mode]').forEach((button) => on(button, 'click', () => setMode(button.dataset.mode)));
  document.querySelectorAll('[data-action]').forEach((button) => on(button, 'click', () => runAction(button.dataset.action)));
  document.querySelectorAll('[data-view]').forEach((button) => on(button, 'click', () => {
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('is-active', b === button));
    viewer.setView(button.dataset.view);
  }));
  on(el.q('#aa-frame-selected'), 'click', frameSelected);
  on(el.q('#aa-frame-all'), 'click', () => viewer.frameObjects(s.instances.filter((i) => i.object.visible).map((i) => i.object)));
  on(el.gridToggle, 'click', () => setGridVisible(!viewer.gridVisible));

  // Numeric transform fields: live on input, one undo step on change.
  for (const field of el.fields) {
    on(field, 'input', () => applyField(field));
    on(field, 'change', () => { applyField(field); commit(); updateTransformPanel(); });
  }
  on(el.snapFloor, 'click', () => runAction('snap-floor'));
  on(el.scaleLockBtn, 'click', () => {
    s.scaleLock = !s.scaleLock;
    el.scaleLockBtn.classList.toggle('is-on', s.scaleLock);
    el.scaleLockBtn.setAttribute('aria-pressed', String(s.scaleLock));
    el.scaleLockBtn.innerHTML = icon(s.scaleLock ? 'link' : 'unlink');
  });

  // Outliner
  on(el.sceneSearch, 'input', () => { s.sceneSearch = el.sceneSearch.value.trim().toLowerCase(); renderOutliner(); });
  on(el.outliner, 'click', (event) => {
    const row = event.target.closest('[data-instance]');
    if (!row || event.target.closest('input')) return;
    const instance = getInstance(Number(row.dataset.instance));
    if (!instance) return;
    if (event.target.closest('[data-eye]')) { toggleVisibility(instance); return; }
    if (event.target.closest('[data-del]')) { deleteInstances([instance.id]); return; }
    if (event.target.closest('[data-rename]')) { startRename(instance.id); return; }
    selectInstance(instance.id, { additive: event.shiftKey || event.ctrlKey || event.metaKey });
  });
  on(el.outliner, 'dblclick', (event) => {
    const row = event.target.closest('[data-instance]');
    if (row && !event.target.closest('button')) startRename(Number(row.dataset.instance));
  });

  // Animations
  on(el.animToggle, 'click', () => { s.animExpanded = !s.animExpanded; updateAnimPanel(); });
  on(el.animClip, 'change', () => {
    const instance = primary();
    if (!instance) return;
    const wasPlaying = instance.playing;
    stopMixer(instance);
    instance.clipIndex = Number(el.animClip.value);
    if (wasPlaying) playAnimation(instance);
    updateAnimPanel();
  });
  on(el.animPlay, 'click', () => primary() && playAnimation(primary()));
  on(el.animPause, 'click', () => primary() && pauseAnimation(primary()));
  on(el.animRestart, 'click', () => primary() && restartAnimation(primary()));
  on(el.animLoop, 'click', () => {
    const instance = primary();
    if (!instance) return;
    instance.loop = !instance.loop;
    if (instance.action) applyActionSettings(instance);
    updateAnimPanel();
  });
  on(el.animSpeed, 'change', () => {
    const instance = primary();
    if (!instance) return;
    instance.speed = Number(el.animSpeed.value);
    if (instance.action) instance.action.timeScale = instance.speed;
  });

  // Ground
  on(el.groundTexture, 'change', () => {
    if (el.groundTexture.value === 'custom' && !s.customTexture) { el.textureFile.click(); return; }
    s.groundId = el.groundTexture.value;
    applyGround();
  });
  on(el.uploadTexture, 'click', () => el.textureFile.click());
  on(el.textureFile, 'change', async () => {
    const file = el.textureFile.files[0];
    el.textureFile.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('Use a PNG, JPG or WebP texture.', 'error'); return; }
    try {
      const texture = await loadCustomGroundTexture(file);
      s.customTexture?.dispose();
      s.customTexture = texture;
      s.groundId = 'custom';
      el.groundTexture.querySelector('option[value="custom"]').disabled = false;
      applyGround();
      toast(`Ground texture set to ${file.name}`);
    } catch (error) {
      console.error('[Arranger] texture', error);
      toast('That image could not be read.', 'error');
    }
  });
  on(el.planeDown, 'click', () => stepPlane(-1));
  on(el.planeUp, 'click', () => stepPlane(1));
  on(el.gridVisible, 'change', () => setGridVisible(el.gridVisible.checked));
  on(el.groundVisible, 'change', () => viewer.setGroundVisible(el.groundVisible.checked));

  // Arrange
  document.querySelectorAll('[data-arrange-axis]').forEach((button) => on(button, 'click', () => {
    s.arrangeAxis = button.dataset.arrangeAxis;
    document.querySelectorAll('[data-arrange-axis]').forEach((b) => b.classList.toggle('is-active', b === button));
  }));

  // Export
  document.querySelectorAll('[data-format]').forEach((button) => on(button, 'click', () => {
    if (button.disabled) return;
    s.format = button.dataset.format;
    document.querySelectorAll('[data-format]').forEach((b) => b.classList.toggle('is-active', b === button));
  }));
  on(el.downloadSelected, 'click', () => exportSelection());
  on(el.exportScene, 'click', () => exportWholeScene());

  // Top bar
  on(el.undo, 'click', undo);
  on(el.redo, 'click', redo);
  document.querySelectorAll('[data-tab]').forEach((button) => on(button, 'click', () => {
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', b === button));
    if (button.dataset.tab === 'import') el.file.click();
    if (button.dataset.tab === 'export') flash(el.exportPanel);
    if (button.dataset.tab === 'arrange') flash(el.q('.aa-arrange'));
  }));
  on(el.settingsBtn, 'click', (event) => {
    event.stopPropagation();
    el.settings.hidden = !el.settings.hidden;
    el.settingsBtn.setAttribute('aria-expanded', String(!el.settings.hidden));
  });
  on(document, 'click', (event) => {
    if (!el.settings.hidden && !el.settings.contains(event.target)) {
      el.settings.hidden = true;
      el.settingsBtn.setAttribute('aria-expanded', 'false');
    }
  });
  const applySnap = () => viewer.setSnap(Number(el.snapMove.value), Number(el.snapRotate.value));
  on(el.snapMove, 'change', applySnap);
  on(el.snapRotate, 'change', applySnap);
  on(el.shadows, 'change', () => {
    viewer.renderer.shadowMap.enabled = el.shadows.checked;
    viewer.scene.traverse((node) => { if (node.material) [node.material].flat().forEach((m) => { m.needsUpdate = true; }); });
    viewer.invalidate();
  });

  on(window, 'keydown', handleKey);
}

function handleKey(event) {
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
  if (!el.app?.isConnected) return;
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
  if (mod && key === 'y') { event.preventDefault(); redo(); return; }
  if (mod && key === 'd') { event.preventDefault(); runAction('duplicate'); return; }
  if (mod || event.altKey) return;
  if (key === 'w') setMode('move');
  else if (key === 'e') setMode('rotate');
  else if (key === 'r') setMode('scale');
  else if (key === 'q') setMode('select');
  else if (key === 'f') frameSelected();
  else if (key === 'escape') setSelection([]);
  else if (key === 'delete' || key === 'backspace') { if (s.selection.length) { event.preventDefault(); runAction('delete'); } }
  else return;
}

// ---------------------------------------------------------------- library

async function importFiles(files) {
  const { jobs, skipped } = groupFiles(files);
  if (!jobs.length) {
    toast(skipped.length ? 'Drop a .glb, .gltf or .fbx file (textures can come along with it).' : 'No files to import.', 'error');
    return;
  }
  const room = ARRANGER_CONFIG.maxAssets - s.assets.length;
  if (room <= 0) { toast(`The library holds ${ARRANGER_CONFIG.maxAssets} assets per session.`, 'error'); return; }
  if (jobs.length > room) toast(`Only ${room} more asset${room === 1 ? '' : 's'} fit — the library holds ${ARRANGER_CONFIG.maxAssets}.`, 'error');
  const loaded = [];
  setBusy(true, 'Loading assets…');
  try {
    for (const [index, job] of jobs.slice(0, room).entries()) {
      const main = job[0];
      if (s.assets.some((a) => a.filename === main.name && a.size === main.size)) { toast(`${main.name} is already in the library.`); continue; }
      setBusy(true, `Loading ${main.name} (${index + 1}/${Math.min(jobs.length, room)})`);
      try {
        const asset = await loadAsset(job);
        asset.counter = 0;
        s.assets.push(asset);
        loaded.push(asset);
        asset.notes?.forEach((note) => toast(`${main.name}: ${note.text}`));
      } catch (error) {
        console.error('[Arranger] load', error);
        toast(error.message === 'NO_MESH_WITH_CLIPS'
          ? `${main.name} only contains animation — select a rigged model and drop it on the viewport.`
          : `${main.name} could not be loaded: ${error.message || 'unknown error'}`, 'error');
      }
    }
    renderLibrary();
    setBusy(true, 'Rendering thumbnails…');
    await renderThumbnails(loaded, () => renderLibrary());
  } finally {
    setBusy(false);
  }
  if (loaded.length) toast(`${loaded.length} asset${loaded.length === 1 ? '' : 's'} added to the library`);
  renderLibrary();
}

function removeAsset(asset) {
  if (s.instances.some((i) => i.source === asset)) return;
  s.assets = s.assets.filter((a) => a !== asset);
  disposeAsset(asset);
  // History snapshots may reference it; start history fresh from here.
  s.history = [];
  s.historyIndex = -1;
  commit();
  renderLibrary();
}

function renderLibrary() {
  const count = (fn) => s.assets.filter(fn).length;
  el.assetCount.textContent = `${s.assets.length} / ${ARRANGER_CONFIG.maxAssets}`;
  const counts = { all: s.assets.length, models: count((a) => !a.clips.length), animated: count((a) => a.clips.length) };
  document.querySelectorAll('.aa-filter').forEach((b) => { b.querySelector('span').textContent = counts[b.dataset.filter]; });
  const visible = s.assets.filter((a) => {
    if (s.filter === 'models' && a.clips.length) return false;
    if (s.filter === 'animated' && !a.clips.length) return false;
    return !s.assetSearch || a.filename.toLowerCase().includes(s.assetSearch);
  });
  el.assetsEmpty.hidden = s.assets.length > 0;
  el.drop.classList.toggle('is-compact', s.assets.length > 0);
  el.assets.innerHTML = visible.map((asset) => {
    const uses = s.instances.filter((i) => i.source === asset).length;
    return `
    <article class="aa-card${uses ? ' is-used' : ''}" draggable="true" data-asset="${asset.id}" title="Drag into the viewport, or press +">
      <div class="aa-thumb">${asset.thumbnail ? `<img src="${asset.thumbnail}" alt="" draggable="false">` : '<span class="aa-spinner"></span>'}
        ${asset.clips.length ? `<span class="aa-badge">${icon('film')}Animated</span>` : ''}
        ${uses ? '' : `<button class="aa-card-remove" type="button" data-remove aria-label="Remove ${escapeAttr(asset.filename)} from library">${icon('x')}</button>`}
      </div>
      <div class="aa-card-foot">
        <span class="aa-card-name" title="${escapeAttr(asset.filename)}">${escapeHtml(asset.filename)}</span>
        <span class="aa-uses">×${uses}</span>
        <button class="aa-add" type="button" data-add aria-label="Add ${escapeAttr(asset.filename)} to scene">${icon('plus')}</button>
      </div>
    </article>`;
  }).join('');
}

// ---------------------------------------------------------------- instances

const primary = () => getInstance(s.selection[s.selection.length - 1]);
const getInstance = (id) => s.instances.find((i) => i.id === id) || null;
const selectedInstances = () => s.selection.map(getInstance).filter(Boolean);

function nextName(asset) {
  asset.counter += 1;
  return asset.counter === 1 ? asset.name : `${asset.name} ${String(asset.counter).padStart(3, '0')}`;
}

function createInstance(asset, { id = s.nextInstanceId++, name = nextName(asset), position, quaternion, scale, visible = true } = {}) {
  const object = new THREE.Group();
  object.add(cloneSkinned(asset.template));
  object.name = name;
  object.userData.instanceId = id;
  if (position) object.position.copy(position);
  if (quaternion) object.quaternion.copy(quaternion);
  if (scale) object.scale.copy(scale);
  object.visible = visible;
  viewer.addObject(object);
  const instance = { id, source: asset, name, object, mixer: null, action: null, clipIndex: 0, loop: true, speed: 1, playing: false };
  s.instances.push(instance);
  s.nextInstanceId = Math.max(s.nextInstanceId, id + 1);
  return instance;
}

/** A free spot near the centre of the plane for + Add. */
function freeSpot(asset) {
  const size = worldBox(asset.template, false).getSize(new THREE.Vector3());
  const step = Math.max(size.x, size.z, 0.5) + 0.5;
  const boxes = s.instances.filter((i) => i.object.visible).map((i) => worldBox(i.object, false));
  const half = viewer.planeSize / 2;
  for (let ring = 0; ring < 6; ring++) {
    for (let gx = -ring; gx <= ring; gx++) {
      for (let gz = -ring; gz <= ring; gz++) {
        if (Math.max(Math.abs(gx), Math.abs(gz)) !== ring) continue;
        const x = gx * step;
        const z = gz * step;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
        const candidate = new THREE.Box3(new THREE.Vector3(x - size.x / 2, -1e3, z - size.z / 2), new THREE.Vector3(x + size.x / 2, 1e3, z + size.z / 2));
        if (!boxes.some((box) => box.intersectsBox(candidate))) return new THREE.Vector3(x, 0, z);
      }
    }
  }
  return new THREE.Vector3();
}

function addInstance(asset, point) {
  const instance = createInstance(asset, {});
  const target = point || freeSpot(asset);
  // Place so the model's visual centre lands on the target X/Z; height stays as authored.
  const box = worldBox(instance.object, false);
  if (!box.isEmpty()) {
    const centre = box.getCenter(new THREE.Vector3());
    instance.object.position.x += target.x - centre.x;
    instance.object.position.z += target.z - centre.z;
  }
  setSelection([instance.id]);
  commit();
  renderAll();
}

function deleteInstances(ids) {
  for (const id of ids) {
    const instance = getInstance(id);
    if (!instance) continue;
    stopMixer(instance);
    viewer.removeObject(instance.object);
    s.instances = s.instances.filter((i) => i !== instance);
  }
  s.selection = s.selection.filter((id) => !ids.includes(id));
  viewer.setSelection(selectedInstances().map((i) => i.object));
  commit();
  renderAll();
}

function duplicate(instances) {
  return instances.map((instance) => {
    const copy = createInstance(instance.source, {
      position: instance.object.position,
      quaternion: instance.object.quaternion,
      scale: instance.object.scale,
    });
    copy.loop = instance.loop;
    copy.speed = instance.speed;
    copy.clipIndex = instance.clipIndex;
    return copy;
  });
}

function toggleVisibility(instance) {
  instance.object.visible = !instance.object.visible;
  viewer.refreshSelectionBoxes();
  viewer.attachGizmo();
  viewer.invalidate();
  commit();
  renderOutliner();
}

// ---------------------------------------------------------------- selection

function handlePick(object, { additive }) {
  const id = object?.userData.instanceId;
  if (id == null) { if (!additive) setSelection([]); return; }
  selectInstance(id, { additive });
}

function selectInstance(id, { additive = false } = {}) {
  if (additive) {
    if (s.selection.includes(id)) setSelection(s.selection.filter((x) => x !== id));
    else setSelection([...s.selection, id]);
  } else setSelection([id]);
}

function setSelection(ids) {
  const before = primary();
  s.selection = ids.filter((id) => getInstance(id));
  viewer.setSelection(selectedInstances().map((i) => i.object));
  if (primary() !== before) s.animExpanded = Boolean(primary()?.playing);
  updateSelectionUi();
}

function setMode(mode) {
  s.mode = mode;
  viewer.setMode(mode);
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
}

function frameSelected() {
  const objects = selectedInstances().map((i) => i.object);
  viewer.frameObjects(objects.length ? objects : s.instances.map((i) => i.object));
}

// ---------------------------------------------------------------- gizmo

function handleGizmoStart() {
  s.gizmoStart = new Map(selectedInstances().map((i) => [i.id, {
    position: i.object.position.clone(),
    scale: i.object.scale.clone(),
  }]));
}

function handleGizmoChange(mode) {
  const main = primary();
  if (!main || !s.gizmoStart) return;
  const start = s.gizmoStart.get(main.id);
  if (mode === 'translate' && s.selection.length > 1) {
    const delta = main.object.position.clone().sub(start.position);
    for (const instance of selectedInstances()) {
      if (instance === main) continue;
      instance.object.position.copy(s.gizmoStart.get(instance.id).position).add(delta);
    }
  }
  if (mode === 'scale' && s.scaleLock) {
    const ratios = ['x', 'y', 'z'].map((axis) => main.object.scale[axis] / (start.scale[axis] || 1));
    const ratio = ratios.reduce((best, r) => (Math.abs(r - 1) > Math.abs(best - 1) ? r : best), 1);
    main.object.scale.copy(start.scale).multiplyScalar(ratio);
  }
  viewer.refreshSelectionBoxes();
  scheduleTransformPanel();
}

let panelFrame = 0;
function scheduleTransformPanel() {
  if (panelFrame) return;
  panelFrame = requestAnimationFrame(() => { panelFrame = 0; updateTransformPanel(); });
}

// ---------------------------------------------------------------- numeric transforms

function applyField(field) {
  const instance = primary();
  if (!instance) return;
  const value = Number(field.value);
  if (field.value === '' || !Number.isFinite(value)) return;
  const { field: group, axis } = field.dataset;
  const object = instance.object;
  if (group === 'position') object.position[axis] = value;
  else if (group === 'rotation') object.rotation[axis] = value * D2R;
  else if (group === 'scale') {
    const v = Math.abs(value) < 1e-4 ? 1e-4 : value;
    if (s.scaleLock) {
      const ratio = v / (object.scale[axis] || 1);
      object.scale.multiplyScalar(ratio);
      object.scale[axis] = v;
      el.fields.filter((f) => f.dataset.field === 'scale' && f !== field).forEach((f) => { f.value = fmt(object.scale[f.dataset.axis]); });
    } else object.scale[axis] = v;
  }
  viewer.refreshSelectionBoxes();
  viewer.gizmoRadius = null;
}

function updateTransformPanel() {
  const instance = primary();
  const active = document.activeElement;
  for (const field of el.fields) {
    field.disabled = !instance;
    if (!instance) { field.value = ''; continue; }
    if (field === active) continue;
    const { field: group, axis } = field.dataset;
    const o = instance.object;
    field.value = group === 'position' ? fmt(o.position[axis]) : group === 'rotation' ? fmt(o.rotation[axis] * R2D) : fmt(o.scale[axis]);
  }
}

const fmt = (n) => {
  const v = Math.abs(n) < 5e-5 ? 0 : n;
  return String(Number(v.toFixed(3)));
};

// ---------------------------------------------------------------- actions

function runAction(action) {
  const selected = selectedInstances();
  const main = primary();
  if (!selected.length) { toast('Select an object first.'); return; }

  switch (action) {
    case 'duplicate': {
      const copies = duplicate(selected);
      s.dupMemory = copies.length === 1 ? { fromId: main.id, toId: copies[0].id } : null;
      setSelection(copies.map((c) => c.id));
      toast(copies.length === 1 ? 'Duplicated in place — move it, then Duplicate + Gap repeats that offset.' : `Duplicated ${copies.length} objects`);
      break;
    }
    case 'duplicate-gap': {
      const offset = duplicateOffset(main);
      const [copy] = duplicate([main]);
      copy.object.position.add(offset);
      s.dupMemory = { fromId: main.id, toId: copy.id };
      s.lastOffset = offset.clone();
      setSelection([copy.id]);
      break;
    }
    case 'delete':
      deleteInstances(selected.map((i) => i.id));
      return;
    case 'snap-floor':
      for (const instance of selected) {
        const box = worldBox(instance.object, true);
        if (!box.isEmpty()) instance.object.position.y -= box.min.y;
      }
      break;
    case 'reset':
      for (const instance of selected) {
        instance.object.rotation.set(0, 0, 0);
        instance.object.scale.set(1, 1, 1);
      }
      break;
    case 'centre':
      for (const instance of selected) {
        const centre = worldBox(instance.object, true).getCenter(new THREE.Vector3());
        instance.object.position.x -= centre.x;
        instance.object.position.z -= centre.z;
      }
      break;
    case 'align-x':
    case 'align-z':
      if (!needMany(2)) return;
      align(action === 'align-x' ? 'x' : 'z');
      break;
    case 'align':
      if (!needMany(2)) return;
      align(s.arrangeAxis === 'x' ? 'z' : 'x');
      break;
    case 'arrange':
      if (!needMany(2)) return;
      arrange(s.arrangeAxis, readGap());
      break;
    case 'distribute':
      if (!needMany(3)) return;
      distribute(s.arrangeAxis);
      break;
    default:
      return;
  }
  viewer.refreshSelectionBoxes();
  commit();
  renderAll();
}

function needMany(n) {
  if (s.selection.length >= n) return true;
  toast(`Shift-click to select at least ${n} objects.`);
  return false;
}

function readGap() {
  const gap = Number(el.gap.value);
  return Number.isFinite(gap) && gap >= 0 ? gap : ARRANGER_CONFIG.defaultGap;
}

/** Offset for Duplicate + Gap: the last duplicate's move, else the model's width + gap. */
function duplicateOffset(main) {
  const memory = s.dupMemory;
  if (memory && memory.toId === main.id) {
    const from = getInstance(memory.fromId);
    if (from) {
      const offset = main.object.position.clone().sub(from.object.position);
      if (offset.lengthSq() > 1e-8) return offset;
    }
  }
  if (s.lastOffset) return s.lastOffset.clone();
  const size = worldBox(main.object, true).getSize(new THREE.Vector3());
  return new THREE.Vector3(size.x + readGap(), 0, 0);
}

function align(axis) {
  const main = primary();
  const target = worldBox(main.object, true).getCenter(new THREE.Vector3())[axis];
  for (const instance of selectedInstances()) {
    if (instance === main) continue;
    const centre = worldBox(instance.object, true).getCenter(new THREE.Vector3())[axis];
    instance.object.position[axis] += target - centre;
  }
}

function sortedWithBoxes(axis) {
  return selectedInstances()
    .map((instance) => ({ instance, box: worldBox(instance.object, true) }))
    .filter((entry) => !entry.box.isEmpty())
    .sort((a, b) => a.box.min[axis] - b.box.min[axis]);
}

/** Visible-surface gaps: each box starts `gap` metres after the previous box ends. */
function arrange(axis, gap) {
  const entries = sortedWithBoxes(axis);
  let cursor = entries[0].box.max[axis] + gap;
  for (const { instance, box } of entries.slice(1)) {
    const delta = cursor - box.min[axis];
    instance.object.position[axis] += delta;
    cursor = box.max[axis] + delta + gap;
  }
  toast(`Arranged ${entries.length} objects along ${axis.toUpperCase()} with ${fmt(gap)} m gaps`);
}

function distribute(axis) {
  const entries = sortedWithBoxes(axis);
  const first = entries[0].box.min[axis];
  const last = entries[entries.length - 1].box.max[axis];
  const widths = entries.reduce((sum, e) => sum + (e.box.max[axis] - e.box.min[axis]), 0);
  const gap = (last - first - widths) / (entries.length - 1);
  let cursor = first;
  for (const { instance, box } of entries) {
    instance.object.position[axis] += cursor - box.min[axis];
    cursor += box.max[axis] - box.min[axis] + gap;
  }
  toast(`Distributed with ${fmt(gap)} m gaps`);
}

// ---------------------------------------------------------------- history

function snapshot() {
  return {
    instances: s.instances.map((i) => ({
      id: i.id,
      sourceId: i.source.id,
      name: i.name,
      visible: i.object.visible,
      position: i.object.position.clone(),
      quaternion: i.object.quaternion.clone(),
      scale: i.object.scale.clone(),
    })),
    selection: [...s.selection],
  };
}

function commit() {
  const state = snapshot();
  const current = s.history[s.historyIndex];
  if (current && sameState(current, state)) { updateHistoryButtons(); return; }
  s.history = s.history.slice(0, s.historyIndex + 1);
  s.history.push(state);
  if (s.history.length > ARRANGER_CONFIG.historyLimit) s.history.shift();
  s.historyIndex = s.history.length - 1;
  updateHistoryButtons();
}

function sameState(a, b) {
  if (a.instances.length !== b.instances.length) return false;
  return a.instances.every((x, k) => {
    const y = b.instances[k];
    return x.id === y.id && x.name === y.name && x.visible === y.visible
      && x.position.equals(y.position) && x.quaternion.equals(y.quaternion) && x.scale.equals(y.scale);
  });
}

function restore(state) {
  const keep = new Set(state.instances.map((i) => i.id));
  for (const instance of [...s.instances]) {
    if (!keep.has(instance.id)) {
      stopMixer(instance);
      viewer.removeObject(instance.object);
      s.instances = s.instances.filter((i) => i !== instance);
    }
  }
  const ordered = [];
  for (const saved of state.instances) {
    let instance = getInstance(saved.id);
    const asset = s.assets.find((a) => a.id === saved.sourceId);
    if (!instance && asset) instance = createInstance(asset, { id: saved.id, name: saved.name });
    if (!instance) continue;
    instance.name = saved.name;
    instance.object.name = saved.name;
    instance.object.visible = saved.visible;
    instance.object.position.copy(saved.position);
    instance.object.quaternion.copy(saved.quaternion);
    instance.object.scale.copy(saved.scale);
    ordered.push(instance);
  }
  s.instances = ordered;
  s.selection = [];
  setSelection(state.selection);
  viewer.refreshSelectionBoxes();
  renderAll();
}

function undo() {
  if (s.historyIndex <= 0) return;
  s.historyIndex -= 1;
  restore(s.history[s.historyIndex]);
  updateHistoryButtons();
}

function redo() {
  if (s.historyIndex >= s.history.length - 1) return;
  s.historyIndex += 1;
  restore(s.history[s.historyIndex]);
  updateHistoryButtons();
}

function updateHistoryButtons() {
  el.undo.disabled = s.historyIndex <= 0;
  el.redo.disabled = s.historyIndex >= s.history.length - 1;
}

// ---------------------------------------------------------------- outliner

function renderOutliner() {
  el.instanceCount.textContent = `(${s.instances.length})`;
  const selected = new Set(s.selection);
  const main = primary();
  const rows = s.instances.filter((i) => !s.sceneSearch || i.name.toLowerCase().includes(s.sceneSearch));
  el.outliner.innerHTML = `
    <li class="aa-tree-root">${icon('folder')}<span>Scene</span></li>
    ${rows.map((i) => `
    <li class="aa-tree-row${selected.has(i.id) ? ' is-selected' : ''}${i === main ? ' is-primary' : ''}${i.object.visible ? '' : ' is-hidden'}" data-instance="${i.id}" role="treeitem" aria-selected="${selected.has(i.id)}">
      <button class="aa-eye" type="button" data-eye aria-label="${i.object.visible ? 'Hide' : 'Show'} ${escapeAttr(i.name)}">${icon(i.object.visible ? 'eye' : 'eyeOff')}</button>
      ${icon(i.source.skinned ? 'person' : 'box', 'aa-tree-icon')}
      ${s.renamingId === i.id
        ? `<input class="aa-rename" type="text" value="${escapeAttr(i.name)}" maxlength="64" aria-label="Rename">`
        : `<span class="aa-tree-name">${escapeHtml(i.name)}</span>`}
      <span class="aa-tree-actions">
        <button type="button" data-rename title="Rename" aria-label="Rename ${escapeAttr(i.name)}">${icon('more')}</button>
        <button type="button" data-del title="Delete" aria-label="Delete ${escapeAttr(i.name)}">${icon('trash')}</button>
      </span>
    </li>`).join('')}
    ${s.instances.length ? '' : '<li class="aa-tree-empty">No objects in the scene yet.</li>'}`;
  const input = el.outliner.querySelector('.aa-rename');
  if (input) {
    input.focus();
    input.select();
    const finish = (save) => {
      if (s.renamingId == null) return;
      const instance = getInstance(s.renamingId);
      s.renamingId = null;
      const value = input.value.trim();
      if (save && instance && value && value !== instance.name) {
        instance.name = value;
        instance.object.name = value;
        commit();
      }
      renderOutliner();
      updateSelectionUi();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true);
      if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }
}

function startRename(id) {
  s.renamingId = id;
  renderOutliner();
}

// ---------------------------------------------------------------- animation

function clipOf(instance) {
  return instance.source.clips[instance.clipIndex] || instance.source.clips[0] || null;
}

function applyActionSettings(instance) {
  const action = instance.action;
  action.setLoop(instance.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = !instance.loop;
  action.timeScale = instance.speed;
}

function playAnimation(instance) {
  const clip = clipOf(instance);
  if (!clip) return;
  if (!instance.mixer) {
    instance.mixer = new THREE.AnimationMixer(instance.object);
    instance.mixer.addEventListener('finished', () => {
      instance.playing = false;
      viewer.mixers.delete(instance.mixer);
      if (primary() === instance) updateAnimPanel();
    });
  }
  if (!instance.action || instance.action.getClip() !== clip) {
    instance.action?.stop();
    instance.action = instance.mixer.clipAction(clip);
  }
  applyActionSettings(instance);
  if (!instance.action.isRunning() && instance.action.time >= clip.duration - 1e-3) instance.action.reset();
  instance.action.paused = false;
  instance.action.play();
  instance.playing = true;
  viewer.mixers.add(instance.mixer);
  updateAnimPanel();
}

function pauseAnimation(instance) {
  if (!instance.action) return;
  instance.action.paused = true;
  instance.playing = false;
  viewer.mixers.delete(instance.mixer);
  viewer.invalidate();
  updateAnimPanel();
}

function restartAnimation(instance) {
  if (!instance.action) { playAnimation(instance); return; }
  instance.action.reset();
  playAnimation(instance);
}

function stopMixer(instance) {
  if (!instance.mixer) return;
  instance.mixer.stopAllAction();
  instance.mixer.uncacheRoot(instance.object);
  viewer?.mixers.delete(instance.mixer);
  instance.mixer = null;
  instance.action = null;
  instance.playing = false;
  viewer?.invalidate();
}

function updateAnimPanel() {
  const instance = primary();
  const clips = instance?.source.clips || [];
  el.animCount.textContent = `(${clips.length})`;
  el.animToggle.disabled = !clips.length;
  el.anim.classList.toggle('has-clips', clips.length > 0);
  el.animSummary.textContent = !instance ? 'Select an object' : clips.length ? `${clips.length} available` : 'No animations on this object';
  const expanded = s.animExpanded && clips.length > 0;
  el.animBody.hidden = !expanded;
  el.animToggle.setAttribute('aria-expanded', String(expanded));
  if (!expanded) return;
  el.animClip.innerHTML = clips.map((clip, k) => `<option value="${k}"${k === instance.clipIndex ? ' selected' : ''}>${escapeHtml(clip.name || `Clip ${k + 1}`)} · ${clip.duration.toFixed(2)}s</option>`).join('');
  el.animPlay.classList.toggle('is-on', instance.playing);
  el.animLoop.classList.toggle('is-on', instance.loop);
  el.animLoop.setAttribute('aria-pressed', String(instance.loop));
  el.animLoop.innerHTML = `${icon('loop')}Loop ${instance.loop ? 'ON' : 'OFF'}`;
  el.animSpeed.value = String(instance.speed);
}

async function handleViewportFiles(files) {
  const instance = primary();
  const rigged = instance && (instance.source.skinned || instance.source.clips.length);
  if (!rigged) { importFiles(files); return; }
  const { jobs } = groupFiles(files);
  if (!jobs.length) { toast('Drop a .glb, .gltf or .fbx file.', 'error'); return; }
  setBusy(true, `Reading animation for ${instance.name}…`);
  let loaded;
  try {
    loaded = await loadClipsFromFiles(jobs[0]);
  } catch (error) {
    setBusy(false);
    toast(`Could not read ${jobs[0][0].name}: ${error.message}`, 'error');
    return;
  }
  setBusy(false);
  try {
    if (!loaded.clips.length) {
      // No clips: it's a model — import it instead.
      importFiles(files);
      return;
    }
    const adapted = loaded.clips.map((clip) => adaptClip(clip, instance.source.template)).filter(Boolean);
    if (!adapted.length) { toast('Animation is not compatible with this model.', 'error'); return; }
    const names = new Set(instance.source.clips.map((c) => c.name));
    for (const clip of adapted) {
      let name = clip.name;
      for (let n = 2; names.has(name); n++) name = `${clip.name} ${n}`;
      clip.name = name;
      names.add(name);
      instance.source.clips.push(clip);
    }
    instance.clipIndex = instance.source.clips.length - adapted.length;
    s.animExpanded = true;
    stopMixer(instance);
    playAnimation(instance);
    renderLibrary();
    toast(`Added ${adapted.length} animation${adapted.length === 1 ? '' : 's'} to ${instance.source.filename}`);
  } finally {
    loaded.dispose();
  }
}

function showDropOverlay(kind) {
  const instance = primary();
  let label = 'Drop to place in scene';
  if (kind === 'files') {
    label = instance && (instance.source.skinned || instance.source.clips.length)
      ? `Drop Animation → ${instance.name}`
      : 'Drop to add to the Asset Library';
  } else if (s.draggingAssetId) {
    const asset = s.assets.find((a) => a.id === s.draggingAssetId);
    if (asset) label = `Drop to place ${asset.filename}`;
  }
  el.dropLabel.textContent = label;
  el.dropOverlay.hidden = false;
}

function hideDropOverlay() { el.dropOverlay.hidden = true; }

// ---------------------------------------------------------------- ground

function applyGround() {
  const texture = s.groundId === 'custom' ? s.customTexture : s.groundId === 'none' ? null : getGroundTexture(s.groundId);
  viewer.setGroundTexture(s.groundId, texture);
  el.groundTexture.value = s.groundId;
  const source = texture?.image;
  el.planePreview.style.backgroundImage = source?.toDataURL ? `url(${source.toDataURL('image/jpeg', 0.7)})` : '';
  el.planePreview.classList.toggle('is-textured', Boolean(texture));
}

function stepPlane(direction) {
  const sizes = ARRANGER_CONFIG.planeSizes;
  const index = THREE.MathUtils.clamp(sizes.indexOf(s.planeSize) + direction, 0, sizes.length - 1);
  s.planeSize = sizes[index];
  viewer.setPlaneSize(s.planeSize);
  el.planeSize.textContent = `${s.planeSize}m × ${s.planeSize}m`;
  el.planeDown.disabled = index === 0;
  el.planeUp.disabled = index === sizes.length - 1;
}

function setGridVisible(visible) {
  viewer.setGridVisible(visible);
  el.gridVisible.checked = visible;
  el.gridToggle.classList.toggle('is-on', visible);
}

// ---------------------------------------------------------------- export

async function exportSelection() {
  const selected = selectedInstances();
  if (!selected.length) return;
  const name = selected.length === 1 ? selected[0].name : 'selection';
  await runExport(selected, { name, prefixClips: selected.length > 1 });
}

async function exportWholeScene() {
  const visible = s.instances.filter((i) => i.object.visible);
  if (!visible.length) { toast('Nothing visible to export.', 'error'); return; }
  const includeGround = el.includeGround.checked;
  const ground = includeGround
    ? { size: s.planeSize, material: viewer.groundMaterial.map ? viewer.groundMaterial : viewer.baseMaterial }
    : null;
  const animated = visible.filter((i) => i.source.clips.length).length;
  await runExport(visible, { name: 'assetbench_scene', ground, prefixClips: animated > 1 });
}

async function runExport(instances, options) {
  setBusy(true, `Exporting ${s.format.toUpperCase()}…`);
  try {
    const result = await exportInstances(instances, { ...options, format: s.format });
    downloadBlob(result.blob, result.filename);
    const lost = result.lost?.length ? ` (${result.lost.join(', ')} not supported in ${s.format.toUpperCase()})` : '';
    toast(`Exported ${result.filename}${lost}`);
  } catch (error) {
    console.error('[Arranger] export', error);
    toast(`Export failed: ${error.message || error}`, 'error');
  } finally {
    setBusy(false);
  }
}

// ---------------------------------------------------------------- ui

function renderAll() {
  renderLibrary();
  renderOutliner();
  updateSelectionUi();
}

function updateSelectionUi() {
  const selected = selectedInstances();
  const main = primary();
  const has = selected.length > 0;
  el.transformTarget.textContent = main ? (selected.length > 1 ? `${main.name} +${selected.length - 1}` : main.name) : 'Nothing selected';
  el.snapFloor.disabled = !has;
  document.querySelectorAll('.aa-transform [data-action], .aa-toolbar [data-action], .aa-arrange [data-action]').forEach((button) => {
    const needs = { 'align-x': 2, 'align-z': 2, align: 2, arrange: 2, distribute: 3 }[button.dataset.action] || 1;
    button.disabled = selected.length < needs;
  });
  el.arrangeMeta.textContent = selected.length > 1 ? `${selected.length} selected` : 'Shift-click 2+ objects';
  el.downloadSelected.disabled = !has;
  el.selectedMeta.textContent = has ? `${selected.length} object${selected.length === 1 ? '' : 's'}` : 'Nothing selected';
  const visibleCount = s.instances.filter((i) => i.object.visible).length;
  el.exportScene.disabled = !visibleCount;
  el.sceneMeta.textContent = visibleCount ? `${visibleCount} object${visibleCount === 1 ? '' : 's'} combined` : 'All visible objects combined';
  el.hint.hidden = s.instances.length > 0;
  updateTransformPanel();
  updateAnimPanel();
  renderOutlinerSelection();
}

/** Selection-only outliner refresh, without rebuilding rows. */
function renderOutlinerSelection() {
  const selected = new Set(s.selection);
  const main = primary();
  el.outliner.querySelectorAll('[data-instance]').forEach((row) => {
    const id = Number(row.dataset.instance);
    row.classList.toggle('is-selected', selected.has(id));
    row.classList.toggle('is-primary', main?.id === id);
    row.setAttribute('aria-selected', String(selected.has(id)));
  });
  el.outliner.querySelector('.is-primary')?.scrollIntoView({ block: 'nearest' });
}

function setBusy(busy, label = 'Working…') {
  s.busy = busy;
  el.busy.hidden = !busy;
  el.busyLabel.textContent = label;
}

function toast(message, kind = 'info') {
  const node = document.createElement('div');
  node.className = `aa-toast aa-toast--${kind}`;
  node.textContent = message;
  el.toasts.appendChild(node);
  while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
  setTimeout(() => node.classList.add('is-leaving'), kind === 'error' ? 5200 : 3200);
  setTimeout(() => node.remove(), kind === 'error' ? 5600 : 3600);
}

function flash(node) {
  node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  node.classList.remove('is-flash');
  void node.offsetWidth;
  node.classList.add('is-flash');
}

function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(value) { return escapeHtml(value).replace(/"/g, '&quot;'); }
