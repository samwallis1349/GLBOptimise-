const ICON = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export function rigInspectorMarkup() {
  return `
    <div class="ri-page">
    <main class="ri-main">
    <div class="ri-shell">
      <section class="ri-hero">
        <div id="ri-identity"></div>
        <div class="hero-benefits">
          <div class="benefit">
            ${ICON('<circle cx="12" cy="5" r="2"/><path d="M12 7v10M12 10 7 12M12 10l5 2M12 17l-4 3M12 17l4 3"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Bind-pose skeleton</div>
              <div class="benefit-desc">Every joint, live in 3D</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Weight validation</div>
              <div class="benefit-desc">Unweighted &amp; unnormalised vertices flagged</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<path d="M12 2 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7l-9-5Z"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Fast &amp; private</div>
              <div class="benefit-desc">Runs entirely in your browser</div>
            </div>
          </div>
        </div>
      </section>

      <div class="ri-notice hidden" id="ri-notice" role="alert">
        ${ICON('<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/>')}
        <span id="ri-notice-text"></span>
        <button type="button" class="ri-notice-close" id="ri-notice-close" aria-label="Dismiss">
          ${ICON('<path d="M18 6 6 18M6 6l12 12"/>')}
        </button>
      </div>

      <section class="ri-workspace">
        <!-- ============================ VIEWPORT ============================ -->
        <div class="ri-panel ri-stage-panel"
             data-layout-editable data-layout-lock-children
             data-layout-id="ri-stage-panel" data-layout-name="Rig Inspector Viewport">
          <div class="dropzone ri-dropzone" id="ri-dropzone" tabindex="0" role="button" aria-label="Upload a rigged 3D model">
            ${ICON('<path d="M7 18a4.5 4.5 0 0 1-1.2-8.84A5.5 5.5 0 0 1 16.3 8a4 4 0 0 1 .7 7.94"/><path d="M12 12v7"/><path d="m9 15 3-3 3 3"/>', 'class="dropzone-icon" stroke-width="1.5"')}
            <p class="dropzone-title">Drop a rigged model here</p>
            <p class="dropzone-sub">GLB / GLTF</p>
            <button class="ri-btn ri-btn-primary ri-btn-lg dropzone-btn" id="ri-choose" type="button">
              ${ICON('<path d="M4 20h16"/><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v12"/>')}
              Choose File
            </button>
            <p class="dropzone-hint">Max 500MB</p>
            <input type="file" id="ri-file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="visually-hidden" />
          </div>

          <div class="ri-stage hidden" id="ri-stage">
            <div class="ri-viewports" id="ri-viewports">
              <div class="ri-viewport" id="ri-viewport">
                <div class="ri-viewport-tag">Bind pose</div>
              </div>
            </div>

            <div class="ri-hud" id="ri-hud">
              <div class="ri-hud-title">RIG</div>
              <dl class="ri-hud-stats" id="ri-hud-stats"></dl>
            </div>

            <div class="ri-viewer-bar">
              <div class="ri-seg" role="group" aria-label="Display mode">
                <button class="ri-seg-btn is-active" data-shade="solid" type="button">Solid</button>
                <button class="ri-seg-btn" data-shade="both" type="button">Solid + Wire</button>
                <button class="ri-seg-btn" data-shade="wireframe" type="button">Wireframe</button>
              </div>
              <div class="ri-toggles">
                <label class="ri-toggle">
                  <span class="switch"><input type="checkbox" id="ri-mesh-toggle" checked /><span class="switch-track"></span></span>
                  <span>Mesh</span>
                </label>
                <label class="ri-toggle">
                  <span class="switch"><input type="checkbox" id="ri-skeleton-toggle" checked /><span class="switch-track"></span></span>
                  <span>Skeleton</span>
                </label>
              </div>
              <div class="ri-viewer-tools">
                <button class="ri-icon-btn" id="ri-grid" type="button" title="Toggle grid" aria-pressed="false">
                  ${ICON('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>')}
                </button>
                <button class="ri-icon-btn" id="ri-reset-cam" type="button" title="Reset camera">
                  ${ICON('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>')}
                </button>
              </div>
            </div>

            <div class="ri-model-details" id="ri-model-details">
              <div class="ri-model-details-file" id="ri-model-details-file"></div>
              <dl class="ri-model-details-grid" id="ri-model-details-grid"></dl>
            </div>
          </div>
        </div>

        <!-- ============================ CONTROLS ============================ -->
        <div class="ri-controls">
          <div class="ri-panel" id="ri-howitworks-panel">
            <h2 class="ri-panel-title">How it works</h2>
            <ol class="ri-steps">
              <li><span class="ri-step-num">1</span><span>Drop a rigged GLB or GLTF file in</span></li>
              <li><span class="ri-step-num">2</span><span>See the skeleton live, over the bind-pose mesh</span></li>
              <li><span class="ri-step-num">3</span><span>Read the checks, click a joint, export a JSON report</span></li>
            </ol>
          </div>

          <div class="ri-panel" id="ri-info-panel">
            <h2 class="ri-panel-title">What gets checked</h2>
            <ul class="ri-info-list">
              <li>Skin &amp; joint counts, plus max hierarchy depth</li>
              <li>Every vertex has at least one non-zero joint weight</li>
              <li>Joint weights sum to 1.0, with no normalisation drift</li>
              <li>No duplicate joint names within a skin</li>
              <li>Every skin forms a single connected hierarchy</li>
              <li>Joint budget — flags very large rigs (200+)</li>
            </ul>
          </div>

          <div class="ri-panel hidden" id="ri-summary-panel">
            <h2 class="ri-panel-title">Rig summary</h2>
            <div class="ri-stat-grid" id="ri-stat-grid"></div>
            <button class="ri-btn ri-btn-secondary ri-btn-block ri-download-btn" id="ri-download-report" type="button">
              ${ICON('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>')}
              Download report (JSON)
            </button>
          </div>

          <div class="ri-panel hidden" id="ri-model-check">
            <h2 class="ri-panel-title">Model check</h2>
            <ul class="ri-check-list" id="ri-check-list"></ul>
          </div>

          <div class="ri-panel hidden" id="ri-hierarchy-panel">
            <h2 class="ri-panel-title">Skeleton hierarchy</h2>
            <p class="ri-hierarchy-hint">Click a joint to find it in the viewport.</p>
            <div class="ri-tree" id="ri-tree"></div>
          </div>

          <div class="ri-panel hidden" id="ri-restart-panel">
            <button class="ri-btn ri-btn-ghost ri-btn-block" id="ri-restart" type="button">Start again</button>
          </div>
        </div>
      </section>
    </div>
    </main>
    </div>
  `;
}
