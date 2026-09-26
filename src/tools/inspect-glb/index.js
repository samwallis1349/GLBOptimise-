import stylesUrl from './inspect-glb.css?url';
import { InspectGLBPage } from './InspectGLBPage.js';
import { TABS } from './config.js';
import {
  allNodeIndices, esc, findNode, fmtBytes, renderAnimations, renderIssues, renderJson, renderMaterials,
  renderMeshes, renderOverview, renderScene, renderSkins, renderStrip, renderTextures,
} from './render.js';
import { analyseAsset, collectAssets } from '../../shared/glb/analyseGLB.js';
import { Viewer } from '../../shared/viewer/Viewer.js';
import { loadModel } from '../../shared/viewer/loadModel.js';
import { navigate } from '../../app/router.js';
import { downloadBlob } from '../../shared/utils/download.js';

/**
 * Inspect GLB — single-asset deep inspector. Analysis comes from the shared
 * engine (src/shared/glb/analyseGLB.js); preview from the shared Viewer.
 */

let el = {};
let state = null;

function freshState() {
  return {
    analysis: null,
    asset: null,
    tab: 'overview',
    thumbs: new Map(), // texture index -> object URL
    jsonText: '',
    selectedNode: null,
    collapsed: new Set(),
    highlight: null,
    meshSort: { key: 'triangleCount', dir: 'desc' },
    expandedMeshes: new Set(),
    expandedClips: new Set(),
    playingClip: null,
    viewer: null,
    loadToken: 0,
  };
}

export function mount(container) {
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = stylesUrl;
  document.head.appendChild(styleLink);

  state = freshState();
  container.innerHTML = '';
  container.appendChild(InspectGLBPage());
  cacheElements();
  wireEvents();

  return () => {
    state.loadToken++;
    state.viewer?.dispose();
    revokeThumbs();
    state = null;
    styleLink.remove();
  };
}

function cacheElements() {
  const id = (name) => document.getElementById(`ig-${name}`);
  el = {
    drop: id('drop'), file: id('file'), notice: id('notice'), loading: id('loading'), loadingText: id('loading-text'),
    workspace: id('workspace'), fileName: id('file-name'), fileMeta: id('file-meta'), another: id('another'),
    strip: id('strip'), stage: id('stage'), stageBusy: id('stage-busy'), grid: id('grid'), reset: id('reset'),
    clearHl: id('clear-hl'), anim: id('anim'), clip: id('clip'), play: id('play'), panel: id('panel'),
  };
}

// ---------------------------------------------------------------- loading

async function openFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const token = ++state.loadToken;
  hideNotice();
  el.loading.hidden = false;
  el.loadingText.textContent = 'Reading file…';

  try {
    const assets = await collectAssets(files);
    if (!assets.length) throw new Error('No .glb or .gltf file found. Drop a GLB, a glTF with its .bin and textures, or a .zip of them.');
    const asset = assets[0];
    el.loadingText.textContent = `Analysing ${asset.name}…`;
    const analysis = await analyseAsset(asset);
    if (token !== state.loadToken) return;

    revokeThumbs();
    Object.assign(state, {
      analysis, asset, selectedNode: null, highlight: null, collapsed: new Set(),
      expandedMeshes: new Set(), expandedClips: new Set(), playingClip: null,
      jsonText: JSON.stringify(analysis.rawJson, null, 2),
    });
    state.thumbs = await buildThumbnails(asset, analysis);
    if (token !== state.loadToken) return;

    const notes = [];
    if (assets.length > 1) notes.push(`${assets.length} models were dropped — showing ${asset.name}. Inspect GLB opens one asset at a time (Asset Report handles batches).`);
    if (analysis.file.missingResources.length) notes.push(`Missing files: ${analysis.file.missingResources.join(', ')}. Textures that reference them will be blank.`);
    if (notes.length) showNotice(notes.join(' '));

    el.drop.hidden = true;
    el.workspace.hidden = false;
    el.fileName.textContent = asset.name;
    el.fileMeta.textContent = `${fmtBytes(analysis.file.bytes)} · ${analysis.file.kind.toUpperCase()}${analysis.file.generator ? ` · ${analysis.file.generator}` : ''}`;
    el.strip.innerHTML = renderStrip(analysis);
    updateTabCounts();
    renderTab();
    await loadPreview(asset, token);
  } catch (err) {
    console.error('[InspectGLB]', err);
    if (token === state?.loadToken) showNotice(friendlyError(err), true);
  } finally {
    if (token === state?.loadToken) el.loading.hidden = true;
  }
}

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (/ktx|basis/i.test(msg)) return 'This file uses KTX2/Basis textures that couldn’t be decoded for preview. The analysis may still be incomplete.';
  if (/draco/i.test(msg)) return 'This file uses Draco compression and the decoder failed to load. Check your connection and try again.';
  if (/meshopt/i.test(msg)) return 'This file uses Meshopt compression and the decoder failed to load. Try again.';
  if (/Unexpected token|JSON/i.test(msg)) return 'The file’s JSON couldn’t be parsed — it may be corrupt or not a glTF file.';
  return msg || 'That file couldn’t be read.';
}

async function loadPreview(asset, token) {
  el.stageBusy.hidden = false;
  el.stageBusy.textContent = 'Loading preview…';
  try {
    if (!state.viewer) {
      state.viewer = new Viewer(el.stage);
      state.viewer.setGridVisible(el.grid.getAttribute('aria-pressed') === 'true');
    }
    const { scene, animations, meshObjects } = await loadModel(asset);
    if (token !== state.loadToken) return;
    state.viewer.setModel(scene, animations, meshObjects);
    const mode = el.stage.closest('.ig-card').querySelector('[data-view][aria-pressed="true"]')?.dataset.view || 'shaded';
    state.viewer.setViewMode(mode);
    el.anim.hidden = animations.length === 0;
    el.clip.innerHTML = animations.map((c, i) => `<option value="${i}">${esc(c.name || `Clip ${i}`)}</option>`).join('');
    syncPlayButton();
    el.stageBusy.hidden = true;
  } catch (err) {
    console.error('[InspectGLB] preview', err);
    el.stageBusy.textContent = `Preview unavailable: ${friendlyError(err)}`;
  }
}

/**
 * Thumbnails straight from the stored image bytes — no second decode of the
 * geometry. In glTF-Transform each json.images entry becomes one Texture in
 * the same order, so image index === analysis texture index.
 */
async function buildThumbnails(asset, analysis) {
  const thumbs = new Map();
  const images = analysis.rawJson.images || [];
  let bin = null;
  if (asset.kind === 'glb') bin = await readGlbBinChunk(asset.main);
  const siblings = new Map(asset.siblings.map((f) => [f.name.toLowerCase(), f]));
  const views = analysis.rawJson.bufferViews || [];

  images.forEach((img, i) => {
    const tex = analysis.textures[i];
    const mime = img.mimeType || tex?.mimeType || '';
    if (/ktx2/i.test(mime) || /\.ktx2$/i.test(img.uri || '')) return;
    let blob = null;
    if (img.bufferView != null && bin) {
      const view = views[img.bufferView];
      if (view && !view.extensions?.EXT_meshopt_compression) {
        blob = new Blob([bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)], { type: mime || 'image/png' });
      }
    } else if (img.uri?.startsWith('data:')) {
      thumbs.set(i, img.uri);
      return;
    } else if (img.uri) {
      let name = img.uri.split(/[\\/]/).pop();
      try {
        name = decodeURIComponent(name);
      } catch {
        /* keep raw */
      }
      blob = siblings.get(name.toLowerCase()) || null;
    }
    if (blob) thumbs.set(i, URL.createObjectURL(blob));
  });
  return thumbs;
}

async function readGlbBinChunk(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x004e4942) return new Uint8Array(buffer, offset + 8, length);
    offset += 8 + length;
  }
  return null;
}

function revokeThumbs() {
  if (!state) return;
  for (const url of state.thumbs.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  state.thumbs = new Map();
}

// ---------------------------------------------------------------- rendering

function updateTabCounts() {
  const a = state.analysis;
  const counts = {
    meshes: a.meshes.length, materials: a.materials.length, textures: a.textures.length,
    animations: a.animations.length, skins: a.skins.length, issues: a.issues.length,
  };
  document.querySelectorAll('.ig-tab__count').forEach((span) => {
    const n = counts[span.dataset.count];
    span.textContent = n ? String(n) : '';
    span.className = `ig-tab__count${span.dataset.count === 'issues' && a.health.counts.error ? ' is-error' : ''}`;
  });
}

function renderTab() {
  const a = state.analysis;
  if (!a) return;
  document.querySelectorAll('.ig-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === state.tab)));
  const renderers = {
    overview: () => renderOverview(a),
    scene: () => renderScene(a, state),
    meshes: () => renderMeshes(a, state),
    materials: () => renderMaterials(a),
    textures: () => renderTextures(a, state.thumbs),
    animations: () => renderAnimations(a, state),
    skins: () => renderSkins(a),
    issues: () => renderIssues(a),
    json: () => renderJson(state.jsonText),
  };
  el.panel.innerHTML = renderers[state.tab]();
}

function setTab(tab) {
  if (!TABS.some((t) => t.id === tab)) return;
  state.tab = tab;
  renderTab();
}

function setHighlight(meshIndex, focus = false) {
  state.highlight = meshIndex;
  state.viewer?.highlightMesh(meshIndex);
  if (focus && meshIndex != null) state.viewer?.focusMesh(meshIndex);
  el.clearHl.hidden = meshIndex == null;
}

function syncPlayButton() {
  const playing = state.playingClip != null;
  el.play.textContent = playing ? 'Stop' : 'Play';
  el.play.classList.toggle('is-on', playing);
  if (playing) el.clip.value = String(state.playingClip);
}

function playClip(index) {
  if (!state.viewer) return;
  if (index == null || state.playingClip === index) {
    state.viewer.stopClip();
    state.playingClip = null;
  } else {
    state.viewer.playClip(index);
    state.playingClip = index;
  }
  syncPlayButton();
  if (state.tab === 'animations') renderTab();
}

// ---------------------------------------------------------------- events

function wireEvents() {
  const pick = () => el.file.click();
  el.drop.addEventListener('click', pick);
  el.another.addEventListener('click', pick);
  el.drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  });
  el.file.addEventListener('change', () => {
    openFiles(el.file.files);
    el.file.value = '';
  });
  // The whole page accepts drops once a file is open, so "drop another" just works.
  const page = el.drop.closest('.ig-page');
  page.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.drop.classList.add('is-dragging');
  });
  page.addEventListener('dragleave', (e) => {
    if (!page.contains(e.relatedTarget)) el.drop.classList.remove('is-dragging');
  });
  page.addEventListener('drop', (e) => {
    e.preventDefault();
    el.drop.classList.remove('is-dragging');
    if (e.dataTransfer.files.length) openFiles(e.dataTransfer.files);
  });

  // Viewer toolbar
  document.querySelectorAll('.ig-seg__btn[data-view]').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.ig-seg__btn[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    state.viewer?.setViewMode(btn.dataset.view);
  }));
  el.grid.addEventListener('click', () => {
    const on = el.grid.getAttribute('aria-pressed') !== 'true';
    el.grid.setAttribute('aria-pressed', String(on));
    state.viewer?.setGridVisible(on);
  });
  el.reset.addEventListener('click', () => state.viewer?.resetCamera());
  el.clearHl.addEventListener('click', () => {
    setHighlight(null);
    if (state.tab === 'meshes' || state.tab === 'scene') renderTab();
  });
  el.play.addEventListener('click', () => playClip(state.playingClip != null ? null : Number(el.clip.value)));
  el.clip.addEventListener('change', () => {
    if (state.playingClip != null) {
      state.playingClip = null;
      playClip(Number(el.clip.value));
    }
  });

  // Tabs
  document.querySelector('.ig-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) setTab(tab.dataset.tab);
  });

  // Panel (delegated — its contents are re-rendered)
  el.panel.addEventListener('click', onPanelClick);
  el.panel.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.ig-mesh-row');
    if (row && state.highlight == null) state.viewer?.highlightMesh(Number(row.dataset.mesh));
  });
  el.panel.addEventListener('mouseout', (e) => {
    const row = e.target.closest('.ig-mesh-row');
    if (row && !row.contains(e.relatedTarget) && state.highlight == null) state.viewer?.highlightMesh(null);
  });
}

function onPanelClick(e) {
  const t = e.target;
  const a = state.analysis;

  const toggle = t.closest('[data-toggle]');
  if (toggle) {
    const i = Number(toggle.dataset.toggle);
    state.collapsed.has(i) ? state.collapsed.delete(i) : state.collapsed.add(i);
    return renderTab();
  }
  const tree = t.closest('[data-tree]');
  if (tree) {
    state.collapsed = tree.dataset.tree === 'collapse' ? new Set(allNodeIndices(a)) : new Set();
    return renderTab();
  }
  const node = t.closest('[data-node]');
  if (node) {
    state.selectedNode = Number(node.dataset.node);
    const n = findNode(a, state.selectedNode);
    setHighlight(n?.mesh ?? null, n?.mesh != null);
    return renderTab();
  }

  const sort = t.closest('[data-sort]');
  if (sort) {
    const key = sort.dataset.sort;
    state.meshSort = { key, dir: state.meshSort.key === key && state.meshSort.dir === 'desc' ? 'asc' : key === 'name' && state.meshSort.key !== key ? 'asc' : 'desc' };
    return renderTab();
  }
  const expandMesh = t.closest('[data-expand-mesh]');
  if (expandMesh) {
    const i = Number(expandMesh.dataset.expandMesh);
    state.expandedMeshes.has(i) ? state.expandedMeshes.delete(i) : state.expandedMeshes.add(i);
    return renderTab();
  }
  const meshRow = t.closest('.ig-mesh-row');
  if (meshRow) {
    const i = Number(meshRow.dataset.mesh);
    setHighlight(state.highlight === i ? null : i, state.highlight !== i);
    return renderTab();
  }

  const gotoTex = t.closest('[data-goto-texture]');
  if (gotoTex) {
    setTab('textures');
    const card = document.getElementById(`ig-tex-${gotoTex.dataset.gotoTexture}`);
    card?.classList.add('is-flash');
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }

  const playBtn = t.closest('[data-play-clip]');
  if (playBtn) return playClip(Number(playBtn.dataset.playClip));
  const expandClip = t.closest('[data-expand-clip]');
  if (expandClip) {
    const i = Number(expandClip.dataset.expandClip);
    state.expandedClips.has(i) ? state.expandedClips.delete(i) : state.expandedClips.add(i);
    return renderTab();
  }

  const fix = t.closest('[data-fix]');
  if (fix) return navigate(`/${fix.dataset.fix}`);

  const json = t.closest('[data-json]');
  if (json) return onJsonAction(json);
}

async function onJsonAction(button) {
  const base = state.asset.name.replace(/\.[^.]+$/, '');
  const action = button.dataset.json;
  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(state.jsonText);
      flash(button, 'Copied!');
    } catch {
      flash(button, 'Copy failed');
    }
  } else if (action === 'download') {
    downloadBlob(new Blob([state.jsonText], { type: 'application/json' }), `${base}.gltf.json`);
  } else if (action === 'analysis') {
    const { rawJson, ...analysis } = state.analysis;
    const withoutHashes = { ...analysis, textures: analysis.textures.map(({ hash, ...t }) => t) };
    downloadBlob(new Blob([JSON.stringify(withoutHashes, null, 2)], { type: 'application/json' }), `${base}-analysis.json`);
  }
}

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function showNotice(message, isError = false) {
  el.notice.textContent = message;
  el.notice.classList.toggle('is-error', isError);
  el.notice.hidden = false;
}

function hideNotice() {
  el.notice.hidden = true;
}
