import { INSPECT_GLB_CONFIG, TABS, VIEW_MODES } from './config.js';

export function InspectGLBPage() {
  const page = document.createElement('div');
  page.className = 'ig-page';
  page.innerHTML = `
    <header class="ig-hero">
      <div>
        <p class="ig-eyebrow">Asset inspection utility</p>
        <h1>Inspect <span>GLB</span></h1>
        <p class="ig-lede">Open any GLB or glTF and see exactly what's inside: where the bytes go, every mesh, material, texture, clip and joint, plus a health check with one-click fixes.</p>
      </div>
      <span class="ig-pill">Private · browser-only processing</span>
    </header>

    <section class="ig-drop" id="ig-drop" tabindex="0" role="button" aria-label="Choose a GLB or glTF file">
      <input type="file" id="ig-file" multiple hidden accept="${INSPECT_GLB_CONFIG.accept}">
      <span class="ig-plus" aria-hidden="true">+</span>
      <strong>Drop a GLB or glTF</strong>
      <small>Include the .bin and textures with a .gltf, or drop everything as one .zip</small>
      <span class="ig-exts">.glb .gltf .bin .zip</span>
    </section>

    <div class="ig-notice" id="ig-notice" role="status" hidden></div>
    <div class="ig-loading" id="ig-loading" hidden><span class="ig-spinner"></span><span id="ig-loading-text">Analysing…</span></div>

    <div id="ig-workspace" hidden>
      <div class="ig-filebar">
        <div class="ig-filebar__name"><span id="ig-file-name"></span><small id="ig-file-meta"></small></div>
        <button type="button" class="ig-button" id="ig-another">Open another file</button>
      </div>

      <div class="ig-strip" id="ig-strip"></div>

      <div class="ig-grid">
        <section class="ig-card ig-viewer-card">
          <div class="ig-card-h">
            <span class="ig-num">3D</span>
            <div><h2>Preview</h2><p>Drag to orbit, scroll to zoom. Selecting a mesh highlights it.</p></div>
          </div>
          <div class="ig-card-b">
            <div class="ig-stage" id="ig-stage">
              <div class="ig-stage-busy" id="ig-stage-busy" hidden>Loading preview…</div>
            </div>
            <div class="ig-toolbar">
              <div class="ig-seg" role="group" aria-label="View mode">
                ${VIEW_MODES.map((m, i) => `<button type="button" class="ig-seg__btn" data-view="${m.id}" aria-pressed="${i === 0}">${m.label}</button>`).join('')}
              </div>
              <div class="ig-toolbar__row">
                <button type="button" class="ig-tool" id="ig-grid" aria-pressed="true">Grid</button>
                <button type="button" class="ig-tool" id="ig-reset">Reset view</button>
                <button type="button" class="ig-tool" id="ig-clear-hl" hidden>Clear highlight</button>
                <span class="ig-anim" id="ig-anim" hidden>
                  <select id="ig-clip" aria-label="Animation clip"></select>
                  <button type="button" class="ig-tool" id="ig-play">Play</button>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section class="ig-card ig-detail">
          <div class="ig-tabs" role="tablist">
            ${TABS.map((t, i) => `<button type="button" role="tab" class="ig-tab" data-tab="${t.id}" aria-selected="${i === 0}">${t.label}<span class="ig-tab__count" data-count="${t.id}"></span></button>`).join('')}
          </div>
          <div class="ig-panel" id="ig-panel" role="tabpanel"></div>
        </section>
      </div>
    </div>
  `;
  return page;
}
