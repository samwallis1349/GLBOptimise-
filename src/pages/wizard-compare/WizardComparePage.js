import './wizard-compare.css';
import manifest from '../home/wizard-hero/hero-manifest.json';
import { HERO_BASE, mb } from '../home/wizard-hero/config.js';

const PRESETS = {
  original: {
    label: 'Before',
    download: manifest.downloads['before-25k'],
    text: '24,999 triangles · Original 4K textures · Standard GLB',
  },
  balanced: {
    label: 'Balanced',
    download: manifest.downloads.optimised,
    text: '24,999 triangles · 2K colour / 1K normal / 512px material map · Meshopt',
  },
  small: {
    label: 'Small',
    download: manifest.downloads.small,
    text: '9,999 triangles · 1K colour + normal / 512px material map · Meshopt',
  },
};

/** "Quality versus size" page: the free wizard at three export presets. */
export function render(container) {
  container.innerHTML = '';
  const section = document.createElement('section');
  section.className = 'wizard-compare container';
  section.innerHTML = `
    <h1 class="wizard-compare__title">More detail. Less to download.</h1>
    <p class="wizard-compare__intro">Compare texture optimisation and mesh compression on the same free wizard. Drag to turn; scroll over the model to zoom.</p>
    <div class="wizard-compare__options" role="group" aria-label="Export preset">
      ${Object.entries(PRESETS)
        .map(([key, p]) => `<button type="button" data-preset="${key}" aria-pressed="false">${p.label} · ${mb(p.download.bytes)}</button>`)
        .join('')}
    </div>
    <div class="wizard-compare__stage" style="--hero-bg: url('${HERO_BASE}background.webp')">
      <div class="wizard-compare__status" role="status">Loading…</div>
    </div>
    <p class="wizard-compare__info" aria-live="polite"></p>
    <div class="wizard-compare__links">
      <a class="wizard-compare__download" download>Download this version</a>
      <a href="/">Back to the wizard</a>
    </div>
    <small class="wizard-compare__small">Sizes include embedded textures. Meshopt versions need an importer with EXT_meshopt_compression support. Static model, no rig. “Before” uses the same 24,999-triangle geometry as Balanced.</small>
  `;
  container.appendChild(section);

  const stage = section.querySelector('.wizard-compare__stage');
  const status = section.querySelector('.wizard-compare__status');
  const info = section.querySelector('.wizard-compare__info');
  const download = section.querySelector('.wizard-compare__download');
  const buttons = [...section.querySelectorAll('[data-preset]')];

  let disposed = false;
  let viewer = null;

  (async () => {
    try {
      const { createCompareViewer } = await import('./compareViewer.js');
      if (disposed) return;
      viewer = createCompareViewer(stage);
    } catch (error) {
      console.error(error);
      status.textContent = '3D preview unavailable in this browser. The downloads still work.';
      return;
    }
    select('balanced');
  })();

  let ticket = 0;
  async function select(key) {
    const preset = PRESETS[key];
    const mine = ++ticket;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === key)));
    info.textContent = `${preset.text} · ${mb(preset.download.bytes)}`;
    download.href = HERO_BASE + preset.download.file;
    download.download = preset.download.file.split('/').pop();
    status.hidden = false;
    status.textContent = key === 'original' ? `Loading ${mb(preset.download.bytes)}…` : 'Loading…';
    try {
      const shown = await viewer?.show(HERO_BASE + preset.download.file);
      if (disposed || mine !== ticket || !shown) return;
      status.textContent = 'Drag to inspect · scroll to zoom';
    } catch (error) {
      console.error(error);
      if (mine === ticket) status.textContent = 'Could not load this version. Please try again.';
    }
  }

  buttons.forEach((b) => (b.onclick = () => viewer && select(b.dataset.preset)));

  return () => {
    disposed = true;
    viewer?.dispose();
  };
}
