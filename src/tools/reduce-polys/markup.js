import { REDUCTION_PRESETS } from './presets.js';

const ICON = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export function reducePolysMarkup() {
  return `
    <div class="rp-page">
    <main class="rp-main">
    <div class="rp-shell">
      <section class="rp-hero">
        <div id="rp-identity"></div>
        <div class="hero-benefits">
          <div class="benefit">
            ${ICON('<path d="M3 12h4l3-8 4 16 3-8h4"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Real simplification</div>
              <div class="benefit-desc">Actual geometry reduction</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Visual control</div>
              <div class="benefit-desc">Choose exactly how much to reduce</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="11" r="1" fill="currentColor" stroke="none"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5Z"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Game ready</div>
              <div class="benefit-desc">Three.js • Unity • Unreal</div>
            </div>
          </div>
        </div>
      </section>

      <div class="rp-notice hidden" id="rp-notice" role="alert">
        ${ICON('<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/>')}
        <span id="rp-notice-text"></span>
        <button type="button" class="rp-notice-close" id="rp-notice-close" aria-label="Dismiss">
          ${ICON('<path d="M18 6 6 18M6 6l12 12"/>')}
        </button>
      </div>

      <section class="rp-workspace">
        <!-- ============================ VIEWPORT ============================ -->
        <div class="rp-panel rp-stage-panel"
             data-layout-editable data-layout-lock-children
             data-layout-id="rp-stage-panel" data-layout-name="Reduce Polys Viewport">
          <!-- Upload -->
          <div class="dropzone rp-dropzone" id="rp-dropzone" tabindex="0" role="button" aria-label="Upload a 3D model">
            ${ICON('<path d="M7 18a4.5 4.5 0 0 1-1.2-8.84A5.5 5.5 0 0 1 16.3 8a4 4 0 0 1 .7 7.94"/><path d="M12 12v7"/><path d="m9 15 3-3 3 3"/>', 'class="dropzone-icon" stroke-width="1.5"')}
            <p class="dropzone-title">Drop 3D model here</p>
            <p class="dropzone-sub">GLB / GLTF</p>
            <button class="rp-btn rp-btn-primary rp-btn-lg dropzone-btn" id="rp-choose" type="button">
              ${ICON('<path d="M4 20h16"/><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v12"/>')}
              Choose File
            </button>
            <p class="dropzone-hint">Max 500MB</p>
            <input type="file" id="rp-file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="visually-hidden" />
          </div>

          <!-- Viewer -->
          <div class="rp-stage hidden" id="rp-stage">
            <div class="rp-viewports" id="rp-viewports" data-layout="single">
              <div class="rp-viewport" id="rp-viewport-original">
                <div class="rp-viewport-tag">Original</div>
              </div>
              <div class="rp-viewport" id="rp-viewport-reduced">
                <div class="rp-viewport-tag is-accent">Reduced</div>
              </div>
              <div class="rp-split-handle" id="rp-split-handle" hidden>
                <span></span>
              </div>
            </div>

            <div class="rp-hud" id="rp-hud">
              <div class="rp-hud-title" id="rp-hud-title">ORIGINAL</div>
              <dl class="rp-hud-stats" id="rp-hud-stats"></dl>
            </div>

            <div class="rp-viewer-bar">
              <div class="rp-seg" role="group" aria-label="Display mode">
                <button class="rp-seg-btn is-active" data-shade="solid" type="button">Solid</button>
                <button class="rp-seg-btn" data-shade="both" type="button">Solid + Wire</button>
                <button class="rp-seg-btn" data-shade="wireframe" type="button">Wireframe</button>
              </div>
              <div class="rp-seg hidden" id="rp-compare-seg" role="group" aria-label="Comparison mode">
                <button class="rp-seg-btn is-active" data-compare="original" type="button">Original</button>
                <button class="rp-seg-btn" data-compare="reduced" type="button">Reduced</button>
                <button class="rp-seg-btn" data-compare="side" type="button">Side by side</button>
                <button class="rp-seg-btn" data-compare="split" type="button">Split</button>
              </div>
              <div class="rp-viewer-tools">
                <button class="rp-icon-btn" id="rp-grid" type="button" title="Toggle grid" aria-pressed="false">
                  ${ICON('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>')}
                </button>
                <button class="rp-icon-btn" id="rp-reset-cam" type="button" title="Reset camera">
                  ${ICON('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================ CONTROLS ============================ -->
        <div class="rp-controls">
          <div class="rp-panel" id="rp-reduction-panel"
               data-layout-editable data-layout-lock-children
               data-layout-id="rp-reduction-panel" data-layout-name="Reduction Settings">
            <h2 class="rp-panel-title">Polygon reduction</h2>

            <div class="rp-presets" id="rp-presets" role="radiogroup" aria-label="Reduction preset">
              ${Object.values(REDUCTION_PRESETS)
                .map(
                  (p) => `
                <button class="rp-preset${p.id === 'medium' ? ' selected' : ''}" data-preset="${p.id}"
                        role="radio" aria-checked="${p.id === 'medium'}" type="button">
                  <span class="rp-preset-name">${p.label}</span>
                  <span class="rp-preset-blurb">${p.blurb}</span>
                </button>`
                )
                .join('')}
            </div>

            <div class="rp-mode-switch" role="group" aria-label="Target mode">
              <button class="rp-seg-btn is-active" data-mode="percent" type="button">Percentage</button>
              <button class="rp-seg-btn" data-mode="triangles" type="button">Triangle target</button>
            </div>

            <!-- Percentage mode -->
            <div id="rp-percent-mode">
              <div class="rp-slider-head">
                <span class="rp-slider-label">Geometry to keep</span>
                <span class="rp-slider-value" id="rp-keep-value">50%</span>
              </div>
              <input class="rp-slider" type="range" id="rp-keep" min="10" max="100" step="1" value="50"
                     aria-label="Percentage of original geometry to keep" />
              <div class="rp-slider-scale"><span>100% (all kept)</span><span>10% (most removed)</span></div>
              <p class="rp-slider-note">
                This is the share of geometry <strong>kept</strong>, not removed.
                <span id="rp-keep-explain">50% keeps half the triangles.</span>
              </p>
            </div>

            <!-- Triangle target mode -->
            <div id="rp-triangle-mode" hidden>
              <label class="rp-field">
                <span>Target triangles</span>
                <input type="number" id="rp-target-tris" min="1" step="1000" value="50000" />
              </label>
              <div class="rp-quick-targets">
                ${[100000, 50000, 25000, 10000]
                  .map((n) => `<button class="rp-chip" data-target="${n}" type="button">${n.toLocaleString()}</button>`)
                  .join('')}
              </div>
              <p class="rp-slider-note" id="rp-target-note">
                The result is approximate — topology and the error limit decide how far a mesh can collapse.
              </p>
            </div>

            <!-- Target preview -->
            <div class="rp-target-preview" id="rp-target-preview">
              <div class="rp-target-col">
                <span class="rp-target-cap">Before</span>
                <span class="rp-target-num" id="rp-before-tris">—</span>
                <span class="rp-target-unit">triangles</span>
                <canvas class="rp-density" id="rp-density-before" width="150" height="64"></canvas>
              </div>
              <div class="rp-target-arrow">${ICON('<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>')}</div>
              <div class="rp-target-col">
                <span class="rp-target-cap is-target">Target <span class="rp-est">estimated</span></span>
                <span class="rp-target-num is-accent" id="rp-target-tris-out">—</span>
                <span class="rp-target-unit">triangles</span>
                <canvas class="rp-density" id="rp-density-after" width="150" height="64"></canvas>
              </div>
            </div>

            <button class="rp-advanced-toggle" id="rp-adv-toggle" type="button" aria-expanded="false" aria-controls="rp-adv-body">
              <span>Advanced</span>
              ${ICON('<path d="m6 9 6 6 6-6"/>')}
            </button>
            <div class="rp-advanced-body hidden" id="rp-adv-body"></div>

            <button class="rp-btn rp-btn-primary rp-btn-block rp-btn-xl rp-cta" id="rp-run" type="button" disabled>
              ${ICON('<path d="M12 3 2 9l10 6 10-6-10-6Z"/><path d="m2 15 10 6 10-6"/>')}
              <span id="rp-run-label">Reduce polys</span>
            </button>

            <div class="rp-progress hidden" id="rp-progress">
              <div class="rp-progress-track"><div class="rp-progress-fill" id="rp-progress-fill" style="width:0%"></div></div>
              <div class="rp-progress-label">
                <span id="rp-progress-stage">Analysing model</span>
                <span id="rp-progress-pct">0%</span>
              </div>
            </div>
          </div>

          <div class="rp-panel hidden" id="rp-model-check">
            <h2 class="rp-panel-title">Model check</h2>
            <ul class="rp-check-list" id="rp-check-list"></ul>
          </div>

          <div class="rp-panel hidden" id="rp-results">
            <h2 class="rp-panel-title">Polygon reduction</h2>
            <div class="rp-headline">
              <span class="rp-headline-num" id="rp-headline-num">—</span>
              <span class="rp-headline-cap">triangles</span>
            </div>
            <div id="rp-result-rows"></div>
            <div class="rp-validation" id="rp-validation"></div>
            <div class="rp-warnings" id="rp-warnings"></div>
            <button class="rp-btn rp-btn-primary rp-btn-block" id="rp-download" type="button">
              ${ICON('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>')}
              Download reduced GLB
            </button>
            <button class="rp-btn rp-btn-ghost rp-btn-block" id="rp-restart" type="button">Start again</button>
          </div>

          <div class="rp-panel hidden" id="rp-breakdown-panel">
            <button class="rp-advanced-toggle rp-breakdown-toggle" id="rp-breakdown-toggle" type="button"
                    aria-expanded="false" aria-controls="rp-breakdown-body">
              <span>Mesh breakdown</span>
              ${ICON('<path d="m6 9 6 6 6-6"/>')}
            </button>
            <div class="hidden" id="rp-breakdown-body">
              <div class="rp-table-wrap">
                <table class="rp-table">
                  <thead>
                    <tr><th>Mesh</th><th>Original</th><th>Reduced</th><th>Reduction</th><th>Status</th></tr>
                  </thead>
                  <tbody id="rp-breakdown-rows"></tbody>
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
