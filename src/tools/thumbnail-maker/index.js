import { ThumbnailMakerPage } from './ThumbnailMakerPage.js';
import { ThumbnailViewer, disposeThumbnailModel } from './ThumbnailViewer.js';
import { mountBatch } from './batch.js';
import { loadThumbnailModel } from './loadModel.js';
import { THUMBNAIL_MAKER_CONFIG } from './config.js';
import {mountPresets} from './presets.js';
import {readSettings} from './settings.js';

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
  let loading=false,dead=false,exporting=false;
  const batch=mountBatch(page,()=>viewer ||= new ThumbnailViewer(el.viewer),showNotice,()=>{el.drop.hidden=true;el.workspace.hidden=false;el.download.disabled=true;el.loading.textContent='Choose settings, then generate the batch';el.loading.hidden=false;},()=>loading||exporting);
  function applySettings(reframe=false){const s=readSettings(page);syncBackground();el.colourValue.value=s.colour.toUpperCase();el.exposureValue.value=s.exposure.toFixed(1);if(viewer){viewer.setLighting(s.lighting);viewer.renderer.toneMappingExposure=s.exposure;viewer.setShadow(s.shadow,s.shadowStrength);if(reframe)viewer.frame(s.angle);}}
  mountPresets(page,applySettings,showNotice,()=>loading||exporting||batch.isBusy());
  byId('tm-angle').addEventListener('change',()=>viewer?.frame(byId('tm-angle').value));
  byId('tm-shadow').addEventListener('change',()=>applySettings());byId('tm-shadow-strength').addEventListener('input',()=>viewer?.setShadow(byId('tm-shadow').checked,Number(byId('tm-shadow-strength').value)));
  const openPicker = () => el.file.click();
  el.choose.addEventListener('click', (event) => { event.stopPropagation(); openPicker(); });
  el.replace.addEventListener('click', openPicker);
  el.drop.addEventListener('click', openPicker);
  el.drop.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPicker(); } });
  ['dragenter', 'dragover'].forEach((name) => el.drop.addEventListener(name, (event) => { event.preventDefault(); el.drop.classList.add('is-dragover'); }));
  ['dragleave', 'drop'].forEach((name) => el.drop.addEventListener(name, (event) => { event.preventDefault(); el.drop.classList.remove('is-dragover'); }));
  const selectFiles=files=>files.length>1?batch.select([...files]):loadFile(files[0]);
  el.drop.addEventListener('drop', (event) => selectFiles(event.dataTransfer?.files||[]));
  el.file.addEventListener('change', () => { selectFiles(el.file.files); el.file.value = ''; });

  async function loadFile(file) {
    if (!file) return;
    if(loading||exporting||batch.isBusy())return showNotice('Wait for the current operation to finish.',true);
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!THUMBNAIL_MAKER_CONFIG.acceptedExtensions.includes(extension)) return showNotice('Choose a GLB, glTF or FBX file.', true);
    if (file.size > THUMBNAIL_MAKER_CONFIG.maxFileSize) return showNotice('That model is larger than the 200 MB limit.', true);
    page.querySelector('.tm-viewport-results')?.remove();loading=true;
    el.drop.hidden = true; el.workspace.hidden = false; el.loading.hidden = false; el.loading.textContent = 'Loading model…'; el.download.disabled = true;
    el.name.textContent = file.name;
    baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-');
    try {
      viewer ||= new ThumbnailViewer(el.viewer);
      const model=await loadThumbnailModel(file);
      if(dead){disposeThumbnailModel(model);return;}
      viewer.setModel(model);applySettings(true);
      el.loading.hidden = true; el.download.disabled = false;
      showNotice('Model ready. Adjust the view, then download your PNG.');
    } catch (error) {
      console.error(error); showNotice(`Could not load this model: ${error.message || 'unsupported or damaged file'}`, true);
      el.loading.textContent = 'Preview unavailable';
    } finally {loading=false;}
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
  el.reset.addEventListener('click', () => viewer?.frame(byId('tm-angle').value));
  el.download.addEventListener('click', async () => {
    if (!viewer?.model) return;
    if(batch.isBusy()||exporting||loading)return;
    exporting=true;
    el.download.disabled = true; el.download.textContent = 'Rendering…';
    try {
      const blob = await viewer.capture(Number(el.size.value));
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${baseName}-thumbnail-${el.size.value}.png`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showNotice(`Export failed: ${error.message}`, true); }
    finally { exporting=false;el.download.disabled = false; el.download.textContent = 'Download PNG'; }
  });

  function showNotice(message, error = false) {
    el.notice.hidden = false; el.notice.textContent = message; el.notice.classList.toggle('is-error', error);
  }
  return () => {dead=true;batch.dispose();viewer?.dispose();};
}

