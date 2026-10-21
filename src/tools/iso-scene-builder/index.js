import JSZip from 'jszip';
import { deleteObject, listObjects, loadScene, putObject, saveScene } from './bank.js';
import {
  LAYER_MAX, LAYER_MIN, SCALE_MAX, SCALE_MIN, TILE_SIZES, ZOOM_MAX, ZOOM_MIN,
  anchorFromAlpha, clamp, drawOrder, gridFromWorld, itemRect, layoutJson, pixelAt,
  sceneBounds, snapWorld, stepOnGrid, worldFromGrid,
} from './scene.js';
import './iso-scene.css';

const DRAG_TYPE = 'application/x-isb-object';
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_SIDE = 4096;
const MAX_OBJECTS = 500;
const MAX_EXPORT_SIDE = 8192;
const HISTORY_LIMIT = 100;
const ALPHA_HIT = 16;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/**
 * Iso Scene Builder — a bank of the user's isometric PNGs that they drag onto
 * a 2:1 grid, move, snap, flip, scale and layer, then export as one PNG plus
 * a layout JSON. The maths lives in scene.js, the storage in bank.js.
 */
export function mount(container) {
  const page = document.createElement('main');
  page.className = 'isb-page container section';
  page.innerHTML = `
  <header class="isb-heading"><div><p class="isb-eyebrow">YOUR OBJECTS / ONE ISOMETRIC SCENE</p><h1>Iso Scene <span>Builder</span></h1><p>Keep a bank of isometric objects, drag them onto the grid and lay out your scene.</p></div><span class="isb-local">● Saved on this device</span></header>
  <p class="isb-status" role="status" aria-live="polite">Loading your object bank…</p>
  <div class="isb-workspace">
    <aside class="isb-panel isb-bank" aria-label="Object bank">
      <div class="isb-panel-heading"><h2>01 / Object bank</h2><span data-count>0</span></div>
      <div class="isb-bank-add"><button class="isb-button isb-primary" data-add>Add PNGs</button><input type="file" accept="image/png,image/webp" multiple hidden data-file></div>
      <input class="isb-search" type="search" placeholder="Search objects" aria-label="Search objects" data-search>
      <div class="isb-bank-list" data-bank></div>
      <p class="isb-tip">Drag an object onto the grid, or click it to drop it in the middle. Transparent PNG or WebP, up to ${MAX_SIDE} px.</p>
    </aside>
    <section class="isb-panel isb-stage-panel">
      <div class="isb-panel-heading"><h2>02 / Scene</h2><span data-scene-info>0 objects</span></div>
      <div class="isb-stage" data-stage tabindex="0" aria-label="Isometric scene. Drag objects to move them.">
        <canvas data-canvas></canvas>
        <div class="isb-empty" data-empty><span>◇</span><p>Add isometric PNGs to your bank, then drag them here.</p></div>
        <div class="isb-view-tools"><button data-zoom-out aria-label="Zoom out">−</button><output data-zoom>100%</output><button data-zoom-in aria-label="Zoom in">+</button><button data-fit>Fit</button></div>
      </div>
      <p class="isb-tip isb-keys">Drag empty space to pan · wheel to zoom · Alt-drag copies · arrows nudge · F flip · [ ] layer · Ctrl+D duplicate · Del remove · Ctrl+Z undo</p>
    </section>
    <aside class="isb-panel isb-side">
      <section class="isb-section" data-inspector hidden>
        <h2>03 / Selected</h2>
        <p class="isb-selected-name" data-sel-name></p>
        <label>Scale <output data-scale-value>100%</output><input type="range" min="${SCALE_MIN * 100}" max="400" step="1" value="100" data-scale></label>
        <div class="isb-row"><button class="isb-button" data-flip>Flip ⇋</button><button class="isb-button" data-dup>Duplicate</button><button class="isb-button isb-danger" data-delete>Remove</button></div>
        <div class="isb-row isb-layer"><span>Layer</span><button class="isb-button" data-layer-down aria-label="Layer down">▼</button><output data-layer>0</output><button class="isb-button" data-layer-up aria-label="Layer up">▲</button></div>
        <div class="isb-row" data-order-row hidden><button class="isb-button" data-back>Send back</button><button class="isb-button" data-front>Bring forward</button></div>
        <details class="isb-anchor"><summary>Ground point (every copy)</summary>
          <label>Across <output data-ax-value></output><input type="range" min="0" max="100" step="0.5" data-ax></label>
          <label>Down <output data-ay-value></output><input type="range" min="0" max="100" step="0.5" data-ay></label>
          <button class="isb-button" data-anchor-auto>Detect from pixels</button>
          <p class="isb-tip">The point that sits on the tile and decides what is in front. The gold dot on the scene.</p>
        </details>
      </section>
      <section class="isb-section">
        <h2>Grid</h2>
        <label>Tile width<select data-tile>${TILE_SIZES.map((t) => `<option value="${t}">${t} × ${t / 2} px</option>`).join('')}</select></label>
        <label>Snap<select data-snap><option value="centre">Tile centres</option><option value="corner">Tile corners</option><option value="half">Half tiles</option><option value="off">Off</option></select></label>
        <label class="isb-check"><input type="checkbox" data-grid>Show grid</label>
        <label class="isb-check"><input type="checkbox" data-depth>Auto depth (lower on screen draws in front)</label>
        <label>Background<select data-bg><option value="transparent">Transparent</option><option value="colour">Solid colour</option></select></label>
        <label data-bg-colour-field hidden>Colour<input type="color" data-bg-colour></label>
      </section>
      <section class="isb-section">
        <h2>04 / Export</h2>
        <label>PNG scale<select data-export-scale><option value="1">1×</option><option value="2">2×</option><option value="0.5">0.5×</option></select></label>
        <label class="isb-check"><input type="checkbox" data-export-grid>Include grid lines</label>
        <button class="isb-button isb-primary" data-export-png>Download PNG</button>
        <div class="isb-row"><button class="isb-button" data-export-json>Layout JSON</button><button class="isb-button" data-export-zip>Scene ZIP</button></div>
        <p class="isb-tip">The ZIP holds the PNG, layout.json and every object used, ready for a game engine.</p>
        <button class="isb-button isb-danger isb-clear" data-clear>Clear scene</button>
      </section>
    </aside>
  </div>`;
  container.replaceChildren(page);

  const q = (s) => page.querySelector(s);
  const canvas = q('[data-canvas]');
  const stage = q('[data-stage]');
  const ctx = canvas.getContext('2d');

  /** id → { ...record, bitmap, alpha, url } */
  const objects = new Map();
  let scene = { tile: 64, snap: 'centre', showGrid: true, autoDepth: true, background: 'transparent', bgColour: '#1b1f27', items: [] };
  const view = { zoom: 1, panX: 0, panY: 0 };
  let selected = null;
  let hoverTile = null;
  let drag = null;
  let spaceDown = false;
  let dead = false;
  let loaded = false;
  let frame = 0;
  let saveTimer = 0;
  let clearArmed = 0;
  const undo = [];
  const redo = [];

  const notice = (text, error = false) => {
    const el = q('.isb-status');
    el.textContent = text;
    el.classList.toggle('is-error', error);
  };
  const selectedItem = () => scene.items.find((i) => i.uid === selected) ?? null;

  // ---------- view ----------
  let cssW = 0, cssH = 0, dpr = 1;
  const resize = () => {
    const rect = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = Math.max(1, rect.width); cssH = Math.max(1, rect.height);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    render();
  };
  const toWorld = (sx, sy) => ({ x: (sx - view.panX) / view.zoom, y: (sy - view.panY) / view.zoom });
  const eventPoint = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  };
  function zoomAt(sx, sy, factor) {
    const before = toWorld(sx, sy);
    view.zoom = clamp(view.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    view.panX = sx - before.x * view.zoom;
    view.panY = sy - before.y * view.zoom;
    q('[data-zoom]').textContent = `${Math.round(view.zoom * 100)}%`;
    render();
  }
  function fitView() {
    const b = sceneBounds(scene.items, objects);
    if (!b) {
      view.zoom = 1; view.panX = cssW / 2; view.panY = cssH / 3;
    } else {
      const pad = 48;
      view.zoom = clamp(Math.min((cssW - pad * 2) / Math.max(1, b.w), (cssH - pad * 2) / Math.max(1, b.h)), ZOOM_MIN, 1);
      view.panX = cssW / 2 - (b.x + b.w / 2) * view.zoom;
      view.panY = cssH / 2 - (b.y + b.h / 2) * view.zoom;
    }
    q('[data-zoom]').textContent = `${Math.round(view.zoom * 100)}%`;
    render();
  }

  // ---------- drawing ----------
  function render() {
    if (frame || dead) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawScene(ctx, {
        scale: view.zoom * dpr, offsetX: view.panX * dpr, offsetY: view.panY * dpr,
        width: canvas.width, height: canvas.height,
        grid: scene.showGrid, chrome: true,
      });
      q('[data-empty]').hidden = scene.items.length > 0;
    });
  }

  /** Draws the scene with world → pixel transform (scale, offset). Shared by the view and the PNG export. */
  function drawScene(c, { scale, offsetX, offsetY, width, height, grid, chrome }) {
    if (scene.background === 'colour') {
      c.fillStyle = scene.bgColour;
      c.fillRect(0, 0, width, height);
    }
    c.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    if (grid && scene.tile * scale >= 6) drawGrid(c, scale, offsetX, offsetY, width, height, chrome);
    if (chrome && hoverTile) drawTile(c, hoverTile.x, hoverTile.y, scale, 'rgba(199,162,101,0.28)');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    for (const item of drawOrder(scene.items, scene.autoDepth)) {
      const object = objects.get(item.objectId);
      if (!object) continue;
      const r = itemRect(item, object);
      if (item.flip) {
        c.save();
        c.translate(r.x + r.w, r.y);
        c.scale(-1, 1);
        c.drawImage(object.bitmap, 0, 0, r.w, r.h);
        c.restore();
      } else {
        c.drawImage(object.bitmap, r.x, r.y, r.w, r.h);
      }
    }
    const sel = chrome && selectedItem();
    const selObject = sel && objects.get(sel.objectId);
    if (selObject) {
      const r = itemRect(sel, selObject);
      c.lineWidth = 1.5 / scale;
      c.setLineDash([6 / scale, 4 / scale]);
      c.strokeStyle = '#e8c88c';
      c.strokeRect(r.x, r.y, r.w, r.h);
      c.setLineDash([]);
      c.fillStyle = '#ffcf6b';
      c.strokeStyle = '#1a1408';
      c.beginPath();
      c.arc(sel.x, sel.y, 4.5 / scale, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  function drawGrid(c, scale, offsetX, offsetY, width, height, chrome) {
    const tile = scene.tile;
    const corners = [[0, 0], [width, 0], [0, height], [width, height]]
      .map(([px, py]) => gridFromWorld((px - offsetX) / scale, (py - offsetY) / scale, tile));
    const gxMin = Math.floor(Math.min(...corners.map((p) => p.gx))) - 1;
    const gxMax = Math.ceil(Math.max(...corners.map((p) => p.gx))) + 1;
    const gyMin = Math.floor(Math.min(...corners.map((p) => p.gy))) - 1;
    const gyMax = Math.ceil(Math.max(...corners.map((p) => p.gy))) + 1;
    if ((gxMax - gxMin) + (gyMax - gyMin) > 4000) return;
    c.lineWidth = 1 / scale;
    c.strokeStyle = chrome ? 'rgba(199,162,101,0.16)' : 'rgba(199,162,101,0.35)';
    c.beginPath();
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const a = worldFromGrid(gx, gyMin, tile), b = worldFromGrid(gx, gyMax, tile);
      c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
    }
    for (let gy = gyMin; gy <= gyMax; gy++) {
      const a = worldFromGrid(gxMin, gy, tile), b = worldFromGrid(gxMax, gy, tile);
      c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
    }
    c.stroke();
  }

  /** Fills the tile whose centre is (x, y). */
  function drawTile(c, x, y, scale, fill) {
    const hw = scene.tile / 2, hh = scene.tile / 4;
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(x, y - hh); c.lineTo(x + hw, y); c.lineTo(x, y + hh); c.lineTo(x - hw, y);
    c.closePath();
    c.fill();
  }

  // ---------- scene edits ----------
  const snapshot = () => JSON.stringify(scene.items);
  function pushHistory() {
    undo.push(snapshot());
    if (undo.length > HISTORY_LIMIT) undo.shift();
    redo.length = 0;
  }
  function restore(from, to) {
    if (!from.length) return;
    to.push(snapshot());
    scene.items = JSON.parse(from.pop()).filter((i) => objects.has(i.objectId));
    if (!selectedItem()) selected = null;
    changed();
  }
  function changed() {
    syncInspector();
    q('[data-scene-info]').textContent = `${scene.items.length} object${scene.items.length === 1 ? '' : 's'}`;
    render();
    // Never save before the stored scene has loaded, or it would be overwritten.
    if (!loaded) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveScene(serialisable()).catch((e) => console.error('[IsoScene] save', e)), 400);
  }
  const serialisable = () => ({ ...scene, items: scene.items.map((i) => ({ ...i })) });

  const snapPoint = (x, y) => (scene.snap === 'off' ? { x, y } : snapWorld(x, y, scene.tile, scene.snap));

  function place(objectId, x, y) {
    if (!objects.has(objectId)) return null;
    pushHistory();
    const p = snapPoint(x, y);
    const item = { uid: uid(), objectId, x: p.x, y: p.y, scale: 1, flip: false, layer: 0 };
    scene.items.push(item);
    selected = item.uid;
    changed();
    return item;
  }
  function placeAtCentre(objectId) {
    const c = toWorld(cssW / 2, cssH / 2);
    // Each click lands one tile further along so a run of clicks doesn't stack.
    const n = scene.items.filter((i) => i.objectId === objectId).length % 6;
    const p = stepOnGrid(c.x, c.y, scene.tile, n, 0);
    place(objectId, p.x, p.y);
  }
  function editSelected(mutate) {
    const item = selectedItem();
    if (!item) return;
    pushHistory();
    mutate(item);
    changed();
  }
  function duplicateSelected() {
    const item = selectedItem();
    if (!item) return;
    pushHistory();
    const p = stepOnGrid(item.x, item.y, scene.tile, 1, 0);
    const copy = { ...item, uid: uid(), x: p.x, y: p.y };
    scene.items.push(copy);
    selected = copy.uid;
    changed();
  }
  function removeSelected() {
    if (!selectedItem()) return;
    pushHistory();
    scene.items = scene.items.filter((i) => i.uid !== selected);
    selected = null;
    changed();
  }
  function reorderSelected(delta) {
    const index = scene.items.findIndex((i) => i.uid === selected);
    const to = clamp(index + delta, 0, scene.items.length - 1);
    if (index < 0 || to === index) return;
    pushHistory();
    const [item] = scene.items.splice(index, 1);
    scene.items.splice(to, 0, item);
    changed();
  }

  function hitTest(wx, wy) {
    const ordered = drawOrder(scene.items, scene.autoDepth);
    for (let i = ordered.length - 1; i >= 0; i--) {
      const item = ordered[i], object = objects.get(item.objectId);
      if (!object) continue;
      const px = pixelAt(item, object, wx, wy);
      if (px && object.alpha[px.py * object.width + px.px] > ALPHA_HIT) return item;
    }
    return null;
  }

  // ---------- inspector ----------
  function syncInspector() {
    const item = selectedItem();
    q('[data-inspector]').hidden = !item;
    q('[data-order-row]').hidden = scene.autoDepth;
    if (!item) return;
    const object = objects.get(item.objectId);
    q('[data-sel-name]').textContent = object?.name ?? '';
    q('[data-scale]').value = String(Math.round(item.scale * 100));
    q('[data-scale-value]').textContent = `${Math.round(item.scale * 100)}%`;
    q('[data-layer]').textContent = String(item.layer);
    q('[data-flip]').setAttribute('aria-pressed', String(item.flip));
    if (object) {
      q('[data-ax]').value = String(object.anchorX * 100);
      q('[data-ay]').value = String(object.anchorY * 100);
      q('[data-ax-value]').textContent = `${(object.anchorX * 100).toFixed(1)}%`;
      q('[data-ay-value]').textContent = `${(object.anchorY * 100).toFixed(1)}%`;
    }
  }
  function syncSettings() {
    q('[data-tile]').value = String(scene.tile);
    q('[data-snap]').value = scene.snap;
    q('[data-grid]').checked = scene.showGrid;
    q('[data-depth]').checked = scene.autoDepth;
    q('[data-bg]').value = scene.background;
    q('[data-bg-colour]').value = scene.bgColour;
    q('[data-bg-colour-field]').hidden = scene.background !== 'colour';
    stage.classList.toggle('has-colour', scene.background === 'colour');
  }

  // ---------- bank ----------
  async function hydrate(record) {
    const bitmap = await createImageBitmap(record.blob);
    const alpha = alphaOf(bitmap);
    const entry = { ...record, bitmap, alpha, url: URL.createObjectURL(record.blob) };
    objects.set(record.id, entry);
    return entry;
  }
  function alphaOf(bitmap) {
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bitmap, 0, 0);
    const rgba = g.getImageData(0, 0, c.width, c.height).data;
    const alpha = new Uint8Array(c.width * c.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    return alpha;
  }

  async function importFiles(files) {
    const list = [...files].filter((f) => /^image\/(png|webp)$/.test(f.type) || /\.(png|webp)$/i.test(f.name));
    if (!list.length) { notice('Choose PNG or WebP images with transparent backgrounds.', true); return []; }
    const added = [], skipped = [];
    for (const file of list) {
      if (objects.size >= MAX_OBJECTS) { skipped.push(`${file.name} (bank is full at ${MAX_OBJECTS})`); continue; }
      if (file.size > MAX_FILE_BYTES) { skipped.push(`${file.name} (over 30 MB)`); continue; }
      let bitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        skipped.push(`${file.name} (could not read)`); continue;
      }
      if (bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE) {
        bitmap.close(); skipped.push(`${file.name} (over ${MAX_SIDE} px)`); continue;
      }
      const alpha = alphaOf(bitmap);
      const record = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'object',
        blob: file, width: bitmap.width, height: bitmap.height,
        ...anchorFromAlpha(alpha, bitmap.width, bitmap.height),
        added: Date.now(),
      };
      try {
        await putObject(record);
      } catch (error) {
        bitmap.close(); skipped.push(`${file.name} (browser storage refused it)`); console.error('[IsoScene] store', error); continue;
      }
      objects.set(record.id, { ...record, bitmap, alpha, url: URL.createObjectURL(file) });
      added.push(record.id);
    }
    renderBank();
    if (dead) return added;
    const parts = [];
    if (added.length) parts.push(`Added ${added.length} object${added.length === 1 ? '' : 's'} to your bank.`);
    if (skipped.length) parts.push(`Skipped: ${skipped.join(', ')}.`);
    notice(parts.join(' '), !added.length);
    return added;
  }

  function renderBank() {
    const term = q('[data-search]').value.trim().toLowerCase();
    const all = [...objects.values()].sort((a, b) => b.added - a.added);
    const shown = term ? all.filter((o) => o.name.toLowerCase().includes(term)) : all;
    q('[data-count]').textContent = `${objects.size} / ${MAX_OBJECTS}`;
    q('[data-bank]').innerHTML = shown.length
      ? shown.map((o) => `<div class="isb-obj" draggable="true" data-id="${o.id}" title="${esc(o.name)} · ${o.width}×${o.height}">
          <button class="isb-obj-place" data-place="${o.id}" aria-label="Place ${esc(o.name)}"><img src="${o.url}" alt="" draggable="false"></button>
          <span>${esc(o.name)}</span>
          <button class="isb-obj-remove" data-remove="${o.id}" aria-label="Remove ${esc(o.name)} from bank">×</button>
        </div>`).join('')
      : `<p class="isb-bank-empty">${objects.size ? 'No objects match.' : 'Your bank is empty. Add some isometric PNGs.'}</p>`;
  }

  async function removeFromBank(id, button) {
    const used = scene.items.filter((i) => i.objectId === id).length;
    if (used && button.dataset.armed !== '1') {
      button.dataset.armed = '1';
      button.textContent = `In scene ${used}× · remove?`;
      button.classList.add('is-armed');
      setTimeout(() => { if (button.isConnected) { button.dataset.armed = ''; button.textContent = '×'; button.classList.remove('is-armed'); } }, 3000);
      return;
    }
    try {
      await deleteObject(id);
    } catch (error) {
      notice('Could not remove it from browser storage.', true); console.error('[IsoScene] delete', error); return;
    }
    const object = objects.get(id);
    if (used) {
      pushHistory();
      scene.items = scene.items.filter((i) => i.objectId !== id);
      // Undo can't bring back a deleted bank object, so drop it from history too.
      for (const stack of [undo, redo]) {
        for (let i = 0; i < stack.length; i++) stack[i] = JSON.stringify(JSON.parse(stack[i]).filter((it) => it.objectId !== id));
      }
      if (!selectedItem()) selected = null;
    }
    objects.delete(id);
    if (object) { URL.revokeObjectURL(object.url); object.bitmap.close(); }
    renderBank();
    changed();
    notice(`Removed ${object?.name ?? 'object'} from your bank.`);
  }

  // ---------- export ----------
  function exportCanvas() {
    const b = sceneBounds(scene.items, objects);
    if (!b) { notice('Place some objects first.', true); return null; }
    let k = Number(q('[data-export-scale]').value) || 1;
    const pad = 2;
    const longest = Math.max(b.w, b.h) + pad * 2;
    if (longest * k > MAX_EXPORT_SIDE) k = MAX_EXPORT_SIDE / longest;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((b.w + pad * 2) * k));
    c.height = Math.max(1, Math.ceil((b.h + pad * 2) * k));
    drawScene(c.getContext('2d'), {
      scale: k, offsetX: (pad - b.x) * k, offsetY: (pad - b.y) * k,
      width: c.width, height: c.height,
      grid: q('[data-export-grid]').checked, chrome: false,
    });
    return { canvas: c, k };
  }
  const toBlob = (c) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode the PNG.'))), 'image/png'));
  function save(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const layoutBlob = () => new Blob([JSON.stringify(layoutJson(scene, objects), null, 2)], { type: 'application/json' });

  async function exportPng() {
    const out = exportCanvas();
    if (!out) return;
    save(await toBlob(out.canvas), 'iso-scene.png');
    notice(`Exported a ${out.canvas.width} × ${out.canvas.height} PNG${out.k < Number(q('[data-export-scale]').value) ? ` (scaled down to fit ${MAX_EXPORT_SIDE} px)` : ''}.`);
  }
  async function exportZip() {
    const out = exportCanvas();
    if (!out) return;
    const zip = new JSZip();
    zip.file('iso-scene.png', await toBlob(out.canvas));
    zip.file('layout.json', layoutBlob());
    const used = new Set(scene.items.map((i) => i.objectId));
    const names = new Set();
    for (const id of used) {
      const object = objects.get(id);
      if (!object) continue;
      const base = object.name.replace(/[^a-z0-9_-]+/gi, '-') || 'object';
      let name = base, n = 2;
      while (names.has(name)) name = `${base}-${n++}`;
      names.add(name);
      zip.file(`objects/${name}.${object.blob.type === 'image/webp' ? 'webp' : 'png'}`, object.blob);
    }
    save(await zip.generateAsync({ type: 'blob' }), 'iso-scene.zip');
    notice(`Exported the scene ZIP with ${used.size} object image${used.size === 1 ? '' : 's'}.`);
  }

  // ---------- pointer ----------
  const onPointerDown = (e) => {
    stage.focus({ preventScroll: true });
    const { sx, sy } = eventPoint(e);
    const w = toWorld(sx, sy);
    const hit = e.button === 0 && !spaceDown ? hitTest(w.x, w.y) : null;
    canvas.setPointerCapture(e.pointerId);
    if (hit) {
      let item = hit;
      if (e.altKey) {
        pushHistory();
        item = { ...hit, uid: uid() };
        scene.items.push(item);
        drag = { mode: 'move', item, dx: w.x - item.x, dy: w.y - item.y, moved: true, recorded: true };
      } else {
        drag = { mode: 'move', item, dx: w.x - item.x, dy: w.y - item.y, startX: item.x, startY: item.y, moved: false, recorded: false };
      }
      selected = item.uid;
      syncInspector();
      render();
    } else {
      drag = { mode: 'pan', sx, sy, panX: view.panX, panY: view.panY, moved: false };
      stage.classList.add('is-panning');
    }
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const { sx, sy } = eventPoint(e);
    if (drag.mode === 'pan') {
      view.panX = drag.panX + sx - drag.sx;
      view.panY = drag.panY + sy - drag.sy;
      if (Math.abs(sx - drag.sx) + Math.abs(sy - drag.sy) > 3) drag.moved = true;
      render();
      return;
    }
    const w = toWorld(sx, sy);
    const p = snapPoint(w.x - drag.dx, w.y - drag.dy);
    if (p.x === drag.item.x && p.y === drag.item.y) return;
    if (!drag.recorded) { pushHistory(); drag.recorded = true; }
    drag.item.x = p.x; drag.item.y = p.y; drag.moved = true;
    render();
  };
  const onPointerUp = () => {
    if (!drag) return;
    if (drag.mode === 'pan' && !drag.moved && selected) { selected = null; syncInspector(); render(); }
    if (drag.mode === 'move' && drag.moved) changed();
    stage.classList.remove('is-panning');
    drag = null;
  };
  const onWheel = (e) => {
    e.preventDefault();
    const { sx, sy } = eventPoint(e);
    zoomAt(sx, sy, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
  };

  // ---------- drag from bank / drop files ----------
  const onDragOver = (e) => {
    const types = [...e.dataTransfer.types];
    if (!types.includes(DRAG_TYPE) && !types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const { sx, sy } = eventPoint(e);
    const w = toWorld(sx, sy);
    hoverTile = scene.snap === 'off' ? null : snapWorld(w.x, w.y, scene.tile, 'centre');
    render();
  };
  const onDragLeave = () => { hoverTile = null; render(); };
  const onDrop = async (e) => {
    e.preventDefault();
    hoverTile = null;
    const { sx, sy } = eventPoint(e);
    const w = toWorld(sx, sy);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    if (id) { place(id, w.x, w.y); return; }
    if (e.dataTransfer.files?.length) {
      const added = await importFiles(e.dataTransfer.files);
      added.forEach((objectId, n) => { const p = stepOnGrid(w.x, w.y, scene.tile, n, 0); place(objectId, p.x, p.y); });
    }
    render();
  };

  // ---------- keyboard ----------
  const onKeyDown = (e) => {
    if (!page.isConnected) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (!page.contains(document.activeElement) && document.activeElement !== document.body) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { spaceDown = true; if (document.activeElement === stage) e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? restore(redo, undo) : restore(undo, redo); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(redo, undo); return; }
    const item = selectedItem();
    if (!item) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
    if (e.key === 'Escape') { selected = null; syncInspector(); render(); return; }
    if (e.key.toLowerCase() === 'f' && !mod) { editSelected((i) => { i.flip = !i.flip; }); return; }
    if (e.key === '[' || e.key === ']') { editSelected((i) => { i.layer = clamp(i.layer + (e.key === ']' ? 1 : -1), LAYER_MIN, LAYER_MAX); }); return; }
    if (e.key === '+' || e.key === '=' || e.key === '-') { editSelected((i) => { i.scale = clamp(i.scale * (e.key === '-' ? 1 / 1.1 : 1.1), SCALE_MIN, SCALE_MAX); }); return; }
    const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      editSelected((i) => {
        if (scene.snap === 'off') {
          const step = e.shiftKey ? 10 : 1;
          i.x += dx * step; i.y += dy * step;
        } else {
          // Step to the next tile centre straight up/down/left/right on screen.
          const p = stepOnGrid(i.x, i.y, scene.tile, dx + dy, dy - dx);
          i.x = p.x; i.y = p.y;
        }
      });
    }
  };
  const onKeyUp = (e) => { if (e.code === 'Space') spaceDown = false; };

  // ---------- wire up ----------
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('dragover', onDragOver);
  stage.addEventListener('dragleave', onDragLeave);
  stage.addEventListener('drop', onDrop);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  q('[data-zoom-in]').onclick = () => zoomAt(cssW / 2, cssH / 2, 1.25);
  q('[data-zoom-out]').onclick = () => zoomAt(cssW / 2, cssH / 2, 0.8);
  q('[data-fit]').onclick = fitView;

  q('[data-add]').onclick = () => q('[data-file]').click();
  q('[data-file]').onchange = async (e) => { await importFiles(e.target.files); e.target.value = ''; };
  const bankPanel = q('.isb-bank');
  bankPanel.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); bankPanel.classList.add('is-drop'); } });
  bankPanel.addEventListener('dragleave', () => bankPanel.classList.remove('is-drop'));
  bankPanel.addEventListener('drop', (e) => { e.preventDefault(); bankPanel.classList.remove('is-drop'); if (e.dataTransfer.files?.length) importFiles(e.dataTransfer.files); });
  q('[data-search]').oninput = renderBank;
  q('[data-bank]').addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove]');
    if (remove) { removeFromBank(remove.dataset.remove, remove); return; }
    const placeBtn = e.target.closest('[data-place]');
    if (placeBtn) placeAtCentre(placeBtn.dataset.place);
  });
  q('[data-bank]').addEventListener('dragstart', (e) => {
    const tile = e.target.closest('.isb-obj');
    if (!tile) return;
    e.dataTransfer.setData(DRAG_TYPE, tile.dataset.id);
    e.dataTransfer.effectAllowed = 'copy';
    const img = tile.querySelector('img');
    if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height * 0.9);
  });

  q('[data-scale]').addEventListener('pointerdown', () => { if (selectedItem()) pushHistory(); });
  q('[data-scale]').addEventListener('keydown', () => { if (selectedItem()) pushHistory(); });
  q('[data-scale]').oninput = () => {
    const item = selectedItem();
    if (!item) return;
    item.scale = clamp(Number(q('[data-scale]').value) / 100, SCALE_MIN, SCALE_MAX);
    q('[data-scale-value]').textContent = `${Math.round(item.scale * 100)}%`;
    render();
  };
  q('[data-scale]').onchange = changed;
  q('[data-flip]').onclick = () => editSelected((i) => { i.flip = !i.flip; });
  q('[data-dup]').onclick = duplicateSelected;
  q('[data-delete]').onclick = removeSelected;
  q('[data-layer-up]').onclick = () => editSelected((i) => { i.layer = clamp(i.layer + 1, LAYER_MIN, LAYER_MAX); });
  q('[data-layer-down]').onclick = () => editSelected((i) => { i.layer = clamp(i.layer - 1, LAYER_MIN, LAYER_MAX); });
  q('[data-front]').onclick = () => reorderSelected(1);
  q('[data-back]').onclick = () => reorderSelected(-1);

  const saveAnchor = (object) => {
    const { bitmap, alpha, url, ...record } = object;
    putObject(record).catch((e) => console.error('[IsoScene] anchor', e));
  };
  const onAnchor = () => {
    const object = objects.get(selectedItem()?.objectId);
    if (!object) return;
    object.anchorX = Number(q('[data-ax]').value) / 100;
    object.anchorY = Number(q('[data-ay]').value) / 100;
    syncInspector();
    render();
  };
  q('[data-ax]').oninput = onAnchor;
  q('[data-ay]').oninput = onAnchor;
  q('[data-ax]').onchange = q('[data-ay]').onchange = () => { const o = objects.get(selectedItem()?.objectId); if (o) saveAnchor(o); };
  q('[data-anchor-auto]').onclick = () => {
    const object = objects.get(selectedItem()?.objectId);
    if (!object) return;
    Object.assign(object, anchorFromAlpha(object.alpha, object.width, object.height));
    saveAnchor(object);
    syncInspector();
    render();
  };

  q('[data-tile]').onchange = () => { scene.tile = Number(q('[data-tile]').value); changed(); };
  q('[data-snap]').onchange = () => { scene.snap = q('[data-snap]').value; changed(); };
  q('[data-grid]').onchange = () => { scene.showGrid = q('[data-grid]').checked; changed(); };
  q('[data-depth]').onchange = () => { scene.autoDepth = q('[data-depth]').checked; changed(); };
  q('[data-bg]').onchange = () => { scene.background = q('[data-bg]').value; syncSettings(); changed(); };
  q('[data-bg-colour]').oninput = () => { scene.bgColour = q('[data-bg-colour]').value; changed(); };

  q('[data-export-png]').onclick = () => exportPng().catch((e) => notice(e.message, true));
  q('[data-export-json]').onclick = () => {
    if (!scene.items.length) { notice('Place some objects first.', true); return; }
    save(layoutBlob(), 'layout.json');
    notice(`Exported layout.json with ${scene.items.length} object${scene.items.length === 1 ? '' : 's'}.`);
  };
  q('[data-export-zip]').onclick = () => exportZip().catch((e) => notice(e.message, true));
  q('[data-clear]').onclick = () => {
    if (!scene.items.length) return;
    const button = q('[data-clear]');
    if (!clearArmed) {
      button.textContent = 'Click again to clear';
      clearArmed = setTimeout(() => { clearArmed = 0; button.textContent = 'Clear scene'; }, 3000);
      return;
    }
    clearTimeout(clearArmed); clearArmed = 0; button.textContent = 'Clear scene';
    pushHistory();
    scene.items = [];
    selected = null;
    changed();
    notice('Scene cleared. Ctrl+Z brings it back.');
  };

  // ---------- load ----------
  (async () => {
    try {
      const records = await listObjects();
      const results = await Promise.allSettled(records.map(hydrate));
      if (dead) return;
      const broken = results.filter((r) => r.status === 'rejected').length;
      const saved = await loadScene();
      if (dead) return;
      if (saved) {
        scene = { ...scene, ...saved, items: (saved.items ?? []).filter((i) => objects.has(i.objectId)) };
        if (!TILE_SIZES.includes(scene.tile)) scene.tile = 64;
      }
      loaded = true;
      syncSettings();
      renderBank();
      changed();
      fitView();
      notice(objects.size
        ? `${objects.size} object${objects.size === 1 ? '' : 's'} in your bank${broken ? ` (${broken} could not be read)` : ''}. Drag them onto the grid.`
        : 'Add your isometric PNGs to start a bank. They stay in this browser, nothing is uploaded.');
    } catch (error) {
      console.error('[IsoScene] load', error);
      syncSettings();
      renderBank();
      notice('This browser blocked local storage (private window?), so the bank won’t be kept after you leave.', true);
    }
  })();

  return () => {
    dead = true;
    cancelAnimationFrame(frame);
    clearTimeout(saveTimer);
    clearTimeout(clearArmed);
    if (loaded) saveScene(serialisable()).catch(() => {});
    observer.disconnect();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    for (const object of objects.values()) { URL.revokeObjectURL(object.url); object.bitmap.close(); }
    objects.clear();
    page.remove();
  };
}
