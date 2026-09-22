import JSZip from 'jszip';
import stylesUrl from './pack-pbr.css?url';
import generatorStylesUrl from './pack-pbr-generator.css?url';
import { PackPBRPage } from './PackPBRPage.js';
import { PACK_PBR_CONFIG } from './config.js';

export function mount(container) {
  const styles = [stylesUrl, generatorStylesUrl].map((href) => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link); return link; });
  container.innerHTML = '';
  container.appendChild(PackPBRPage());
  const state = { sources: {}, outputUrl: null, preset: 'orm', generator: { bitmap: null, sourceUrl: null, outputs: [] } };
  const byId = (id) => document.getElementById(id);
  const el = { preview: byId('pbr-preview'), empty: byId('pbr-empty'), pack: byId('pbr-pack'), download: byId('pbr-download'), resolution: byId('pbr-resolution'), name: byId('pbr-name'), summary: byId('pbr-summary'), notice: byId('pbr-notice'), genDrop: byId('pbr-gen-drop'), genFile: byId('pbr-gen-file'), genImage: byId('pbr-gen-image'), genEmpty: byId('pbr-gen-empty'), generate: byId('pbr-generate'), generated: byId('pbr-generated'), genActions: byId('pbr-gen-actions'), downloadSet: byId('pbr-download-set') };

  wireGenerator();

  document.querySelectorAll('[data-slot]').forEach((slot) => {
    const id = slot.dataset.slot; const input = slot.querySelector('[data-file]');
    const open = (event) => { if (event.target.closest('[data-remove]')) return; input.click(); };
    slot.addEventListener('click', open);
    slot.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); } });
    input.addEventListener('change', () => { if (input.files[0]) loadSource(id, input.files[0]); input.value = ''; });
    for (const type of ['dragenter', 'dragover']) slot.addEventListener(type, (event) => { event.preventDefault(); slot.classList.add('is-dragging'); });
    for (const type of ['dragleave', 'dragend']) slot.addEventListener(type, () => slot.classList.remove('is-dragging'));
    slot.addEventListener('drop', (event) => { event.preventDefault(); slot.classList.remove('is-dragging'); if (event.dataTransfer.files[0]) loadSource(id, event.dataTransfer.files[0]); });
  });
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); removeSource(button.dataset.remove); }));
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
  document.querySelectorAll('[data-channel], [data-invert]').forEach((control) => control.addEventListener('change', () => { state.preset = 'custom'; document.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('is-active')); invalidate(); updateSummary(); }));
  el.resolution.addEventListener('change', () => { invalidate(); updateSummary(); });
  byId('pbr-clear').addEventListener('click', () => PACK_PBR_CONFIG.sources.forEach((source) => removeSource(source.id)));
  el.pack.addEventListener('click', packChannels);
  el.download.addEventListener('click', () => { if (!state.outputUrl) return; const a = document.createElement('a'); a.href = state.outputUrl; a.download = `${safeName(el.name.value)}.png`; a.click(); });
  applyPreset('orm');

  async function loadSource(id, file) {
    hideNotice();
    if (!PACK_PBR_CONFIG.acceptedTypes.includes(file.type)) return showNotice(`${file.name} is not a supported PNG, JPEG or WebP image.`);
    if (file.size > PACK_PBR_CONFIG.maxFileBytes) return showNotice(`${file.name} exceeds the 64 MB source limit.`);
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > PACK_PBR_CONFIG.maxDimension || bitmap.height > PACK_PBR_CONFIG.maxDimension) {
        bitmap.close?.();
        return showNotice(`${file.name} exceeds the 8192 px dimension limit.`);
      }
      removeSource(id);
      const url = URL.createObjectURL(file);
      state.sources[id] = { file, bitmap, url, width: bitmap.width, height: bitmap.height };
      const slot = document.querySelector(`[data-slot="${id}"]`);
      const img = slot.querySelector('img'); img.src = url; img.hidden = false; slot.querySelector('.pbr-slot-preview span').hidden = true;
      slot.querySelector('.pbr-slot-meta').textContent = `${file.name} · ${bitmap.width} × ${bitmap.height}`;
      slot.querySelector('[data-remove]').hidden = false; slot.classList.add('has-file');
      invalidate(); updateSummary();
    } catch { showNotice(`Could not decode ${file.name}.`); }
  }

  function removeSource(id) {
    const old = state.sources[id]; if (old) { old.bitmap.close?.(); URL.revokeObjectURL(old.url); delete state.sources[id]; }
    const slot = document.querySelector(`[data-slot="${id}"]`); if (!slot) return;
    const source = PACK_PBR_CONFIG.sources.find((entry) => entry.id === id); const img = slot.querySelector('img'); img.hidden = true; img.removeAttribute('src');
    slot.querySelector('.pbr-slot-preview span').hidden = false; slot.querySelector('.pbr-slot-meta').textContent = 'Drop or click to add';
    slot.querySelector('[data-remove]').hidden = true; slot.classList.remove('has-file'); invalidate(); updateSummary();
  }

  function applyPreset(id) {
    const preset = PACK_PBR_CONFIG.presets[id]; state.preset = id;
    document.querySelectorAll('[data-preset]').forEach((button) => button.classList.toggle('is-active', button.dataset.preset === id));
    preset.map.forEach((value, index) => { document.querySelector(`[data-channel="${index}"]`).value = value; document.querySelector(`[data-invert="${index}"]`).checked = preset.invert[index]; });
    el.name.value = `material${preset.filename}`; invalidate(); updateSummary();
  }

  function wireGenerator() {
    const open = () => el.genFile.click();
    el.genDrop.addEventListener('click', open);
    el.genDrop.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    el.genFile.addEventListener('change', () => { if (el.genFile.files[0]) loadGeneratorImage(el.genFile.files[0]); el.genFile.value = ''; });
    for (const type of ['dragenter', 'dragover']) el.genDrop.addEventListener(type, (event) => { event.preventDefault(); el.genDrop.classList.add('is-dragging'); });
    for (const type of ['dragleave', 'dragend']) el.genDrop.addEventListener(type, () => el.genDrop.classList.remove('is-dragging'));
    el.genDrop.addEventListener('drop', (event) => { event.preventDefault(); el.genDrop.classList.remove('is-dragging'); if (event.dataTransfer.files[0]) loadGeneratorImage(event.dataTransfer.files[0]); });
    for (const id of ['detail', 'normal', 'rough', 'metal', 'ao']) {
      const input = byId(`pbr-${id}`); const output = byId(`pbr-${id}-value`);
      input.addEventListener('input', () => { output.value = `${input.value}%`; clearGenerated(); });
    }
    byId('pbr-gen-size').addEventListener('change', clearGenerated);
    el.generate.addEventListener('click', generateMaterial);
    el.downloadSet.addEventListener('click', downloadMaterialSet);
  }

  async function loadGeneratorImage(file) {
    if (!PACK_PBR_CONFIG.acceptedTypes.includes(file.type)) return showNotice('Choose a PNG, JPEG or WebP source image.');
    try {
      const bitmap = await createImageBitmap(file);
      state.generator.bitmap?.close?.(); if (state.generator.sourceUrl) URL.revokeObjectURL(state.generator.sourceUrl);
      state.generator.bitmap = bitmap; state.generator.sourceUrl = URL.createObjectURL(file); state.generator.name = file.name.replace(/\.[^.]+$/, '');
      el.genImage.src = state.generator.sourceUrl; el.genImage.hidden = false; el.genEmpty.hidden = true; el.generate.disabled = false;
      clearGenerated(); hideNotice();
    } catch { showNotice(`Could not decode ${file.name}.`); }
  }

  async function generateMaterial() {
    const bitmap = state.generator.bitmap; if (!bitmap) return;
    el.generate.disabled = true; el.generate.textContent = 'Generating maps…'; hideNotice();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      clearGenerated();
      const requested = byId('pbr-gen-size').value;
      const sourceScale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
      const width = requested === 'source' ? Math.max(1, Math.round(bitmap.width * sourceScale)) : Number(requested);
      const height = requested === 'source' ? Math.max(1, Math.round(bitmap.height * sourceScale)) : Number(requested);
      const sourceCanvas = document.createElement('canvas'); sourceCanvas.width = width; sourceCanvas.height = height;
      const context = sourceCanvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0, width, height);
      const source = context.getImageData(0, 0, width, height); const count = width * height; const heights = new Uint8ClampedArray(count);
      const detail = Number(byId('pbr-detail').value) / 100;
      for (let i = 0; i < count; i++) { const p = i * 4; const light = source.data[p] * .2126 + source.data[p + 1] * .7152 + source.data[p + 2] * .0722; heights[i] = clamp((light - 128) * detail + 128); }
      const blurred = boxBlur(heights, width, height, 3);
      const roughLevel = Number(byId('pbr-rough').value) / 100; const threshold = Number(byId('pbr-metal').value) * 2.55; const aoStrength = Number(byId('pbr-ao').value) / 100; const normalStrength = Number(byId('pbr-normal').value) / 100;
      const maps = { height: new Uint8ClampedArray(count), roughness: new Uint8ClampedArray(count), metallic: new Uint8ClampedArray(count), ao: new Uint8ClampedArray(count) };
      for (let i = 0; i < count; i++) { const h = heights[i]; maps.height[i] = h; maps.roughness[i] = clamp(roughLevel * 255 + (128 - h) * .22); maps.metallic[i] = h >= threshold ? 255 : 0; maps.ao[i] = clamp(255 - Math.max(0, blurred[i] - h) * 2.4 * aoStrength); }
      const generated = [];
      generated.push(await canvasOutput(sourceCanvas, 'basecolor'));
      for (const id of ['ao', 'roughness', 'metallic', 'height']) generated.push(await grayscaleOutput(maps[id], width, height, id));
      generated.push(await normalOutput(heights, width, height, normalStrength));
      state.generator.outputs = generated;
      for (const id of ['ao', 'roughness', 'metallic', 'height']) {
        const output = generated.find((entry) => entry.id === id); await loadSource(id, new File([output.blob], `${state.generator.name}_${id}.png`, { type: 'image/png' }));
      }
      renderGenerated(); applyPreset('orm');
    } catch (error) { console.error('[PackPBR generator]', error); showNotice('Map generation failed. Try a smaller resolution.'); }
    finally { el.generate.disabled = false; el.generate.textContent = 'Generate PBR maps'; }
  }

  function boxBlur(values, width, height, radius) {
    const stride = width + 1; const integral = new Uint32Array(stride * (height + 1));
    for (let y = 1; y <= height; y++) { let row = 0; for (let x = 1; x <= width; x++) { row += values[(y - 1) * width + x - 1]; integral[y * stride + x] = integral[(y - 1) * stride + x] + row; } }
    const output = new Uint8ClampedArray(values.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const x0 = Math.max(0, x - radius); const y0 = Math.max(0, y - radius); const x1 = Math.min(width - 1, x + radius); const y1 = Math.min(height - 1, y + radius); const sum = integral[(y1 + 1) * stride + x1 + 1] - integral[y0 * stride + x1 + 1] - integral[(y1 + 1) * stride + x0] + integral[y0 * stride + x0]; output[y * width + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1)); }
    return output;
  }

  async function grayscaleOutput(values, width, height, id) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d'); const image = context.createImageData(width, height);
    for (let i = 0; i < values.length; i++) { const p = i * 4; image.data[p] = image.data[p + 1] = image.data[p + 2] = values[i]; image.data[p + 3] = 255; }
    context.putImageData(image, 0, 0); return canvasOutput(canvas, id);
  }

  async function normalOutput(heights, width, height, strength) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d'); const image = context.createImageData(width, height);
    const sample = (x, y) => heights[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const dx = (sample(x - 1, y) - sample(x + 1, y)) / 255 * strength; const dy = (sample(x, y - 1) - sample(x, y + 1)) / 255 * strength; const length = Math.hypot(dx, dy, 1); const p = (y * width + x) * 4; image.data[p] = (dx / length * .5 + .5) * 255; image.data[p + 1] = (dy / length * .5 + .5) * 255; image.data[p + 2] = (1 / length * .5 + .5) * 255; image.data[p + 3] = 255; }
    context.putImageData(image, 0, 0); return canvasOutput(canvas, 'normal');
  }

  async function canvasOutput(canvas, id) { const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Encoding failed')), 'image/png')); return { id, blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height }; }
  function renderGenerated() { el.generated.hidden = false; el.genActions.hidden = false; el.generated.innerHTML = state.generator.outputs.map((output) => `<article><img src="${output.url}" alt="${output.id} map"><strong>${output.id}</strong><span>${output.width} × ${output.height}</span></article>`).join(''); }
  function clearGenerated() { state.generator.outputs.forEach((output) => URL.revokeObjectURL(output.url)); state.generator.outputs = []; el.generated.hidden = true; el.genActions.hidden = true; }
  async function downloadMaterialSet() { if (!state.generator.outputs.length) return; el.downloadSet.disabled = true; const zip = new JSZip(); state.generator.outputs.forEach((output) => zip.file(`${state.generator.name}_${output.id}.png`, output.blob)); const packed = await zip.generateAsync({ type: 'blob' }); const url = URL.createObjectURL(packed); const a = document.createElement('a'); a.href = url; a.download = `${state.generator.name}_pbr-material.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); el.downloadSet.disabled = false; }
  function clamp(value) { return Math.max(0, Math.min(255, Math.round(value))); }

  async function packChannels() {
    const required = [...document.querySelectorAll('[data-channel]')].map((select) => select.value).filter((value) => value !== 'white' && value !== 'black');
    const missing = [...new Set(required)].filter((id) => !state.sources[id]);
    if (missing.length) return showNotice(`Add the missing ${missing.map(sourceLabel).join(', ')} map${missing.length > 1 ? 's' : ''}.`);
    hideNotice(); el.pack.disabled = true; el.pack.textContent = 'Packing…';
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const { width, height } = outputSize(); const canvas = el.preview; canvas.width = width; canvas.height = height;
      const outputContext = canvas.getContext('2d', { willReadFrequently: true });
      const packed = outputContext.createImageData(width, height); const channels = [...document.querySelectorAll('[data-channel]')].map((select, index) => ({ source: select.value, invert: document.querySelector(`[data-invert="${index}"]`).checked }));
      const cache = {};
      for (const { source } of channels) if (state.sources[source] && !cache[source]) cache[source] = sourcePixels(state.sources[source].bitmap, width, height);
      for (let pixel = 0; pixel < width * height; pixel++) {
        channels.forEach((channel, index) => { let value = channel.source === 'white' ? 255 : channel.source === 'black' ? 0 : luminance(cache[channel.source], pixel); if (channel.invert) value = 255 - value; packed.data[pixel * 4 + index] = value; });
      }
      outputContext.putImageData(packed, 0, 0); el.empty.hidden = true;
      if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
      state.outputUrl = URL.createObjectURL(blob); el.download.hidden = false; el.download.textContent = `Download PNG · ${formatBytes(blob.size)}`;
      el.summary.innerHTML = `<strong>${width} × ${height}</strong><span>RGBA · lossless PNG · ${formatBytes(blob.size)}</span>`;
    } catch (error) { console.error('[PackPBR]', error); showNotice('Packing failed. Try a smaller output resolution.'); }
    finally { el.pack.disabled = false; el.pack.textContent = 'Pack channels'; }
  }

  function sourcePixels(bitmap, width, height) { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d', { willReadFrequently: true }); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, width, height); return context.getImageData(0, 0, width, height).data; }
  function luminance(data, pixel) { const index = pixel * 4; return Math.round(data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722); }
  function outputSize() { const sources = Object.values(state.sources); const mode = el.resolution.value; if (/^\d+$/.test(mode)) return { width: Number(mode), height: Number(mode) }; const reducer = mode === 'smallest' ? Math.min : Math.max; return { width: reducer(...sources.map((s) => s.width)), height: reducer(...sources.map((s) => s.height)) }; }
  function updateSummary() { const count = Object.keys(state.sources).length; el.pack.disabled = !count; if (!count) el.summary.innerHTML = '<span>Waiting for source maps</span>'; else { const sizes = new Set(Object.values(state.sources).map((s) => `${s.width}×${s.height}`)); el.summary.innerHTML = `<strong>${count} source map${count === 1 ? '' : 's'}</strong><span>${sizes.size > 1 ? 'Mixed resolutions · inputs will be resampled' : [...sizes][0]}</span>`; } }
  function invalidate() { if (state.outputUrl) URL.revokeObjectURL(state.outputUrl); state.outputUrl = null; el.download.hidden = true; el.empty.hidden = false; el.preview.getContext('2d').clearRect(0, 0, el.preview.width, el.preview.height); }
  function sourceLabel(id) { return PACK_PBR_CONFIG.sources.find((source) => source.id === id)?.label || id; }
  function showNotice(message) { el.notice.textContent = message; el.notice.hidden = false; }
  function hideNotice() { el.notice.hidden = true; }
  function safeName(value) { return (value.trim() || 'material_packed').replace(/[\\/:*?"<>|]/g, '-'); }
  function formatBytes(bytes) { return bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(2)} MB`; }

  return () => { Object.values(state.sources).forEach((source) => { source.bitmap.close?.(); URL.revokeObjectURL(source.url); }); if (state.outputUrl) URL.revokeObjectURL(state.outputUrl); state.generator.bitmap?.close?.(); if (state.generator.sourceUrl) URL.revokeObjectURL(state.generator.sourceUrl); clearGenerated(); styles.forEach((link) => link.remove()); };
}
