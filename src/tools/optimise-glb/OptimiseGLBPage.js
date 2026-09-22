import { HARD_FILE_LIMIT } from './config/limits.js';

/**
 * Builds the Optimise GLB page markup (hero, upload/preset workspace,
 * results comparison, model check). This is a straight port of the
 * tool's original standalone page body — its own header/footer/theme
 * toggle were dropped in favour of Asset Bench's shared Header/Footer
 * (see src/shared/components/Header.js, Footer.js).
 *
 * @returns {HTMLElement}
 */
export function OptimiseGLBPage() {
  const page = document.createElement('div');
  page.className = 'og-page';

  const maxSizeMb = Math.round(HARD_FILE_LIMIT / 1024 / 1024);

  page.innerHTML = `
    <main class="og-main">
      <div class="og-shell">
        <section class="og-hero">
          <div id="tool-identity"></div>
          <div class="hero-benefits">
            <div class="benefit">
              <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>
              <div>
                <div class="benefit-title">Works in browser</div>
                <div class="benefit-desc">Your files stay on your device</div>
              </div>
            </div>
            <div class="benefit">
              <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8.7 8 11 4.5-2.3 8-6 8-11V5l-8-3Z"/></svg>
              <div>
                <div class="benefit-title">Fast &amp; private</div>
                <div class="benefit-desc">No uploads</div>
              </div>
            </div>
            <div class="benefit">
              <svg class="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="3"/><path d="M7 12h.01M17 12h.01M10 10v4M14 10v4"/></svg>
              <div>
                <div class="benefit-title">Game ready</div>
                <div class="benefit-desc">Perfect for Three.js, Unity, Unreal</div>
              </div>
            </div>
          </div>
        </section>

        <section class="workspace-grid">
          <div class="og-panel" id="upload-panel" data-layout-editable data-layout-id="upload-panel" data-layout-name="Upload Panel" data-layout-lock-children>
            <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload GLB files">
              <svg class="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 10l5-5 5 5"/><path d="M12 5v11"/></svg>
              <p class="dropzone-title" id="dropzone-title">Drop your GLB files here</p>
              <p class="dropzone-sub">or click to browse</p>
              <button class="og-btn og-btn-secondary" id="choose-file-btn" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h2l2 2h3a2 2 0 0 1 2 2v12"/></svg>
                <span id="choose-file-btn-label">Choose GLB Files</span>
              </button>
              <p class="dropzone-hint" id="dropzone-hint">Supports multiple .glb files · max ${maxSizeMb}MB each</p>
              <input type="file" id="file-input" accept=".glb,model/gltf-binary" multiple class="visually-hidden" />
            </div>

            <div class="file-queue hidden" id="file-queue" data-layout-editable data-layout-id="file-queue-panel" data-layout-name="File Queue" data-layout-lock-children>
              <div class="queue-summary">
                <span id="queue-summary-text">0 FILES · 0 MB</span>
                <button class="og-btn og-btn-ghost" id="clear-all-btn" type="button" style="padding: 2px 8px; font-size: 12px;">Clear All</button>
              </div>
              <div class="file-queue-list" id="file-queue-list"></div>
            </div>
          </div>

          <div class="og-panel" id="preset-panel" data-layout-editable data-layout-id="preset-panel" data-layout-name="Preset Panel" data-layout-lock-children>
            <h2 class="og-panel-title">
              Optimisation Preset
              <svg class="info-icon" data-tooltip="Presets control how aggressively Asset Bench optimises your model" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </h2>
            <div class="preset-options" id="preset-options" role="radiogroup" aria-label="Optimisation preset">
              <button class="preset-option" data-preset="safe" role="radio" aria-checked="false" type="button">
                <svg class="preset-option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8.7 8 11 4.5-2.3 8-6 8-11V5l-8-3Z"/></svg>
                <div>
                  <div class="preset-option-name">Safe</div>
                  <div class="preset-option-desc">High quality</div>
                </div>
              </button>
              <button class="preset-option selected" data-preset="gameReady" role="radio" aria-checked="true" type="button">
                <svg class="preset-option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="3"/><path d="M7 12h.01M17 12h.01M10 10v4M14 10v4"/></svg>
                <div>
                  <div class="preset-option-name">Game Ready</div>
                  <div class="preset-option-desc">Balanced</div>
                </div>
              </button>
              <button class="preset-option" data-preset="tiny" role="radio" aria-checked="false" type="button">
                <svg class="preset-option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16.5V7.5L12 3 3 7.5v9L12 21l9-4.5Z"/><path d="M3.3 7.5 12 12l8.7-4.5M12 12v9"/></svg>
                <div>
                  <div class="preset-option-name">Tiny</div>
                  <div class="preset-option-desc">Smallest size</div>
                </div>
              </button>
            </div>

            <button class="advanced-toggle" id="advanced-toggle" type="button" aria-expanded="false" aria-controls="advanced-body">
              <span>Advanced (optional)</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div class="advanced-body hidden" id="advanced-body"></div>

            <button class="og-btn og-btn-primary og-btn-block og-btn-lg" id="optimise-btn" type="button" disabled style="margin-top: var(--space-5);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 8v4l2.5 1.5"/></svg>
              <span id="optimise-btn-label">Optimise GLB</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>

            <div class="hidden" id="progress-panel" style="margin-top: var(--space-4);">
              <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width: 0%"></div></div>
              <div class="progress-label">
                <span id="progress-stage-text">Analysing…</span>
                <span id="progress-percent-text">0%</span>
              </div>
            </div>
          </div>
        </section>

        <section class="results-grid" id="results-grid">
          <div class="og-panel" data-layout-editable data-layout-id="original-preview-card" data-layout-name="Original Preview Card" data-layout-lock-children>
            <h2 class="og-panel-title">Original</h2>
            <div class="preview-stage" id="original-preview-stage">
              <div class="preview-empty" id="original-preview-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 7v10l9 5 9-5V7"/><path d="M12 12v10"/></svg>
                <span>No model loaded</span>
              </div>
              <span class="pill pill-neutral preview-badge hidden" id="original-size-badge"></span>
            </div>
            <div class="stat-list" id="original-stats"></div>
          </div>

          <div class="og-panel" data-layout-editable data-layout-id="image-preview-card" data-layout-name="Image Preview Card" data-layout-lock-children>
            <h2 class="og-panel-title">Optimised (Preview)</h2>
            <div class="preview-stage" id="optimised-preview-stage">
              <div class="preview-empty" id="optimised-preview-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 7v10l9 5 9-5V7"/><path d="M12 12v10"/></svg>
                <span>Not optimised yet</span>
              </div>
              <span class="pill pill-neutral preview-badge hidden" id="optimised-size-badge"></span>
            </div>
            <div class="stat-list" id="optimised-stats"></div>
          </div>

          <div class="og-panel" id="reduction-panel" data-layout-editable data-layout-id="reduction-card" data-layout-name="Reduction Card" data-layout-lock-children>
            <h2 class="og-panel-title">File Size Reduction</h2>
            <div class="reduction-figure is-empty" id="reduction-figure">—</div>
            <div class="reduction-caption">smaller</div>
            <div class="progress-track" style="margin-top: var(--space-3);"><div class="progress-fill" id="reduction-bar" style="width: 0%"></div></div>
            <div id="reduction-compare" style="margin-top: var(--space-4);"></div>
            <button class="og-btn og-btn-primary og-btn-block hidden" id="download-btn" type="button" style="margin-top: var(--space-4);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
              Download Optimised GLB
            </button>
          </div>
        </section>

        <section class="og-panel model-check hidden" id="model-check" data-layout-editable data-layout-id="model-check-panel" data-layout-name="Model Check Panel" data-layout-lock-children>
          <h2 class="og-panel-title">Model Check</h2>
          <div class="model-check-list" id="model-check-list">
            <div class="check-empty">Load a model to see optimisation opportunities.</div>
          </div>
        </section>
      </div>
    </main>
  `;

  return page;
}
