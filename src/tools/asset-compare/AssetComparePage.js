import { ACCEPT, VIEW_MODES } from './config.js';

function slotMarkup(key, label, role) {
  return `
    <section class="ac-slot" id="ac-slot-${key}" data-slot="${key}">
      <div class="ac-slot-head">
        <span class="ac-slot-letter ac-slot-letter--${key}">${label}</span>
        <div class="ac-slot-title"><strong>${role}</strong><small id="ac-slot-${key}-meta">No model yet</small></div>
        <span class="ac-grade" id="ac-slot-${key}-grade" hidden></span>
        <button type="button" class="ac-icon-btn" id="ac-slot-${key}-clear" aria-label="Remove model ${label}" hidden>&times;</button>
      </div>
      <div class="ac-drop" id="ac-drop-${key}" tabindex="0" role="button" aria-label="Choose model ${label}">
        <span class="ac-plus" aria-hidden="true">+</span>
        <strong id="ac-drop-${key}-label">Add model ${label}</strong>
        <small>.glb · .gltf + files · .zip</small>
      </div>
      <input type="file" id="ac-file-${key}" multiple hidden accept="${ACCEPT}">
      <p class="ac-slot-error" id="ac-slot-${key}-error" hidden></p>
    </section>`;
}

export function AssetComparePage() {
  const page = document.createElement('div');
  page.className = 'ac-page';
  page.innerHTML = `
    <header class="ac-hero">
      <div>
        <p class="ac-eyebrow">Asset pipeline utility</p>
        <h1>Asset <span>Compare</span></h1>
        <p class="ac-lede">Put two versions of a model side by side. See exactly what changed in size, triangles, textures, memory and health, and catch anything that got lost along the way.</p>
      </div>
      <span class="ac-pill">Private · browser-only processing</span>
    </header>

    <div class="ac-both-drop" id="ac-both-drop" tabindex="0" role="button" aria-label="Choose two models to compare">
      <strong>Drop two models here</strong><span>to fill A and B at once, or use the slots below</span>
      <input type="file" id="ac-file-both" multiple hidden accept="${ACCEPT}">
    </div>

    <div class="ac-slots">
      ${slotMarkup('a', 'A', 'Before')}
      <button type="button" class="ac-swap" id="ac-swap" aria-label="Swap A and B" title="Swap A and B" disabled>⇄</button>
      ${slotMarkup('b', 'B', 'After')}
    </div>

    <section class="ac-card ac-viewer-card">
      <div class="ac-toolbar" role="toolbar" aria-label="Viewer controls">
        <div class="ac-seg" role="group" aria-label="Layout">
          <button type="button" class="ac-seg-btn" data-layout="side" aria-pressed="true">Side by side</button>
          <button type="button" class="ac-seg-btn" data-layout="slider" aria-pressed="false">Slider</button>
        </div>
        <div class="ac-seg" role="group" aria-label="View mode">
          ${VIEW_MODES.map((m, i) => `<button type="button" class="ac-seg-btn" data-mode="${m.id}" aria-pressed="${i === 0}">${m.label}</button>`).join('')}
        </div>
        <div class="ac-toolbar-end">
          <label class="ac-toggle"><input type="checkbox" id="ac-sync" checked> Sync cameras</label>
          <label class="ac-toggle"><input type="checkbox" id="ac-grid" checked> Grid</label>
          <button type="button" class="ac-btn ac-btn--quiet" id="ac-reset">Reset view</button>
          <button type="button" class="ac-btn ac-btn--quiet" id="ac-snap" disabled>Save image</button>
        </div>
      </div>
      <div class="ac-stage is-side" id="ac-stage" style="--ac-split: 50">
        <div class="ac-view ac-view--a" id="ac-view-a">
          <span class="ac-view-label"><b>A</b> <span id="ac-view-a-name">Before</span></span>
          <div class="ac-view-empty" id="ac-view-a-empty">Add model A</div>
          <div class="ac-view-busy" id="ac-view-a-busy" hidden>Analysing…</div>
        </div>
        <div class="ac-view ac-view--b" id="ac-view-b">
          <span class="ac-view-label"><b>B</b> <span id="ac-view-b-name">After</span></span>
          <div class="ac-view-empty" id="ac-view-b-empty">Add model B</div>
          <div class="ac-view-busy" id="ac-view-b-busy" hidden>Analysing…</div>
        </div>
        <div class="ac-divider" id="ac-divider" role="slider" tabindex="0" aria-label="Reveal A or B" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
          <span class="ac-divider-grip" aria-hidden="true">⇆</span>
        </div>
      </div>
    </section>

    <div class="ac-status" id="ac-status" role="status" hidden></div>
    <div id="ac-results" class="ac-results"></div>
  `;
  return page;
}
