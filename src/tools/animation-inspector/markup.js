const ICON = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export function animationInspectorMarkup() {
  return `
    <div class="ai-page">
    <main class="ai-main">
    <div class="ai-shell">
      <section class="ai-hero">
        <div id="ai-identity"></div>
        <div class="hero-benefits">
          <div class="benefit">
            ${ICON('<path d="M5 3v18l15-9L5 3Z"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Preview animations</div>
              <div class="benefit-desc">Every clip, playable in 3D</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<path d="M3 15c3 0 3-8 6-8s3 8 6 8 3-8 6-8"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Analyse curves</div>
              <div class="benefit-desc">Per-channel keyframe data</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Find issues</div>
              <div class="benefit-desc">Broken loops &amp; dead channels</div>
            </div>
          </div>
        </div>
      </section>

      <div class="ai-notice hidden" id="ai-notice" role="alert">
        ${ICON('<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/>')}
        <span id="ai-notice-text"></span>
        <button type="button" class="ai-notice-close" id="ai-notice-close" aria-label="Dismiss">
          ${ICON('<path d="M18 6 6 18M6 6l12 12"/>')}
        </button>
      </div>

      <section class="ai-workspace">
        <!-- ============================ STAGE ============================ -->
        <div class="ai-panel ai-stage-panel"
             data-layout-editable data-layout-lock-children
             data-layout-id="ai-stage-panel" data-layout-name="Animation Inspector Viewport">
          <div class="dropzone ai-dropzone" id="ai-dropzone" tabindex="0" role="button" aria-label="Upload an animated 3D model">
            ${ICON('<path d="M7 18a4.5 4.5 0 0 1-1.2-8.84A5.5 5.5 0 0 1 16.3 8a4 4 0 0 1 .7 7.94"/><path d="M12 12v7"/><path d="m9 15 3-3 3 3"/>', 'class="dropzone-icon" stroke-width="1.5"')}
            <p class="dropzone-title">Drop an animated model here</p>
            <p class="dropzone-sub">GLB / GLTF</p>
            <button class="ai-btn ai-btn-primary ai-btn-lg dropzone-btn" id="ai-choose" type="button">
              ${ICON('<path d="M4 20h16"/><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v12"/>')}
              Choose File
            </button>
            <p class="dropzone-hint">Max 500MB</p>
            <input type="file" id="ai-file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="visually-hidden" />
          </div>

          <div class="ai-stage hidden" id="ai-stage">
            <div class="ai-viewports">
              <div class="ai-viewport" id="ai-viewport">
                <div class="ai-viewport-tag" id="ai-viewport-tag">Animation preview</div>
              </div>
              <div class="ai-hud" id="ai-hud">
                <div class="ai-hud-title">PLAYBACK</div>
                <dl class="ai-hud-stats" id="ai-hud-stats"></dl>
              </div>
            </div>

            <!-- ------------------------ transport ------------------------ -->
            <div class="ai-transport">
              <div class="ai-transport-buttons">
                <button class="ai-icon-btn" id="ai-prev-clip" type="button" title="Previous clip">
                  ${ICON('<path d="M19 20 9 12l10-8v16Z"/><path d="M5 19V5"/>')}
                </button>
                <button class="ai-icon-btn" id="ai-step-back" type="button" title="Step back one frame">
                  ${ICON('<path d="m15 18-6-6 6-6"/>')}
                </button>
                <button class="ai-icon-btn ai-play-btn" id="ai-play" type="button" title="Play / pause" aria-pressed="false">
                  <span id="ai-play-icon">${ICON('<path d="M6 4v16l14-8L6 4Z"/>')}</span>
                </button>
                <button class="ai-icon-btn" id="ai-step-fwd" type="button" title="Step forward one frame">
                  ${ICON('<path d="m9 18 6-6-6-6"/>')}
                </button>
                <button class="ai-icon-btn" id="ai-next-clip" type="button" title="Next clip">
                  ${ICON('<path d="m5 4 10 8-10 8V4Z"/><path d="M19 5v14"/>')}
                </button>
              </div>

              <input type="range" class="ai-scrub" id="ai-scrub" min="0" max="1000" value="0" step="1" aria-label="Scrub animation" />

              <div class="ai-transport-readout">
                <span class="ai-time" id="ai-time">0.00s</span>
                <span class="ai-time-sep">/</span>
                <span class="ai-time ai-time-total" id="ai-duration">0.00s</span>
                <span class="ai-fps-tag" id="ai-fps">— fps</span>
              </div>

              <div class="ai-transport-options">
                <label class="ai-toggle">
                  <span class="switch"><input type="checkbox" id="ai-loop" checked /><span class="switch-track"></span></span>
                  <span>Loop</span>
                </label>
                <label class="ai-speed-field">
                  <span>Speed</span>
                  <select class="select ai-select" id="ai-speed">
                    <option value="0.1">0.1x</option>
                    <option value="0.25">0.25x</option>
                    <option value="0.5">0.5x</option>
                    <option value="1" selected>1x</option>
                    <option value="2">2x</option>
                  </select>
                </label>
                <div class="ai-viewer-tools">
                  <button class="ai-icon-btn" id="ai-grid" type="button" title="Toggle grid" aria-pressed="false">
                    ${ICON('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>')}
                  </button>
                  <button class="ai-icon-btn" id="ai-reset-cam" type="button" title="Reset camera">
                    ${ICON('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>')}
                  </button>
                </div>
              </div>
            </div>

            <!-- ----------------------- curve editor ---------------------- -->
            <div class="ai-curve-block">
              <div class="ai-curve-head">
                <h2 class="ai-panel-title">Curve editor</h2>
                <label class="ai-node-field">
                  <span class="visually-hidden">Animated node</span>
                  <select class="select ai-select ai-node-select" id="ai-node-select"></select>
                </label>
              </div>
              <div class="ai-curve-legend" id="ai-curve-legend"></div>
              <div class="ai-curve-canvas-wrap">
                <canvas id="ai-curve-canvas" class="ai-curve-canvas"></canvas>
              </div>
              <p class="ai-curve-hint">
                Each channel is normalised to its own range so position and rotation stay comparable —
                the true range is shown beside each swatch.
              </p>
            </div>
          </div>
        </div>

        <!-- =========================== CONTROLS =========================== -->
        <div class="ai-controls">
          <div class="ai-panel" id="ai-howitworks-panel">
            <h2 class="ai-panel-title">How it works</h2>
            <ol class="ai-steps">
              <li><span class="ai-step-num">1</span><span>Drop an animated GLB or GLTF file in</span></li>
              <li><span class="ai-step-num">2</span><span>Pick a clip and play it back in 3D</span></li>
              <li><span class="ai-step-num">3</span><span>Read its curves, clip data and issues</span></li>
            </ol>
          </div>

          <div class="ai-panel" id="ai-info-panel">
            <h2 class="ai-panel-title">What gets checked</h2>
            <ul class="ai-info-list">
              <li>Keyframe times increase and never go negative</li>
              <li>Sampler outputs match their keyframe counts</li>
              <li>Rotation quaternions are normalised</li>
              <li>No two channels fight over the same target</li>
              <li>Clips return to frame one, so loops don't pop</li>
              <li>Dead channels and over-baked frame rates</li>
            </ul>
          </div>

          <div class="ai-panel hidden" id="ai-clips-panel">
            <h2 class="ai-panel-title">
              <span>Animation list</span>
              <span class="ai-panel-count" id="ai-clip-count"></span>
            </h2>
            <div class="ai-clip-list" id="ai-clip-list"></div>
          </div>

          <div class="ai-panel hidden" id="ai-clipinfo-panel">
            <h2 class="ai-panel-title">Clip info</h2>
            <dl class="ai-info-grid" id="ai-clip-info"></dl>
          </div>

          <div class="ai-panel hidden" id="ai-model-check">
            <h2 class="ai-panel-title">Model check</h2>
            <ul class="ai-check-list" id="ai-check-list"></ul>
          </div>

          <div class="ai-panel hidden" id="ai-actions-panel">
            <button class="ai-btn ai-btn-secondary ai-btn-block" id="ai-download-report" type="button">
              ${ICON('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>')}
              Download report (JSON)
            </button>
            <button class="ai-btn ai-btn-ghost ai-btn-block" id="ai-restart" type="button">Start again</button>
          </div>
        </div>
      </section>
    </div>
    </main>
    </div>
  `;
}
