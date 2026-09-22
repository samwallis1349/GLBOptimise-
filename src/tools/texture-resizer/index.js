import JSZip from 'jszip';
import stylesUrl from './texture-resizer.css?url';
import { TextureResizerPage } from './TextureResizerPage.js';
import { FORMAT_OPTIONS, TEXTURE_RESIZER_CONFIG } from './config.js';

let items = [];
let nextId = 1;
let activeSize = 2048;
let styleLink;
let el = {};

export function mount(container) {
  resetState();
  styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = stylesUrl;
  document.head.appendChild(styleLink);
  container.innerHTML = '';
  container.appendChild(TextureResizerPage());
  cacheElements();
  wireEvents();
  updateUi();
  return () => { revokeAll(); styleLink?.remove(); };
}

function resetState() { revokeAll(); items = []; nextId = 1; activeSize = 2048; }

function cacheElements() {
  const id = (name) => document.getElementById(name);
  el = {
    file: id('tr-file'), drop: id('tr-drop'), choose: id('tr-choose'), workspace: id('tr-workspace'),
    add: id('tr-add'), clear: id('tr-clear'), queue: id('tr-queue'), queueMeta: id('tr-queue-meta'),
    fit: id('tr-fit'), noUpscale: id('tr-no-upscale'), pot: id('tr-pot'), format: id('tr-format'),
    quality: id('tr-quality'), qualityValue: id('tr-quality-value'), qualityField: id('tr-quality-field'),
    suffix: id('tr-suffix'), customSize: id('tr-custom-size'), process: id('tr-process'), processCount: id('tr-process-count'),
    resultsPanel: id('tr-results-panel'), results: id('tr-results'), savings: id('tr-savings'),
    downloadAll: id('tr-download-all'), notice: id('tr-notice'),
  };
}

function wireEvents() {
  const openPicker = (event) => { event?.stopPropagation(); el.file.click(); };
  el.choose.addEventListener('click', openPicker);
  el.add.addEventListener('click', openPicker);
  el.drop.addEventListener('click', openPicker);
  el.drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPicker(event); }
  });
  el.file.addEventListener('change', () => { addFiles([...el.file.files]); el.file.value = ''; });
  for (const type of ['dragenter', 'dragover']) el.drop.addEventListener(type, (event) => {
    event.preventDefault(); el.drop.classList.add('is-dragging');
  });
  for (const type of ['dragleave', 'dragend']) el.drop.addEventListener(type, () => el.drop.classList.remove('is-dragging'));
  el.drop.addEventListener('drop', (event) => {
    event.preventDefault(); el.drop.classList.remove('is-dragging'); addFiles([...event.dataTransfer.files]);
  });

  document.querySelectorAll('.tr-size').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.tr-size').forEach((candidate) => candidate.classList.toggle('is-active', candidate === button));
    activeSize = Number(button.dataset.size);
    el.customSize.value = '';
    el.suffix.value = `_${activeSize >= 1024 ? `${activeSize / 1024}k` : activeSize}`;
    invalidateResults();
  }));
  el.customSize.addEventListener('input', () => {
    const value = Math.round(Number(el.customSize.value));
    if (!Number.isFinite(value) || value < 16 || value > TEXTURE_RESIZER_CONFIG.maxDimension) return;
    activeSize = value;
    document.querySelectorAll('.tr-size').forEach((button) => button.classList.remove('is-active'));
    el.suffix.value = `_${value}px`;
    invalidateResults();
  });
  [el.fit, el.noUpscale, el.pot, el.format, el.quality, el.suffix].forEach((control) => control.addEventListener('input', () => {
    el.qualityValue.value = `${el.quality.value}%`;
    el.qualityField.hidden = el.format.value === 'png';
    invalidateResults();
  }));
  el.clear.addEventListener('click', clearAll);
  el.process.addEventListener('click', processAll);
  el.downloadAll.addEventListener('click', downloadZip);
}

async function addFiles(files) {
  const remaining = TEXTURE_RESIZER_CONFIG.maxFiles - items.length;
  const selected = files.slice(0, Math.max(0, remaining));
  const rejected = [];
  for (const file of selected) {
    if (!TEXTURE_RESIZER_CONFIG.acceptedTypes.includes(file.type)) { rejected.push(`${file.name}: unsupported format`); continue; }
    if (file.size > TEXTURE_RESIZER_CONFIG.maxFileBytes) { rejected.push(`${file.name}: larger than 32 MB`); continue; }
    if (items.some((item) => item.file.name === file.name && item.file.size === file.size)) continue;
    try {
      const dimensions = await readDimensions(file);
      items.push({ id: nextId++, file, ...dimensions, sourceUrl: URL.createObjectURL(file), status: 'queued', output: null });
    } catch { rejected.push(`${file.name}: could not read image`); }
  }
  if (files.length > remaining) rejected.push(`Only the first ${TEXTURE_RESIZER_CONFIG.maxFiles} files were added`);
  if (rejected.length) showNotice(rejected.join(' · '));
  invalidateResults(); renderQueue(); updateUi();
}

function readDimensions(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { resolve({ width: image.naturalWidth, height: image.naturalHeight }); URL.revokeObjectURL(url); };
    image.onerror = () => { reject(new Error('Unreadable image')); URL.revokeObjectURL(url); };
    image.src = url;
  });
}

function renderQueue() {
  el.queue.innerHTML = items.map((item) => `
    <article class="tr-queue-item">
      <img src="${item.sourceUrl}" alt="" loading="lazy">
      <div class="tr-file-copy"><strong title="${escapeAttr(item.file.name)}">${escapeHtml(item.file.name)}</strong><span>${item.width} × ${item.height} · ${formatBytes(item.file.size)}</span></div>
      <span class="tr-status tr-status--${item.status}">${statusLabel(item.status)}</span>
      <button class="tr-remove" type="button" data-remove="${item.id}" aria-label="Remove ${escapeAttr(item.file.name)}">×</button>
    </article>`).join('');
  el.queue.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => removeItem(Number(button.dataset.remove))));
}

function removeItem(id) {
  const item = items.find((candidate) => candidate.id === id);
  revokeItem(item); items = items.filter((candidate) => candidate.id !== id);
  renderQueue(); renderResults(); updateUi();
}

function clearAll() { revokeAll(); items = []; renderQueue(); renderResults(); updateUi(); }

function invalidateResults() {
  for (const item of items) {
    if (item.output?.url) URL.revokeObjectURL(item.output.url);
    item.output = null; item.status = 'queued';
  }
  renderResults(); renderQueue();
}

async function processAll() {
  if (!items.length) return;
  el.process.disabled = true; hideNotice();
  for (const item of items) {
    item.status = 'working'; renderQueue();
    try { item.output = await resizeTexture(item); item.status = 'ready'; }
    catch (error) { item.status = 'error'; console.error('[TextureResizer]', error); }
    renderQueue();
  }
  el.process.disabled = false; renderResults(); updateUi();
}

async function resizeTexture(item) {
  const image = await createImageBitmap(item.file);
  const { width, height } = outputDimensions(item.width, item.height);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  if (el.format.value === 'jpeg') { context.fillStyle = '#000'; context.fillRect(0, 0, width, height); }
  context.drawImage(image, 0, 0, width, height); image.close?.();
  const format = FORMAT_OPTIONS[el.format.value];
  const quality = Number(el.quality.value) / 100;
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Encoding failed')), format.mime, quality));
  return { blob, url: URL.createObjectURL(blob), width, height, name: outputName(item.file.name, format.extension) };
}

function outputDimensions(width, height) {
  let targetWidth;
  let targetHeight;
  if (el.fit.value === 'square') {
    const edge = el.noUpscale.checked ? Math.min(activeSize, width, height) : activeSize;
    targetWidth = edge; targetHeight = edge;
  } else {
    const scale = Math.min(activeSize / width, activeSize / height, el.noUpscale.checked ? 1 : Infinity);
    targetWidth = Math.max(1, Math.round(width * scale)); targetHeight = Math.max(1, Math.round(height * scale));
  }
  if (el.pot.checked) { targetWidth = powerOfTwoFloor(targetWidth); targetHeight = powerOfTwoFloor(targetHeight); }
  return { width: targetWidth, height: targetHeight };
}

function powerOfTwoFloor(value) { return Math.max(1, 2 ** Math.floor(Math.log2(value))); }

function outputName(name, extension) {
  const base = name.replace(/\.[^.]+$/, '');
  const suffix = el.suffix.value.trim().replace(/[\\/:*?"<>|]/g, '-');
  return `${base}${suffix}.${extension}`;
}

function renderResults() {
  const ready = items.filter((item) => item.status === 'ready' && item.output);
  el.resultsPanel.hidden = !ready.length;
  el.results.innerHTML = ready.map((item) => `
    <article class="tr-result">
      <img src="${item.output.url}" alt="Preview of ${escapeAttr(item.output.name)}">
      <div><strong>${escapeHtml(item.output.name)}</strong><span>${item.output.width} × ${item.output.height}</span></div>
      <div class="tr-result-size"><strong>${formatBytes(item.output.blob.size)}</strong><span>${sizeChange(item.file.size, item.output.blob.size)}</span></div>
      <button class="tr-download" type="button" data-download="${item.id}">Download</button>
    </article>`).join('');
  el.results.querySelectorAll('[data-download]').forEach((button) => button.addEventListener('click', () => downloadOne(Number(button.dataset.download))));
  if (ready.length) {
    const before = ready.reduce((sum, item) => sum + item.file.size, 0);
    const after = ready.reduce((sum, item) => sum + item.output.blob.size, 0);
    el.savings.textContent = after < before ? `${Math.round((1 - after / before) * 100)}% smaller overall` : `${formatBytes(after)} output`;
  }
}

function downloadOne(id) {
  const output = items.find((item) => item.id === id)?.output;
  if (output) triggerDownload(output.url, output.name);
}

async function downloadZip() {
  const ready = items.filter((item) => item.output);
  if (!ready.length) return;
  el.downloadAll.disabled = true; el.downloadAll.textContent = 'Packaging…';
  try {
    const zip = new JSZip(); ready.forEach((item) => zip.file(item.output.name, item.output.blob));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob); triggerDownload(url, `assetbench_textures_${activeSize}px.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally { el.downloadAll.disabled = false; el.downloadAll.textContent = 'Download ZIP'; }
}

function triggerDownload(url, name) { const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); }

function updateUi() {
  const hasItems = items.length > 0;
  el.drop.hidden = hasItems; el.workspace.hidden = !hasItems;
  const total = items.reduce((sum, item) => sum + item.file.size, 0);
  el.queueMeta.textContent = hasItems ? `${items.length} file${items.length === 1 ? '' : 's'} · ${formatBytes(total)}` : '';
  el.processCount.textContent = `${items.length} texture${items.length === 1 ? '' : 's'}`;
}

function showNotice(message) { el.notice.textContent = message; el.notice.hidden = false; }
function hideNotice() { el.notice.hidden = true; }
function statusLabel(status) { return ({ queued: 'Queued', working: 'Resizing…', ready: 'Ready', error: 'Failed' })[status]; }
function sizeChange(before, after) {
  if (after < before) return `${Math.round((1 - after / before) * 100)}% smaller`;
  if (after > before) return `${Math.round((after / before - 1) * 100)}% larger`;
  return 'same size';
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}
function revokeItem(item) { if (item?.sourceUrl) URL.revokeObjectURL(item.sourceUrl); if (item?.output?.url) URL.revokeObjectURL(item.output.url); }
function revokeAll() { items.forEach(revokeItem); }
function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(value) { return escapeHtml(value).replace(/"/g, '&quot;'); }
