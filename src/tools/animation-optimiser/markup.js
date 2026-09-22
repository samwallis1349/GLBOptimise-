import { PRESETS, FRAME_RATES, DEFAULT_PRESET } from './config/presets.js';

const ICON = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export function animationOptimiserMarkup() {
  return `
    <div class="ao-page">
    <main class="ao-main">
    <div class="ao-shell">
      <section class="ao-hero">
        <div id="ao-identity"></div>
        <div class="hero-benefits">
          <div class="benefit">
            ${ICON('<path d="M3 15c3 0 3-8 6-8s3 8 6 8 3-8 6-8"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Fewer keyframes</div>
              <div class="benefit-desc">Redundant keys removed, not resampled away</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Same motion</div>
              <div class="benefit-desc">A/B the result before you export</div>
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

      <div class="ao-notice hidden" id="ao-notice" role="alert">
        ${ICON('<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/>')}
        <span id="ao-notice-text"></span>
        <button type="button" class="ao-notice-close" id="ao-notice-close" aria-label="Dismiss">
          ${ICON('<path d="M18 6 6 18M6 6l12 12"/>')}
        </button>
      </div>

      <section class="ao-workspace">
        <!-- ============================ STAGE ============================ -->
        <div class="ao-panel ao-stage-panel"
             data-layout-editable data-layout-lock-children
             data-layout-id="ao-stage-panel" data-layout-name="Animation Optimiser Viewport">
          <div class="dropzone ao-dropzone" id="ao-dropzone" tabindex="0" role="button" aria-label="Upload an animated 3D model">
            ${ICON('<path d="M7 18a4.5 4.5 0 0 1-1.2-8.84A5.5 5.5 0 0 1 16.3 8a4 4 0 0 1 .7 7.94"/><path d="M12 12v7"/><path d="m9 15 3-3 3 3"/>', 'class="dropzone-icon" stroke-width="1.5"')}
            <p class="dropzone-title">Drop an animated model here</p>
            <p class="dropzone-sub">GLB / GLTF</p>
            <button class="ao-btn ao-btn-primary ao-btn-lg dropzone-btn" id="ao-choose" type="button">
              ${ICON('<path d="M4 20h16"/><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v12"/>')}
              Choose File
            </button>
            <p class="dropzone-hint">Max 500MB</p>
            <input type="file" id="ao-file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="visually-hidden" />
          </div>

          <div class="ao-stage hidden" id="ao-stage">
            <div class="ao-viewports">
              <div class="ao-viewport" id="ao-viewport"></div>
              <div class="ao-ab" id="ao-ab" role="group" aria-label="Compare original and optimised">
                <button class="ao-ab-btn is-active" data-variant="original" type="button">Original</button>
                <button class="ao-ab-btn" data-variant="optimised" type="button" disabled>Optimised</button>
              </div>
              <div class="ao-hud" id="ao-hud">
                <div class="ao-hud-title">KEYFRAMES</div>
                <dl class="ao-hud-stats" id="ao-hud-stats"></dl>
              </div>
            </div>

            <div class="ao-transport">
              <div class="ao-transport-buttons">
                <button class="ao-icon-btn" id="ao-prev-clip" type="button" title="Previous clip">
                  ${ICON('<path d="M19 20 9 12l10-8v16Z"/><path d="M5 19V5"/>')}
                </button>
                <button class="ao-icon-btn ao-play-btn" id="ao-play" type="button" title="Play / pause" aria-pressed="false">
                  <span id="ao-play-icon">${ICON('<path d="M6 4v16l14-8L6 4Z"/>')}</span>
                </button>
                <button class="ao-icon-btn" id="ao-next-clip" type="button" title="Next clip">
                  ${ICON('<path d="m5 4 10 8-10 8V4Z"/><path d="M19 5v14"/>')}
                </button>
              </div>

              <input type="range" class="ao-scrub" id="ao-scrub" min="0" max="1000" value="0" step="1" aria-label="Scrub animation" />

              <div class="ao-transport-readout">
                <span class="ao-time" id="ao-time">0.00s</span>
                <span class="ao-time-sep">/</span>
                <span class="ao-time ao-time-total" id="ao-duration">0.00s</span>
              </div>

              <div class="ao-transport-options">
                <label class="ao-clip-field">
                  <span>Clip</span>
                  <select class="select ao-select" id="ao-clip-select"></select>
                </label>
                <label class="ao-toggle">
                  <span class="switch"><input type="checkbox" id="ao-loop" checked /><span class="switch-track"></span></span>
                  <span>Loop</span>
                </label>
                <div class="ao-viewer-tools">
                  <button class="ao-icon-btn" id="ao-grid" type="button" title="Toggle grid" aria-pressed="false">
                    ${ICON('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>')}
                  </button>
                  <button class="ao-icon-btn" id="ao-reset-cam" type="button" title="Reset camera">
                    ${ICON('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>')}
                  </button>
                </div>
              </div>
            </div>

            <p class="ao-ab-hint" id="ao-ab-hint">
              Optimise the model to unlock the A/B toggle — it swaps the two versions in
              place, keeping the camera, clip and playhead so you can spot any drift.
            </p>
          </div>
        </div>

        <!-- =========================== CONTROLS =========================== -->
        <div class="ao-controls">
          <div class="ao-panel" id="ao-howitworks-panel">
            <h2 class="ao-panel-title">How it works</h2>
            <ol class="ao-steps">
              <li><span class="ao-step-num">1</span><span>Drop an animated GLB or GLTF file in</span></li>
              <li><span class="ao-step-num">2</span><span>Pick how hard to push the reduction</span></li>
              <li><span class="ao-step-num">3</span><span>A/B the result, then export the smaller file</span></li>
            </ol>
          </div>

          <div class="ao-panel" id="ao-info-panel">
            <h2 class="ao-panel-title">What it does</h2>
            <ul class="ao-info-list">
              <li>Drops keyframes the surviving ones can reproduce</li>
              <li>Measures error as real distance and real angle</li>
              <li>Resamples over-baked clips to a sane frame rate</li>
              <li>Collapses channels that never actually move</li>
              <li>Keeps every clip's name, length and start time</li>
              <li>Never touches the rig, meshes or materials</li>
            </ul>
          </div>

          <div class="ao-panel hidden" id="ao-settings-panel">
            <h2 class="ao-panel-title">Reduction</h2>

            <div class="ao-preset-group" role="radiogroup" aria-label="Reduction strength">
              ${Object.values(PRESETS)
                .map(
                  (preset) => `
                <button class="ao-preset${preset.id === DEFAULT_PRESET ? ' is-active' : ''}"
                        type="button" data-preset="${preset.id}" role="radio"
                        aria-checked="${preset.id === DEFAULT_PRESET}">
                  <span class="ao-preset-label">${preset.label}</span>
                  <span class="ao-preset-desc">${preset.description}</span>
                </button>`
                )
                .join('')}
            </div>

            <div class="ao-field-row">
              <label class="ao-field-label" for="ao-fps">Frame rate</label>
              <select class="select ao-select" id="ao-fps">
                ${FRAME_RATES.map(
                  (rate) => `<option value="${rate.value ?? ''}">${rate.label}</option>`
                ).join('')}
              </select>
            </div>

            <div class="ao-switch-row">
              <label class="ao-toggle">
                <span class="switch"><input type="checkbox" id="ao-reduce" checked /><span class="switch-track"></span></span>
                <span>Remove redundant keyframes</span>
              </label>
              <label class="ao-toggle">
                <span class="switch"><input type="checkbox" id="ao-collapse" checked /><span class="switch-track"></span></span>
                <span>Collapse unchanging channels</span>
              </label>
              <label class="ao-toggle">
                <span class="switch"><input type="checkbox" id="ao-remove-empty" /><span class="switch-track"></span></span>
                <span>Remove empty clips</span>
              </label>
            </div>

            <button class="ao-btn ao-btn-primary ao-btn-block ao-run-btn" id="ao-run" type="button">
              ${ICON('<path d="M3 15c3 0 3-8 6-8s3 8 6 8 3-8 6-8"/>')}
              <span id="ao-run-label">Optimise animations</span>
            </button>

            <div class="ao-progress hidden" id="ao-progress">
              <div class="ao-progress-head">
                <span id="ao-progress-stage">Working</span>
                <span id="ao-progress-pct">0%</span>
              </div>
              <div class="ao-progress-track"><div class="ao-progress-fill" id="ao-progress-fill"></div></div>
            </div>
          </div>

          <div class="ao-panel hidden" id="ao-results-panel">
            <h2 class="ao-panel-title">Result</h2>
            <div class="ao-stat-grid" id="ao-stat-grid"></div>
            <div class="ao-clip-table" id="ao-clip-table"></div>
            <button class="ao-btn ao-btn-primary ao-btn-block ao-download-btn" id="ao-download" type="button">
              ${ICON('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>')}
              Download optimised GLB
            </button>
            <button class="ao-btn ao-btn-secondary ao-btn-block" id="ao-download-report" type="button">
              ${ICON('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>')}
              Download report (JSON)
            </button>
          </div>

          <div class="ao-panel hidden" id="ao-check-panel">
            <h2 class="ao-panel-title">Model check</h2>
            <ul class="ao-check-list" id="ao-check-list"></ul>
          </div>

          <div class="ao-panel hidden" id="ao-restart-panel">
            <button class="ao-btn ao-btn-ghost ao-btn-block" id="ao-restart" type="button">Start again</button>
          </div>
        </div>
      </section>
    </div>
    </main>
    </div>
  `;
}
