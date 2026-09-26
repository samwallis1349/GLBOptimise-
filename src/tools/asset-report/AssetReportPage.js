import { BUDGET_TARGETS } from '../../shared/glb/statistics.js';
import { ASSET_REPORT_CONFIG, GRADES } from './config.js';

export function AssetReportPage() {
  const page = document.createElement('div');
  page.className = 'ar-page';
  page.innerHTML = `
    <header class="ar-hero ar-no-print">
      <div>
        <p class="ar-eyebrow">Library audit utility</p>
        <h1>Asset <span>Report</span></h1>
        <p class="ar-lede">Audit a whole library of GLB and glTF assets at once. Health scores, platform budgets, byte breakdowns and fix-it recommendations, exported as CSV, JSON or a printable report.</p>
      </div>
      <span class="ar-pill">Private · browser-only processing</span>
    </header>

    <section class="ar-card ar-input ar-no-print">
      <div class="ar-drop" id="ar-drop" tabindex="0" role="button" aria-label="Choose model files">
        <span class="ar-plus" aria-hidden="true">+</span>
        <strong>Drop models or a whole folder</strong>
        <small>.glb · .gltf with .bin and textures · .zip · up to ${ASSET_REPORT_CONFIG.maxAssets} assets</small>
        <div class="ar-drop-actions">
          <button type="button" class="ar-btn ar-btn--primary" id="ar-pick-files">Choose files</button>
          <button type="button" class="ar-btn" id="ar-pick-folder">Choose folder</button>
        </div>
      </div>
      <input type="file" id="ar-file" multiple hidden accept="${ASSET_REPORT_CONFIG.accept}">
      <input type="file" id="ar-folder" multiple hidden webkitdirectory>

      <div class="ar-options">
        <label class="ar-field">
          <span>Target platform</span>
          <select id="ar-target">
            ${BUDGET_TARGETS.map((t) => `<option value="${t.id}"${t.id === ASSET_REPORT_CONFIG.defaultTarget ? ' selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </label>
        <label class="ar-check"><input type="checkbox" id="ar-thumbs" checked><span>Generate thumbnails<small id="ar-thumbs-note">On for batches up to ${ASSET_REPORT_CONFIG.autoThumbnailLimit} assets</small></span></label>
        <span class="ar-spacer"></span>
        <button type="button" class="ar-btn ar-btn--quiet" id="ar-clear" disabled>Clear library</button>
      </div>

      <div class="ar-progress" id="ar-progress" hidden>
        <div class="ar-progress-row">
          <span id="ar-progress-text">Analysing…</span>
          <button type="button" class="ar-btn ar-btn--quiet" id="ar-cancel">Cancel</button>
        </div>
        <div class="ar-progress-bar"><span id="ar-progress-fill"></span></div>
      </div>
      <div class="ar-notice" id="ar-notice" role="status" hidden></div>
    </section>

    <div id="ar-results" hidden>
      <section class="ar-card ar-no-print">
        <div class="ar-card-h">
          <span class="ar-num">01</span>
          <div><h2>Library summary</h2><p id="ar-summary-sub">—</p></div>
          <span class="ar-spacer"></span>
          <div class="ar-exports">
            <button type="button" class="ar-btn" id="ar-export-csv">CSV</button>
            <button type="button" class="ar-btn" id="ar-export-json">JSON</button>
            <button type="button" class="ar-btn" id="ar-copy">Copy summary</button>
            <button type="button" class="ar-btn ar-btn--primary" id="ar-print-btn">Print / Save as PDF</button>
          </div>
        </div>
        <div class="ar-card-b" id="ar-summary"></div>
      </section>

      <section class="ar-card ar-no-print">
        <div class="ar-card-h">
          <span class="ar-num">02</span>
          <div><h2>Assets</h2><p id="ar-table-sub">Click a row for the full report</p></div>
        </div>
        <div class="ar-card-b">
          <div class="ar-filters">
            <input type="search" id="ar-search" placeholder="Filter by name…" aria-label="Filter assets by name">
            <div class="ar-chips" role="group" aria-label="Filters">
              ${GRADES.map((g) => `<button type="button" class="ar-chip" data-grade="${g}" aria-pressed="false">${g}</button>`).join('')}
              <button type="button" class="ar-chip" data-filter="budget" aria-pressed="false">Over budget</button>
              <button type="button" class="ar-chip" data-filter="errors" aria-pressed="false">Has errors</button>
              <button type="button" class="ar-chip" data-filter="failed" aria-pressed="false">Unreadable</button>
            </div>
          </div>
          <div class="ar-table-wrap"><table class="ar-table" id="ar-table"></table></div>
        </div>
      </section>

      <section class="ar-card ar-detail ar-no-print" id="ar-detail" hidden></section>
    </div>

    <div class="ar-print" id="ar-print" aria-hidden="true"></div>
  `;
  return page;
}
