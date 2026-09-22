import { RESOLUTION_PRESETS, RESOLUTION_ORDER, FORMATS } from './presets.js';

const ICON = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export function compressTexturesMarkup() {
  return `
    <div class="ct-page">
    <main class="ct-main">
    <div class="ct-shell">
      <section class="ct-hero">
        <div id="ct-identity"></div>
        <div class="hero-benefits">
          <div class="benefit">
            ${ICON('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Real resizing</div>
              <div class="benefit-desc">4K maps down to 1K or less</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<path d="M12 2 4 5v6c0 5 3.5 8.7 8 11 4.5-2.3 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Channel safe</div>
              <div class="benefit-desc">Normal and ORM maps protected</div>
            </div>
          </div>
          <div class="benefit">
            ${ICON('<line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="11" r="1" fill="currentColor" stroke="none"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5Z"/>', 'class="benefit-icon"')}
            <div>
              <div class="benefit-title">Game ready</div>
              <div class="benefit-desc">WebP • JPEG • KTX2 Basis</div>
            </div>
          </div>
        </div>
      </section>

      <div class="ct-notice hidden" id="ct-notice" role="alert">
        ${ICON('<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/>')}
        <span id="ct-notice-text"></span>
        <button type="button" class="ct-notice-close" id="ct-notice-close" aria-label="Dismiss">
          ${ICON('<path d="M18 6 6 18M6 6l12 12"/>')}
        </button>
      </div>

      <section class="ct-workspace">
        <!-- ============================ STAGE ============================ -->
        <div class="ct-panel ct-stage-panel"
             data-layout-editable data-layout-lock-children
             data-layout-id="ct-stage-panel" data-layout-name="Texture Viewport">
          <div class="dropzone ct-dropzone" id="ct-dropzone" tabindex="0" role="button" aria-label="Upload a 3D model">
            ${ICON('<path d="M7 18a4.5 4.5 0 0 1-1.2-8.84A5.5 5.5 0 0 1 16.3 8a4 4 0 0 1 .7 7.94"/><path d="M12 12v7"/><path d="m9 15 3-3 3 3"/>', 'class="dropzone-icon" stroke-width="1.5"')}
            <p class="dropzone-title">Drop a textured model here</p>
            <p class="dropzone-sub">GLB / GLTF</p>
            <button class="ct-btn ct-btn-primary ct-btn-lg dropzone-btn" id="ct-choose" type="button">
              ${ICON('<path d="M4 20h16"/><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v12"/>')}
              Choose File
            </button>
            <p class="dropzone-hint">Max 500MB</p>
            <input type="file" id="ct-file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="visually-hidden" />
          </div>

          <div class="ct-stage hidden" id="ct-stage">
            <div class="ct-viewports" id="ct-viewports" data-layout="single">
              <div class="ct-viewport" id="ct-viewport-original">
                <div class="ct-viewport-tag">Original</div>
              </div>
              <div class="ct-viewport" id="ct-viewport-compressed">
                <div class="ct-viewport-tag is-accent">Compressed</div>
              </div>
              <div class="ct-split-handle" id="ct-split-handle" hidden><span></span></div>
            </div>

            <div class="ct-hud" id="ct-hud">
              <div class="ct-hud-title" id="ct-hud-title">ORIGINAL</div>
              <dl class="ct-hud-stats" id="ct-hud-stats"></dl>
            </div>

            <div class="ct-viewer-bar">
              <div class="ct-seg hidden" id="ct-compare-seg" role="group" aria-label="Comparison mode">
                <button class="ct-seg-btn is-active" data-compare="original" type="button">Original</button>
                <button class="ct-seg-btn" data-compare="compressed" type="button">Compressed</button>
                <button class="ct-seg-btn" data-compare="side" type="button">Side by side</button>
                <button class="ct-seg-btn" data-compare="split" type="button">Split</button>
              </div>
              <div class="ct-viewer-tools">
                <button class="ct-icon-btn" id="ct-grid" type="button" title="Toggle grid" aria-pressed="false">
                  ${ICON('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>')}
                </button>
                <button class="ct-icon-btn" id="ct-reset-cam" type="button" title="Reset camera">
                  ${ICON('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>')}
                </button>
              </div>
            </div>
          </div>

          <!-- Texture inspector: the pixels themselves, before and after -->
          <div class="ct-inspector hidden" id="ct-inspector">
            <div class="ct-inspector-head">
              <h3 class="ct-inspector-title" id="ct-inspector-title">Texture</h3>
              <div class="ct-seg" role="group" aria-label="Texture zoom">
                <button class="ct-seg-btn is-active" data-zoom="fit" type="button">Fit</button>
                <button class="ct-seg-btn" data-zoom="1" type="button">1:1</button>
                <button class="ct-seg-btn" data-zoom="4" type="button">4×</button>
              </div>
            </div>
            <div class="ct-inspector-pair">
              <figure class="ct-inspector-fig">
                <div class="ct-canvas-wrap"><canvas id="ct-canvas-before"></canvas></div>
                <figcaption id="ct-cap-before">—</figcaption>
              </figure>
              <figure class="ct-inspector-fig">
                <div class="ct-canvas-wrap"><canvas id="ct-canvas-after"></canvas></div>
                <figcaption id="ct-cap-after">Not compressed yet</figcaption>
              </figure>
            </div>
          </div>
        </div>

        <!-- ========================== CONTROLS ========================== -->
        <div class="ct-controls">
          <div class="ct-panel" id="ct-settings-panel"
               data-layout-editable data-layout-lock-children
               data-layout-id="ct-settings-panel" data-layout-name="Texture Settings">
            <h2 class="ct-panel-title">Texture resolution</h2>

            <div class="ct-res-row" id="ct-resolutions" role="radiogroup" aria-label="Maximum texture resolution">
              ${RESOLUTION_ORDER.map((id) => RESOLUTION_PRESETS[id])
                .map(
                  (p) => `
                <button class="ct-res${p.id === '1024' ? ' selected' : ''}" data-res="${p.id}"
                        role="radio" aria-checked="${p.id === '1024'}" type="button">
                  <span class="ct-res-name">${p.label}</span>
                  <span class="ct-res-blurb">${p.blurb}</span>
                </button>`
                )
                .join('')}
            </div>
            <p class="ct-note">
              Caps the <strong>longest edge</strong>. Aspect ratio is kept and nothing is ever upscaled —
              a texture already at or below the cap is left at its own size.
            </p>

            <h2 class="ct-panel-title ct-subhead">Output format</h2>
            <div class="ct-format-row" id="ct-formats" role="radiogroup" aria-label="Output format">
              ${Object.values(FORMATS)
                .map(
                  (f) => `
                <button class="ct-format${f.id === 'webp' ? ' selected' : ''}" data-format="${f.id}"
                        role="radio" aria-checked="${f.id === 'webp'}" type="button">
                  <span class="ct-format-name">${f.label}${f.slow ? '<span class="ct-slow">slower</span>' : ''}</span>
                  <span class="ct-format-blurb">${f.blurb}</span>
                </button>`
                )
                .join('')}
            </div>
            <p class="ct-note" id="ct-format-note"></p>

            <div class="ct-quality" id="ct-quality">
              <div class="ct-slider-head">
                <span class="ct-slider-label">Quality</span>
                <span class="ct-slider-value" id="ct-quality-value">82</span>
              </div>
              <input class="ct-slider" type="range" id="ct-quality-input" min="40" max="100" step="1" value="82"
                     aria-label="Lossy compression quality" />
              <div class="ct-slider-scale"><span>40 (smallest)</span><span>100 (best looking)</span></div>
            </div>

            <div class="ct-estimate" id="ct-estimate">
              <div class="ct-est-col">
                <span class="ct-est-cap">Textures now</span>
                <span class="ct-est-num" id="ct-est-before">—</span>
              </div>
              <div class="ct-est-arrow">${ICON('<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>')}</div>
              <div class="ct-est-col">
                <span class="ct-est-cap">Pixels after <span class="ct-est-tag">exact</span></span>
                <span class="ct-est-num is-accent" id="ct-est-after">—</span>
              </div>
            </div>
            <p class="ct-note ct-est-note">
              Pixel counts are exact — they follow directly from the resolution cap. The
              <strong>byte</strong> saving depends on image content and is only reported after the real encode.
            </p>

            <button class="ct-advanced-toggle" id="ct-adv-toggle" type="button" aria-expanded="false" aria-controls="ct-adv-body">
              <span>Advanced</span>
              ${ICON('<path d="m6 9 6 6 6-6"/>')}
            </button>
            <div class="ct-advanced-body hidden" id="ct-adv-body"></div>

            <button class="ct-btn ct-btn-primary ct-btn-block ct-btn-xl ct-cta" id="ct-run" type="button" disabled>
              ${ICON('<path d="M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3M8 3H5a2 2 0 0 0-2 2v3"/><rect x="9" y="9" width="6" height="6" rx="1"/>')}
              <span id="ct-run-label">Compress textures</span>
            </button>

            <div class="ct-progress hidden" id="ct-progress">
              <div class="ct-progress-track"><div class="ct-progress-fill" id="ct-progress-fill" style="width:0%"></div></div>
              <div class="ct-progress-label">
                <span id="ct-progress-stage">Analysing</span>
                <span id="ct-progress-pct">0%</span>
              </div>
            </div>
          </div>

          <div class="ct-panel hidden" id="ct-check">
            <h2 class="ct-panel-title">Model check</h2>
            <ul class="ct-check-list" id="ct-check-list"></ul>
          </div>

          <div class="ct-panel hidden" id="ct-results">
            <h2 class="ct-panel-title">Texture compression</h2>
            <div class="ct-headline">
              <span class="ct-headline-num" id="ct-headline-num">—</span>
              <span class="ct-headline-cap">texture bytes</span>
            </div>
            <div id="ct-result-rows"></div>
            <div class="ct-validation" id="ct-validation"></div>
            <div class="ct-warnings" id="ct-warnings"></div>
            <button class="ct-btn ct-btn-primary ct-btn-block" id="ct-download" type="button">
              ${ICON('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>')}
              Download compressed GLB
            </button>
            <button class="ct-btn ct-btn-ghost ct-btn-block" id="ct-restart" type="button">Start again</button>
          </div>

          <div class="ct-panel hidden" id="ct-table-panel">
            <div class="ct-table-head">
              <h2 class="ct-panel-title">Textures</h2>
              <span class="ct-table-hint">Click a row to inspect · override per texture</span>
            </div>
            <div class="ct-table-wrap">
              <table class="ct-table">
                <thead>
                  <tr>
                    <th>Texture</th><th>Role</th><th>Size</th><th>Bytes</th><th>Override</th><th>Result</th>
                  </tr>
                </thead>
                <tbody id="ct-table-rows"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
    </main>
    </div>
  `;
}
