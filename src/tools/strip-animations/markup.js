const ICON = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export function stripAnimationsMarkup() {
  return `
    <div class="sa-page">
    <main class="sa-main">
    <div class="sa-shell">
      <section class="sa-hero">
        <div id="sa-identity"></div>
        <div class="hero-benefits">
          <div class="benefit">
            ${ICON('<path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Real playback</div>
              <div class="benefit-desc">Preview every clip on the actual model</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<path d="M20 6 9 17l-5-5"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Explicit keep / remove</div>
              <div class="benefit-desc">No ambiguous checkboxes</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="11" r="1" fill="currentColor" stroke="none"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5Z"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Rig protected</div>
              <div class="benefit-desc">Skeleton and bones always preserved</div>
            </div>
          </div>
        </div>
      </section>

      <div class="sa-notice hidden" id="sa-notice" role="alert">
        ${ICON('<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/>')}
        <span id="sa-notice-text"></span>
        <button type="button" class="sa-notice-close" id="sa-notice-close" aria-label="Dismiss">
          ${ICON('<path d="M18 6 6 18M6 6l12 12"/>')}
        </button>
      </div>

      <section class="sa-workspace">
        <!-- ============================ VIEWPORT ============================ -->
        <div class="sa-panel sa-stage-panel"
             data-layout-editable data-layout-lock-children
             data-layout-id="sa-stage-panel" data-layout-name="Strip Animations Viewport">
          <div class="dropzone sa-dropzone" id="sa-dropzone" tabindex="0" role="button" aria-label="Upload a 3D model">
            ${ICON('<path d="M7 18a4.5 4.5 0 0 1-1.2-8.84A5.5 5.5 0 0 1 16.3 8a4 4 0 0 1 .7 7.94"/><path d="M12 12v7"/><path d="m9 15 3-3 3 3"/>', 'class="dropzone-icon" stroke-width="1.5"')}
            <p class="dropzone-title">Drop an animated 3D model here</p>
            <p class="dropzone-sub">GLB / GLTF</p>
            <button class="sa-btn sa-btn-primary sa-btn-lg dropzone-btn" id="sa-choose" type="button">
              ${ICON('<path d="M4 20h16"/><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v12"/>')}
              Choose File
            </button>
            <p class="dropzone-hint">Max 500MB</p>
            <input type="file" id="sa-file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="visually-hidden" />
          </div>

          <div class="sa-stage hidden" id="sa-stage">
            <div class="sa-viewports" id="sa-viewports" data-layout="single">
              <div class="sa-viewport" id="sa-viewport"></div>
            </div>

            <div class="sa-hud" id="sa-hud">
              <div class="sa-hud-title" id="sa-hud-title">MODEL</div>
              <dl class="sa-hud-stats" id="sa-hud-stats"></dl>
            </div>

            <div class="sa-viewer-bar">
              <div class="sa-seg" role="group" aria-label="Display mode">
                <button class="sa-seg-btn is-active" data-shade="solid" type="button">Solid</button>
                <button class="sa-seg-btn" data-shade="both" type="button">Solid + Wire</button>
                <button class="sa-seg-btn" data-shade="wireframe" type="button">Wireframe</button>
              </div>
              <div class="sa-viewer-tools">
                <button class="sa-icon-btn" id="sa-grid" type="button" title="Toggle grid" aria-pressed="false">
                  ${ICON('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>')}
                </button>
                <button class="sa-icon-btn" id="sa-reset-cam" type="button" title="Reset camera">
                  ${ICON('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>')}
                </button>
              </div>
            </div>

            <!-- Playback transport for whichever clip is currently selected -->
            <div class="sa-timeline" id="sa-timeline">
              <div class="sa-timeline-track" id="sa-timeline-track">
                <canvas class="sa-timeline-density" id="sa-timeline-density" width="600" height="36"></canvas>
                <div class="sa-timeline-fill" id="sa-timeline-fill"></div>
              </div>
              <div class="sa-timeline-labels">
                <span id="sa-timeline-start">0.00s</span>
                <span id="sa-timeline-end">0.00s</span>
              </div>
            </div>
            <div class="sa-transport" id="sa-transport">
              <button class="sa-icon-btn" id="sa-play-pause" type="button" title="Play" disabled>
                ${ICON('<path d="M5 3v18l15-9L5 3Z" fill="currentColor" stroke="none"/>', 'id="sa-play-icon"')}
              </button>
              <button class="sa-icon-btn" id="sa-stop" type="button" title="Stop" disabled>
                ${ICON('<rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" stroke="none"/>')}
              </button>
              <button class="sa-icon-btn is-active" id="sa-loop" type="button" title="Loop" aria-pressed="true" disabled>
                ${ICON('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>')}
              </button>
              <select class="select" id="sa-speed" disabled aria-label="Playback speed">
                <option value="0.25">0.25×</option>
                <option value="0.5">0.5×</option>
                <option value="1" selected>1×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
              <span class="sa-transport-time" id="sa-transport-time">No clip selected</span>
            </div>
          </div>
        </div>

        <!-- ============================ CONTROLS ============================ -->
        <div class="sa-controls">
          <div class="sa-panel" id="sa-clips-panel"
               data-layout-editable data-layout-lock-children
               data-layout-id="sa-clips-panel" data-layout-name="Animation Clips">
            <h2 class="sa-panel-title">Animation clips</h2>

            <div class="sa-search">
              ${ICON('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>')}
              <input type="text" id="sa-search" placeholder="Search clips by name…" aria-label="Search clips" />
            </div>

            <div class="sa-filters" role="group" aria-label="Filter clips">
              <button class="sa-seg-btn is-active" data-filter="all" type="button">All</button>
              <button class="sa-seg-btn" data-filter="keep" type="button">Keep</button>
              <button class="sa-seg-btn" data-filter="remove" type="button">Remove</button>
            </div>

            <div class="sa-quick-actions">
              <button class="sa-btn sa-btn-ghost" id="sa-keep-all" type="button">Keep all</button>
              <button class="sa-btn sa-btn-ghost" id="sa-remove-all" type="button">Remove all</button>
              <button class="sa-btn sa-btn-ghost" id="sa-invert" type="button">Invert</button>
            </div>

            <div class="sa-summary" id="sa-summary">
              <div class="sa-summary-col is-keep">
                <span class="sa-summary-cap">Keeping</span>
                <span class="sa-summary-num" id="sa-summary-keep">0</span>
              </div>
              <div class="sa-summary-col is-remove">
                <span class="sa-summary-cap">Removing</span>
                <span class="sa-summary-num" id="sa-summary-remove">0</span>
              </div>
              <div class="sa-summary-col">
                <span class="sa-summary-cap">Keyframes to remove</span>
                <span class="sa-summary-num" id="sa-summary-keyframes">0</span>
              </div>
            </div>

            <div class="sa-clip-list" id="sa-clip-list">
              <p class="sa-clip-empty">Upload a model to see its animation clips.</p>
            </div>
          </div>

          <div class="sa-panel hidden" id="sa-details-panel">
            <h2 class="sa-panel-title" id="sa-details-title">Clip details</h2>
            <div class="sa-details-grid" id="sa-details-grid"></div>
          </div>

          <div class="sa-panel hidden" id="sa-model-check">
            <h2 class="sa-panel-title">Pre-flight checks</h2>
            <ul class="sa-check-list" id="sa-check-list"></ul>
          </div>

          <div class="sa-panel hidden" id="sa-model-info-panel">
            <h2 class="sa-panel-title">Model</h2>
            <div class="sa-model-info" id="sa-model-info"></div>
          </div>

          <div class="sa-panel" id="sa-action-panel">
            <button class="sa-btn sa-btn-primary sa-btn-block sa-btn-xl sa-cta" id="sa-run" type="button" disabled>
              ${ICON('<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>')}
              <span id="sa-run-label">Remove selected animations</span>
            </button>

            <div class="sa-progress hidden" id="sa-progress">
              <div class="sa-progress-track"><div class="sa-progress-fill" id="sa-progress-fill" style="width:0%"></div></div>
              <div class="sa-progress-label">
                <span id="sa-progress-stage">Removing clips</span>
                <span id="sa-progress-pct">0%</span>
              </div>
            </div>
          </div>

          <div class="sa-panel hidden" id="sa-results">
            <h2 class="sa-panel-title">Result</h2>
            <div class="sa-headline">
              <span class="sa-headline-num" id="sa-headline-num">—</span>
              <span class="sa-headline-cap">clips removed</span>
            </div>
            <div id="sa-result-rows"></div>

            <div class="sa-pill-list" id="sa-removed-list"></div>
            <div class="sa-pill-list" id="sa-preserved-list"></div>

            <div class="sa-validation" id="sa-validation"></div>
            <div class="sa-warnings" id="sa-warnings"></div>

            <button class="sa-btn sa-btn-primary sa-btn-block" id="sa-download" type="button">
              ${ICON('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>')}
              Download cleaned GLB
            </button>
            <button class="sa-btn sa-btn-ghost sa-btn-block" id="sa-restart" type="button">Start again</button>
          </div>
        </div>
      </section>
    </div>
    </main>
    </div>
  `;
}
