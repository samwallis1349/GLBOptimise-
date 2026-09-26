import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import stylesUrl from './convert-files.css?url';
import { ConvertFilesPage } from './ConvertFilesPage.js';
import { loadModelFiles, revokeUrls } from './processing/loadModel.js';
import { TEX_KEYS, exportModel, materialsOf, prepareExportRoot } from './processing/exportModel.js';
import { sampleChest } from './processing/sampleChest.js';

/**
 * Convert Files ("Model Forge") — open GLB/glTF/FBX/OBJ/DAE/STL/PLY/3MF/3DS,
 * preview, rescale / re-axis / re-pivot, then export GLB/glTF/OBJ/STL/PLY/USDZ
 * as a .zip. Everything runs in the browser.
 *
 * Scene graph: view (preview-only Z-up correction) → pivot (export root:
 * scale + up-axis rotation) → holder (pivot offset) → model.
 */

let el = {};
let ctx = null;

export function mount(container) {
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = stylesUrl;
  document.head.appendChild(styleLink);

  container.innerHTML = '';
  container.appendChild(ConvertFilesPage());
  cacheElements();
  ctx = createViewer();
  wireEvents();

  const sample = sampleChest();
  install({ ...sample, name: 'Sample: treasure chest (built in)', base: 'treasure_chest', notes: [{ text: 'This is a built-in example. Drop your own model to replace it.' }] });
  el.busy.hidden = true;

  return () => {
    ctx?.dispose();
    ctx = null;
    styleLink.remove();
  };
}

function cacheElements() {
  const id = (name) => document.getElementById(`cf-${name}`);
  el = {
    stage: id('stage'), canvas: id('view'), wire: id('wire'), grid: id('grid'), anim: id('anim'), frame: id('frame'),
    srcName: id('src-name'), busy: id('busy'), drop: id('drop'), file: id('file'), notes: id('notes'),
    scale: id('scale'), up: id('up'), pivot: id('pivot'), anims: id('anims'), convert: id('convert'), status: id('status'),
    stats: {
      mesh: id('s-mesh'), tri: id('s-tri'), vert: id('s-vert'), mat: id('s-mat'),
      tex: id('s-tex'), bone: id('s-bone'), anim: id('s-anim'), size: id('s-size'),
    },
  };
}

// ---------- Viewer ----------

function createViewer() {
  const renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.01, 1000);
  const controls = new OrbitControls(camera, el.canvas);
  controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffe2cc, 0.8);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  const grid = new THREE.GridHelper(10, 20, 0x6b4e22, 0x2a2218);
  scene.add(grid);

  const view = new THREE.Group();
  const pivot = new THREE.Group();
  const holder = new THREE.Group();
  view.add(pivot);
  pivot.add(holder);
  scene.add(view);

  const resize = () => {
    const r = el.stage.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(el.stage);
  resize();

  const state = {
    renderer, scene, camera, controls, grid, view, pivot, holder,
    current: null, // { model, clips, name, base, notes, urls, textureCount }
    mixer: null,
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      if (state.current) releaseModel(state.current);
      renderer.dispose();
    },
  };

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.mixer && el.anim.getAttribute('aria-pressed') === 'true') state.mixer.update(dt);
    controls.update();
    renderer.render(scene, camera);
  });

  return state;
}

function releaseModel(current) {
  revokeUrls(current.urls);
  current.model.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    materialsOf(o).forEach((m) => {
      TEX_KEYS.forEach((k) => m[k]?.dispose());
      m.dispose();
    });
  });
}

function worldBox(obj) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj, true);
}

/** Bounding box in export space — i.e. without the preview-only Z-up correction. */
function exportBox() {
  const saved = ctx.view.rotation.x;
  ctx.view.rotation.x = 0;
  const box = worldBox(ctx.pivot);
  ctx.view.rotation.x = saved;
  ctx.view.updateMatrixWorld(true);
  return box;
}

function fitGrid() {
  if (!ctx.current) return;
  const b = worldBox(ctx.view);
  if (b.isEmpty()) return;
  const s = b.getSize(new THREE.Vector3());
  const span = Math.max(s.x, s.z, 0.001) * 2.2;
  const unit = 10 ** Math.ceil(Math.log10(span));
  ctx.grid.scale.setScalar(unit / 10);
  ctx.grid.position.y = b.min.y;
}

function frame() {
  const { camera, controls } = ctx;
  const b = worldBox(ctx.view);
  if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3());
  const s = b.getSize(new THREE.Vector3());
  const d = Math.max(s.x, s.y, s.z, 0.001);
  const dist = (d / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.5;
  camera.near = d / 1000;
  camera.far = d * 100;
  camera.updateProjectionMatrix();
  camera.position.copy(c).add(new THREE.Vector3(0.9, 0.6, 1).normalize().multiplyScalar(dist));
  controls.target.copy(c);
  controls.update();
  fitGrid();
}

function applyAdjust(refit) {
  if (!ctx.current) return;
  const { view, pivot, holder } = ctx;
  const scale = parseFloat(el.scale.value);
  const upZ = el.up.value === 'z';
  pivot.scale.setScalar(scale > 0 ? scale : 1);
  pivot.rotation.set(upZ ? Math.PI / 2 : 0, 0, 0);
  view.rotation.set(upZ ? -Math.PI / 2 : 0, 0, 0);
  holder.position.set(0, 0, 0);

  const mode = el.pivot.value;
  if (mode !== 'keep') {
    const b = exportBox();
    if (!b.isEmpty()) {
      const c = b.getCenter(new THREE.Vector3());
      if (mode === 'bottom') {
        if (upZ) c.z = b.min.z;
        else c.y = b.min.y;
      }
      // Convert the world-space offset into pivot-local space.
      const inv = new THREE.Matrix4().compose(new THREE.Vector3(), pivot.quaternion, pivot.scale).invert();
      holder.position.copy(c.negate().applyMatrix4(inv));
    }
  }
  view.updateMatrixWorld(true);
  updateSize();
  if (refit) frame();
  else fitGrid();
}

// ---------- Stats + UI ----------

const fmtN = (n) => n.toLocaleString('en-GB');

function showStats() {
  const current = ctx.current;
  let meshes = 0;
  let verts = 0;
  let tris = 0;
  let bones = 0;
  const materials = new Set();
  const textures = new Set();
  current.model.traverse((o) => {
    if (o.isBone) bones++;
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    const p = g.attributes.position;
    if (p) {
      verts += p.count;
      tris += Math.floor((g.index ? g.index.count : p.count) / 3);
    }
    materialsOf(o).forEach((m) => {
      materials.add(m);
      TEX_KEYS.forEach((k) => m[k] && textures.add(m[k]));
    });
  });
  current.textureCount = textures.size;
  el.stats.mesh.textContent = fmtN(meshes);
  el.stats.tri.textContent = fmtN(tris);
  el.stats.vert.textContent = fmtN(verts);
  el.stats.mat.textContent = fmtN(materials.size);
  el.stats.tex.textContent = fmtN(textures.size);
  el.stats.bone.textContent = fmtN(bones);
  el.stats.anim.textContent = fmtN(current.clips.length);
  el.anim.disabled = current.clips.length === 0;
  updateSize();
}

function updateSize() {
  if (!ctx.current) return;
  const s = exportBox().getSize(new THREE.Vector3());
  const f = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  el.stats.size.textContent = `${f(s.x)}×${f(s.y)}×${f(s.z)}`;
  el.stats.size.title = `X ${s.x}  Y ${s.y}  Z ${s.z}`;
}

function showNotes(list) {
  el.notes.textContent = '';
  for (const note of list) {
    const li = document.createElement('li');
    if (note.error) li.className = 'is-error';
    li.textContent = note.text;
    el.notes.appendChild(li);
  }
}

function setStatus(kind, text) {
  el.status.className = `cf-status${kind ? ` is-${kind}` : ''}`;
  el.status.textContent = text;
}

function setWire(on) {
  ctx.current?.model.traverse((o) => {
    if (o.isMesh) materialsOf(o).forEach((m) => { m.wireframe = on; });
  });
}

function toggle(button) {
  const on = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(on));
  return on;
}

function install(loaded) {
  if (ctx.current) {
    ctx.holder.remove(ctx.current.model);
    releaseModel(ctx.current);
  }
  ctx.mixer?.stopAllAction();
  ctx.mixer = null;

  ctx.current = { ...loaded, clips: loaded.clips || [], notes: loaded.notes || [], urls: loaded.urls || [] };
  ctx.holder.add(loaded.model);
  if (ctx.current.clips.length) {
    ctx.mixer = new THREE.AnimationMixer(loaded.model);
    ctx.mixer.clipAction(ctx.current.clips[0]).play();
  }
  setWire(el.wire.getAttribute('aria-pressed') === 'true');
  el.srcName.textContent = loaded.name;
  showStats();
  showNotes(ctx.current.notes);
  applyAdjust(true);
  el.convert.disabled = false;
}

// ---------- Actions ----------

async function loadFiles(fileList) {
  el.busy.hidden = false;
  el.busy.textContent = 'LOADING';
  setStatus('', '');
  try {
    install(await loadModelFiles(fileList));
    setStatus('', 'Loaded. Pick a format and convert.');
  } catch (err) {
    console.error('[ConvertFiles]', err);
    showNotes([{ error: true, text: err?.message || 'That file couldn’t be read.' }]);
    setStatus('error', 'Loading failed. The previous model is still loaded.');
  } finally {
    el.busy.hidden = true;
  }
}

function buildExportRoot() {
  const { mixer, current } = ctx;
  if (mixer) mixer.stopAllAction(); // restores the rest pose before cloning
  const root = SkeletonUtils.clone(ctx.pivot);
  if (mixer && current.clips.length) mixer.clipAction(current.clips[0]).play();
  return prepareExportRoot(root, current.base);
}

async function convert() {
  const current = ctx?.current;
  if (!current) return;
  const format = document.querySelector('input[name="cf-fmt"]:checked').value;
  el.convert.disabled = true;
  setStatus('', 'Converting…');
  try {
    const { blob, filename, lost } = await exportModel(buildExportRoot(), {
      format,
      base: current.base || 'model',
      clips: el.anims.checked ? current.clips : [],
      textureCount: current.textureCount,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const lostNote = lost.length ? ` ${format.toUpperCase()} can’t store ${lost.join(' or ')}, so they were left out.` : '';
    setStatus('ok', `Downloaded ${filename} (${formatBytes(blob.size)}).${lostNote}`);
  } catch (err) {
    console.error('[ConvertFiles]', err);
    setStatus('error', `Conversion failed: ${err?.message || 'unknown error'}. Try another format.`);
  } finally {
    el.convert.disabled = false;
  }
}

function formatBytes(bytes) {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function wireEvents() {
  ['scale', 'up', 'pivot'].forEach((key) => el[key].addEventListener('change', () => applyAdjust(true)));
  el.scale.addEventListener('input', () => applyAdjust(false));
  document.querySelectorAll('.cf-chip[data-scale]').forEach((button) => button.addEventListener('click', () => {
    el.scale.value = String(+(parseFloat(el.scale.value || 1) * parseFloat(button.dataset.scale)).toPrecision(6));
    applyAdjust(true);
  }));

  el.drop.addEventListener('click', () => el.file.click());
  el.drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.file.click();
    }
  });
  el.file.addEventListener('change', () => {
    if (el.file.files.length) loadFiles(el.file.files);
    el.file.value = '';
  });
  for (const target of [el.drop, el.stage]) {
    target.addEventListener('dragover', (e) => {
      e.preventDefault();
      target.classList.add('is-dragging');
    });
    target.addEventListener('dragleave', (e) => {
      if (!target.contains(e.relatedTarget)) target.classList.remove('is-dragging');
    });
    target.addEventListener('drop', (e) => {
      e.preventDefault();
      target.classList.remove('is-dragging');
      if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
    });
  }

  el.wire.addEventListener('click', () => setWire(toggle(el.wire)));
  el.grid.addEventListener('click', () => { ctx.grid.visible = toggle(el.grid); });
  el.anim.addEventListener('click', () => {
    el.anim.textContent = toggle(el.anim) ? 'Pause animation' : 'Play animation';
  });
  el.frame.addEventListener('click', frame);
  el.convert.addEventListener('click', convert);
}
