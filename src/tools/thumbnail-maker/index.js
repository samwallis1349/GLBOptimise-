import { ThumbnailMakerPage } from './ThumbnailMakerPage.js';
import { ThumbnailViewer } from './ThumbnailViewer.js';
import { loadThumbnailModel } from './loadModel.js';
import { THUMBNAIL_MAKER_CONFIG } from './config.js';

export function mount(container) {
  container.innerHTML = '';
  const page = ThumbnailMakerPage();
  container.appendChild(page);
  const byId = (id) => page.querySelector(`#${id}`);
  const el = {
    file: byId('tm-file'), choose: byId('tm-choose'), drop: byId('tm-drop'), workspace: byId('tm-workspace'), viewer: byId('tm-viewer'),
    loading: byId('tm-loading'), notice: byId('tm-notice'), name: byId('tm-file-name'), size: byId('tm-size'), mode: byId('tm-background-mode'),
    colour: byId('tm-background'), colourField: byId('tm-colour-field'), colourValue: byId('tm-background-value'), lighting: byId('tm-lighting'),
    exposure: byId('tm-exposure'), exposureValue: byId('tm-exposure-value'), grid: byId('tm-grid'), reset: byId('tm-reset'),
    replace: byId('tm-replace'), download: byId('tm-download'),
  };
  let viewer = null;
  let baseName = 'model';
  const openPicker = () => el.file.click();
  el.choose.addEventListener('click', (event) => { event.stopPropagation(); openPicker(); });
  el.replace.addEventListener('click', openPicker);
  el.drop.addEventListener('click', openPicker);
  el.drop.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPicker(); } });
  ['dragenter', 'dragover'].forEach((name) => el.drop.addEventListener(name, (event) => { event.preventDefault(); el.drop.classList.add('is-dragover'); }));
  ['dragleave', 'drop'].forEach((name) => el.drop.addEventListener(name, (event) => { event.preventDefault(); el.drop.classList.remove('is-dragover'); }));
  el.drop.addEventListener('drop', (event) => loadFile(event.dataTransfer?.files?.[0]));
  el.file.addEventListener('change', () => { loadFile(el.file.files?.[0]); el.file.value = ''; });

  async function loadFile(file) {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!THUMBNAIL_MAKER_CONFIG.acceptedExtensions.includes(extension)) return showNotice('Choose a GLB, glTF or FBX file.', true);
    if (file.size > THUMBNAIL_MAKER_CONFIG.maxFileSize) return showNotice('That model is larger than the 200 MB limit.', true);
    el.drop.hidden = true; el.workspace.hidden = false; el.loading.hidden = false; el.loading.textContent = 'Loading model…'; el.download.disabled = true;
    el.name.textContent = file.name;
    baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-');
    try {
      viewer ||= new ThumbnailViewer(el.viewer);
      viewer.setModel(await loadThumbnailModel(file));
      el.loading.hidden = true; el.download.disabled = false;
      showNotice('Model ready. Adjust the view, then download your PNG.');
    } catch (error) {
      console.error(error); showNotice(`Could not load this model: ${error.message || 'unsupported or damaged file'}`, true);
      el.loading.textContent = 'Preview unavailable';
    }
  }

  function syncBackground() {
    const transparent = el.mode.value === 'transparent';
    el.colourField.hidden = transparent;
    viewer?.setBackground(el.colour.value, transparent);
  }
  el.mode.addEventListener('change', syncBackground);
  el.colour.addEventListener('input', () => { el.colourValue.value = el.colour.value.toUpperCase(); syncBackground(); });
  el.lighting.addEventListener('change', () => viewer?.setLighting(el.lighting.value));
  el.exposure.addEventListener('input', () => { el.exposureValue.value = Number(el.exposure.value).toFixed(1); if (viewer) viewer.renderer.toneMappingExposure = Number(el.exposure.value); });
  el.grid.addEventListener('change', () => viewer?.setGridVisible(el.grid.checked));
  el.reset.addEventListener('click', () => viewer?.frame());
  el.download.addEventListener('click', async () => {
    if (!viewer?.model) return;
    el.download.disabled = true; el.download.textContent = 'Rendering…';
    try {
      const blob = await viewer.capture(Number(el.size.value));
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${baseName}-thumbnail-${el.size.value}.png`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showNotice(`Export failed: ${error.message}`, true); }
    finally { el.download.disabled = false; el.download.textContent = 'Download PNG'; }
  });

  function showNotice(message, error = false) {
    el.notice.hidden = false; el.notice.textContent = message; el.notice.classList.toggle('is-error', error);
  }
  return () => viewer?.dispose();
}
