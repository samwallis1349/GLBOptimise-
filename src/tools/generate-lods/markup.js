const ICON = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export function generateLodsMarkup() {
  return `
    <div class="gl-page">
    <main class="gl-main">
    <div class="gl-shell">
      <section class="gl-hero">
        <div id="gl-identity"></div>
        <div class="hero-benefits">
          <div class="benefit">
            ${ICON('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">A full LOD chain</div>
              <div class="benefit-desc">Every level in one pass</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Independent levels</div>
              <div class="benefit-desc">Each simplified from the source, not chained</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<path d="M12 3 2 9l10 6 10-6-10-6Z"/><path d="m2 15 10 6 10-6"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Game ready</div>
              <div class="benefit-desc">Three.js • Unity • Unreal</div>
            </div>
          </div>
        </div>
      </section>

      <div class="gl-notice hidden" id="gl-notice" role="alert">
        ${ICON('<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/>')}
        <span id="gl-notice-text"></span>
        <button type="button" class="gl-notice-close" id="gl-notice-close" aria-label="Dismiss">
          ${ICON('<path d="M18 6 6 18M6 6l12 12"/>')}
        </button>
      </div>

      <section class="gl-workspace">
        <!-- ============================ VIEWPORT ============================ -->
        <div class="gl-panel gl-stage-panel"
             data-layout-editable data-layout-lock-children
             data-layout-id="gl-stage-panel" data-layout-name="Generate LODs Viewport">
          <!-- Upload -->
          <div class="dropzone gl-dropzone" id="gl-dropzone" tabindex="0" role="button" aria-label="Upload a 3D model">
            ${ICON('<path d="M7 18a4.5 4.5 0 0 1-1.2-8.84A5.5 5.5 0 0 1 16.3 8a4 4 0 0 1 .7 7.94"/><path d="M12 12v7"/><path d="m9 15 3-3 3 3"/>', 'class="dropzone-icon" stroke-width="1.5"')}
            <p class="dropzone-title">Drop 3D model here</p>
            <p class="dropzone-sub">GLB / GLTF</p>
            <button class="gl-btn gl-btn-primary gl-btn-lg dropzone-btn" id="gl-choose" type="button">
              ${ICON('<path d="M4 20h16"/><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v12"/>')}
              Choose File
            </button>
            <p class="dropzone-hint">Max 500MB</p>
            <input type="file" id="gl-file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="visually-hidden" />
          </div>

          <!-- Viewer -->
          <div class="gl-stage hidden" id="gl-stage">
            <div class="gl-viewports" id="gl-viewports" data-layout="single">
              <div class="gl-viewport" id="gl-viewport-original">
                <div class="gl-viewport-tag">Original</div>
              </div>
              <div class="gl-viewport" id="gl-viewport-lod">
                <div class="gl-viewport-tag is-accent" id="gl-viewport-lod-tag">LOD</div>
              </div>
              <div class="gl-split-handle" id="gl-split-handle" hidden>
                <span></span>
              </div>
            </div>

            <div class="gl-hud" id="gl-hud">
              <div class="gl-hud-title" id="gl-hud-title">ORIGINAL</div>
              <dl class="gl-hud-stats" id="gl-hud-stats"></dl>
            </div>

            <!-- LOD tab strip: which generated level is loaded into the second viewport -->
            <div class="gl-lod-tabs hidden" id="gl-lod-tabs" role="tablist" aria-label="LOD level"></div>

            <div class="gl-viewer-bar">
              <div class="gl-seg" role="group" aria-label="Display mode">
                <button class="gl-seg-btn is-active" data-shade="solid" type="button">Solid</button>
                <button class="gl-seg-btn" data-shade="both" type="button">Solid + Wire</button>
                <button class="gl-seg-btn" data-shade="wireframe" type="button">Wireframe</button>
              </div>
              <div class="gl-seg hidden" id="gl-compare-seg" role="group" aria-label="Comparison mode">
                <button class="gl-seg-btn is-active" data-compare="original" type="button">Original</button>
                <button class="gl-seg-btn" data-compare="lod" type="button">Selected LOD</button>
                <button class="gl-seg-btn" data-compare="side" type="button">Side by side</button>
                <button class="gl-seg-btn" data-compare="split" type="button">Split</button>
              </div>
              <div class="gl-viewer-tools">
                <button class="gl-icon-btn" id="gl-grid" type="button" title="Toggle grid" aria-pressed="false">
                  ${ICON('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>')}
                </button>
                <button class="gl-icon-btn" id="gl-reset-cam" type="button" title="Reset camera">
                  ${ICON('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================ CONTROLS ============================ -->
        <div class="gl-controls">
          <div class="gl-panel" id="gl-chain-panel"
               data-layout-editable data-layout-lock-children
               data-layout-id="gl-chain-panel" data-layout-name="LOD Chain Settings">
            <h2 class="gl-panel-title">LOD chain</h2>

            <div class="gl-presets" id="gl-presets" role="radiogroup" aria-label="LOD chain preset"></div>

            <div class="gl-levels" id="gl-levels"></div>

            <button class="gl-add-level" id="gl-add-level" type="button">
              ${ICON('<path d="M12 5v14M5 12h14"/>')}
              Add LOD level
            </button>

            <div class="gl-distance-panel" id="gl-distance-panel" hidden>
              <h3 class="gl-panel-title">Suggested switch distances</h3>
              <ul class="gl-distance-list" id="gl-distance-list"></ul>
              <p class="gl-distance-note">
                Estimated from this model's own geometry, as a multiple of its bounding radius — a
                starting point to tune per scene and per engine, not a measured value.
              </p>
            </div>

            <button class="gl-advanced-toggle" id="gl-adv-toggle" type="button" aria-expanded="false" aria-controls="gl-adv-body">
              <span>Advanced</span>
              ${ICON('<path d="m6 9 6 6 6-6"/>')}
            </button>
            <div class="gl-advanced-body hidden" id="gl-adv-body"></div>

            <button class="gl-btn gl-btn-primary gl-btn-block gl-btn-xl gl-cta" id="gl-run" type="button" disabled>
              ${ICON('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>')}
              <span id="gl-run-label">Generate LODs</span>
            </button>

            <div class="gl-progress hidden" id="gl-progress">
              <div class="gl-progress-track"><div class="gl-progress-fill" id="gl-progress-fill" style="width:0%"></div></div>
              <div class="gl-progress-label">
                <span id="gl-progress-stage">Analysing model</span>
                <span id="gl-progress-pct">0%</span>
              </div>
            </div>
          </div>

          <div class="gl-panel hidden" id="gl-model-check">
            <h2 class="gl-panel-title">Model check</h2>
            <ul class="gl-check-list" id="gl-check-list"></ul>
          </div>

          <div class="gl-panel hidden" id="gl-results">
            <h2 class="gl-panel-title">LOD chain results</h2>
            <div class="gl-headline">
              <span class="gl-headline-num" id="gl-headline-num">—</span>
              <span class="gl-headline-cap">levels generated</span>
            </div>
            <p class="gl-result-note">
              File size is a separate measure from geometry — textures and other buffers are
              untouched by this tool, so a lower triangle count does not always mean a smaller file.
            </p>
            <div class="gl-table-wrap">
              <table class="gl-table">
                <thead>
                  <tr><th>Level</th><th>Triangles</th><th>vs. source</th><th>File size</th><th>Check</th><th></th></tr>
                </thead>
                <tbody id="gl-result-rows"></tbody>
              </table>
            </div>
            <div class="gl-warnings" id="gl-warnings"></div>
            <button class="gl-btn gl-btn-primary gl-btn-block" id="gl-download-all" type="button">
              ${ICON('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>')}
              Download all as .zip
            </button>
            <button class="gl-btn gl-btn-ghost gl-btn-block" id="gl-restart" type="button">Start again</button>
          </div>

          <div class="gl-panel hidden" id="gl-breakdown-panel">
            <button class="gl-advanced-toggle gl-breakdown-toggle" id="gl-breakdown-toggle" type="button"
                    aria-expanded="false" aria-controls="gl-breakdown-body">
              <span>Mesh breakdown</span>
              ${ICON('<path d="m6 9 6 6 6-6"/>')}
            </button>
            <div class="hidden" id="gl-breakdown-body">
              <label class="gl-breakdown-select">
                <span>Level</span>
                <select id="gl-breakdown-level"></select>
              </label>
              <div class="gl-table-wrap">
                <table class="gl-table">
                  <thead>
                    <tr><th>Mesh</th><th>Original</th><th>This level</th><th>Reduction</th><th>Status</th></tr>
                  </thead>
                  <tbody id="gl-breakdown-rows"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
    </main>
    </div>
  `;
}
