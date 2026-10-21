import { openModal } from './Modal.js';
import { EXTENSIONS } from '../config/extensions.js';
import { getToolById } from '../config/tools.js';
import { downloadBlob } from '../utils/download.js';

const STATUS_LABEL = { live: 'Available', review: 'In review', planned: 'Coming soon' };
const STATUS_ORDER = { live: 0, review: 1, planned: 2 };

/**
 * Browsers the manual-download zips load in (all Chromium, so one build).
 * `page` can't be a link: web pages aren't allowed to open browser pages.
 */
const BROWSERS = [
  { id: 'chrome', name: 'Chrome', page: 'chrome://extensions', toggle: 'top right' },
  { id: 'edge', name: 'Edge', page: 'edge://extensions', toggle: 'left-hand menu' },
  { id: 'brave', name: 'Brave', page: 'brave://extensions', toggle: 'top right' },
];

function detectBrowser() {
  if (navigator.brave) return 'brave';
  if (/\bEdg\//.test(navigator.userAgent)) return 'edge';
  return 'chrome';
}

/** Puzzle-piece mark used on the homepage button. */
export const EXTENSION_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.4 11H18V7a1 1 0 0 0-1-1h-4V4.6a2.1 2.1 0 1 0-4 0V6H5a1 1 0 0 0-1 1v3.5h1.4a2.1 2.1 0 1 1 0 4.2H4V19a1 1 0 0 0 1 1h4.3v-1.4a2.1 2.1 0 1 1 4.2 0V20H17a1 1 0 0 0 1-1v-4h1.4a2 2 0 1 0 0-4Z"/></svg>`;

const statusPill = (status) => `<span class="ext-modal__status ext-modal__status--${status}">${STATUS_LABEL[status]}</span>`;

/** `mode`: 'store' (Add to Chrome where listed) or 'manual' (tick to download the zip). */
function row(ext, mode, picked) {
  const tools = ext.tools.map(getToolById).filter(Boolean);
  const manual = mode === 'manual';
  let action = '';
  if (manual) action = ext.download ? '' : statusPill('planned');
  else if (ext.url) action = `<a class="btn btn--primary ext-modal__add" href="${ext.url}" target="_blank" rel="noopener">Add to Chrome</a>`;
  else action = statusPill(ext.status);
  let pick = '';
  if (manual) {
    pick = ext.download
      ? `<input type="checkbox" class="ext-modal__pick" value="${ext.id}"${picked.has(ext.id) ? ' checked' : ''} aria-label="Download ${ext.name}">`
      : '<span class="ext-modal__pick-gap"></span>';
  }
  const highlight = manual ? ext.download : ext.url;
  return `
    <li class="ext-modal__item${highlight ? ' is-live' : ''}">
      ${pick}
      <div class="ext-modal__text">
        <div class="ext-modal__name">${ext.name}</div>
        <p class="ext-modal__blurb">${ext.blurb}</p>
        ${tools.length ? `<p class="ext-modal__tools">${tools.map((t) => `<a href="${t.route}">${t.name}</a>`).join(' · ')}</p>` : ''}
      </div>
      ${action}
    </li>`;
}

function steps(browser) {
  return `
    <li>Unzip the download. Each extension is its own folder.</li>
    <li>Open <code>${browser.page}</code> in ${browser.name} (paste it into the address bar).</li>
    <li>Turn on <strong>Developer mode</strong> (${browser.toggle}).</li>
    <li>Click <strong>Load unpacked</strong> and choose an extension's folder. Repeat for each one.</li>`;
}

/** One zip with a folder per extension, ready for Load unpacked. */
async function downloadZip(ids) {
  const { default: JSZip } = await import('jszip');
  const bundle = new JSZip();
  for (const id of ids) {
    const res = await fetch(`/extensions/assetbench-${id}.zip`);
    if (!res.ok) throw new Error(`Couldn't fetch ${id}`);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const folder = bundle.folder(`assetbench-${id}`);
    await Promise.all(Object.values(zip.files).filter((f) => !f.dir).map(async (f) => folder.file(f.name, await f.async('uint8array'))));
  }
  const name = ids.length === 1 ? `assetbench-${ids[0]}.zip` : 'assetbench-extensions.zip';
  downloadBlob(await bundle.generateAsync({ type: 'blob' }), name);
}

/**
 * The homepage "Web extensions" popup: every extension, live ones first. A
 * switch at the top flips between the Chrome Web Store and a manual zip
 * download (tick extensions, pick a browser, Load unpacked).
 */
export function openExtensionsModal() {
  const list = [...EXTENSIONS].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  let browser = BROWSERS.find((b) => b.id === detectBrowser());
  let mode = 'store';
  const picked = new Set(EXTENSIONS.filter((e) => e.download).map((e) => e.id));

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="ext-modal__modes" role="tablist" aria-label="How to install">
      <button type="button" role="tab" class="ext-modal__mode" data-mode="store">Chrome Web Store</button>
      <button type="button" role="tab" class="ext-modal__mode" data-mode="manual">Manual download</button>
    </div>
    <p class="ext-modal__intro">Asset Bench tools in your browser toolbar. Free to install, 10 free uses, then 99p once per extension. Your files never leave your computer, and an All Access key unlocks them all.</p>
    <ul class="ext-modal__list"></ul>
    <section class="ext-modal__manual" hidden>
      <div class="ext-modal__manual-head">
        <h3 class="ext-modal__manual-title">Your browser</h3>
        <div class="ext-modal__browsers" role="radiogroup" aria-label="Your browser">
          ${BROWSERS.map((b) => `<button type="button" role="radio" class="ext-modal__browser" data-browser="${b.id}" aria-checked="${b === browser}">${b.name}</button>`).join('')}
        </div>
      </div>
      <p class="ext-modal__manual-note">Tick the extensions you want above and download them as one zip. No store needed, but they won't update themselves, so download again for new versions.</p>
      <ol class="ext-modal__steps">${steps(browser)}</ol>
      <p class="ext-modal__manual-note">Firefox and Safari aren't supported yet.</p>
    </section>
  `;

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'btn btn--primary';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn btn--secondary';
  closeButton.textContent = 'Close';

  const close = openModal({ title: 'Web extensions', content, actions: [downloadButton, closeButton], className: 'ext-modal' });
  closeButton.addEventListener('click', close);

  const label = () => {
    downloadButton.textContent = `Download ${picked.size} for ${browser.name}`;
    downloadButton.disabled = picked.size === 0;
  };

  const listEl = content.querySelector('.ext-modal__list');
  const show = () => {
    listEl.innerHTML = list.map((ext) => row(ext, mode, picked)).join('');
    // Following a tool link inside the popup navigates in-app, so close it too.
    listEl.querySelectorAll('.ext-modal__tools a').forEach((a) => a.addEventListener('click', close));
    listEl.querySelectorAll('.ext-modal__pick').forEach((p) => p.addEventListener('change', () => {
      if (p.checked) picked.add(p.value);
      else picked.delete(p.value);
      label();
    }));
    content.querySelectorAll('.ext-modal__mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    content.querySelector('.ext-modal__manual').hidden = mode !== 'manual';
    downloadButton.hidden = mode !== 'manual';
    label();
  };
  content.querySelectorAll('.ext-modal__mode').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    show();
  }));
  show();

  content.querySelectorAll('.ext-modal__browser').forEach((btn) => btn.addEventListener('click', () => {
    browser = BROWSERS.find((b) => b.id === btn.dataset.browser);
    content.querySelectorAll('.ext-modal__browser').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    content.querySelector('.ext-modal__steps').innerHTML = steps(browser);
    label();
  }));

  downloadButton.addEventListener('click', async () => {
    downloadButton.disabled = true;
    downloadButton.textContent = 'Preparing…';
    try {
      await downloadZip([...picked]);
      label();
    } catch {
      downloadButton.textContent = 'Download failed. Try again';
      downloadButton.disabled = false;
    }
  });

  closeButton.focus();
}
