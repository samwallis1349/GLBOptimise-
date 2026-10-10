import { LIMITS } from './engine/sources.js';

export function pageMarkup() {
  return `
  <div class="ap-page">
    <header class="ap-head">
      <div>
        <p class="ap-eyebrow">Batch processing · GLB / glTF</p>
        <h1>Asset <span>Pipeline</span></h1>
        <p class="ap-lede">Drop a folder of models, set the pipeline once, and get optimised, validated, game-ready GLBs with LODs and reports in one ZIP.</p>
      </div>
      <details class="ap-pill-wrap">
        <summary class="ap-pill">Runs in your browser · files stay on this device</summary>
        <div class="ap-pill-body">
          <p>Everything (decoding, simplification, texture encoding, validation, ZIP) runs locally. Nothing is uploaded.</p>
          <p><b>Memory:</b> a browser tab usually gets 2–4 GB. Each asset being processed needs roughly 4–6× its decoded size (a 4096² texture alone is 64 MB decoded). Lower <em>Parallel assets</em> to 1 for very large files; outputs are kept as compressed blobs until you download.</p>
          <p>Limits: ${LIMITS.maxAssets} assets per batch, ${LIMITS.maxFileBytes / 1048576} MB per file, ${LIMITS.maxZipBytes / 1048576} MB per ZIP.</p>
        </div>
      </details>
    </header>

    <div class="ap-tabs" role="tablist" aria-label="Panels">
      <button type="button" role="tab" data-tab="library" aria-selected="true">Library <span data-count>0</span></button>
      <button type="button" role="tab" data-tab="preview" aria-selected="false">Preview</button>
      <button type="button" role="tab" data-tab="settings" aria-selected="false">Settings</button>
    </div>

    <div class="ap-shell" data-active-tab="library">
      <aside class="ap-panel ap-left" data-panel="library" aria-label="Asset library">
        <div class="ap-panel-h">
          <h2>Asset library</h2>
          <button type="button" class="ap-btn ap-btn--xs" data-action="expand" aria-pressed="false" title="Show every column">Table view</button>
        </div>
        <div class="ap-drop" data-drop tabindex="0" role="button" aria-label="Add models: drop files, folders or ZIPs, or press Enter to choose files">
          <strong>Drop models, folders or ZIPs</strong>
          <small>.glb · .gltf + .bin + textures · .zip</small>
          <span class="ap-drop-actions">
            <button type="button" class="ap-btn ap-btn--xs" data-action="pick-files">Files / ZIP</button>
            <button type="button" class="ap-btn ap-btn--xs" data-action="pick-folder">Folder</button>
          </span>
        </div>
        <div class="ap-lib-tools">
          <input type="search" data-search placeholder="Search assets…" aria-label="Search assets">
          <select data-filter aria-label="Filter assets">
            <option value="all">All</option>
            <option value="ready">Ready</option>
            <option value="issues">Has issues</option>
            <option value="animated">Animated / skinned</option>
            <option value="done">Processed</option>
            <option value="review">Needs review</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div class="ap-lib-actions">
          <label class="ap-check ap-check--inline"><input type="checkbox" data-select-all aria-label="Select all visible assets"><span>All</span></label>
          <span class="ap-sel-count" data-sel-count></span>
          <span class="ap-spacer"></span>
          <button type="button" class="ap-btn ap-btn--xs" data-action="replace" disabled title="Replace the active asset's source file">Replace</button>
          <button type="button" class="ap-btn ap-btn--xs" data-action="remove" disabled>Remove</button>
          <button type="button" class="ap-btn ap-btn--xs" data-action="retry" hidden>Retry failed</button>
        </div>
        <div class="ap-ignored" data-ignored hidden></div>
        <div class="ap-table-wrap"><table class="ap-table" data-table></table></div>
        <p class="ap-empty" data-empty>No assets yet. Add a folder of GLB / glTF files to start.</p>
      </aside>

      <main class="ap-panel ap-center" data-panel="preview" aria-label="Preview">
        <div class="ap-batch" data-batch hidden>
          <div class="ap-batch-row">
            <span data-batch-text>Processing…</span>
            <span class="ap-spacer"></span>
            <span class="ap-eta" data-eta></span>
            <button type="button" class="ap-btn ap-btn--xs" data-action="pause">Pause</button>
            <button type="button" class="ap-btn ap-btn--xs" data-action="cancel">Cancel</button>
          </div>
          <div class="ap-bar"><span data-batch-bar></span></div>
        </div>
        <div class="ap-view-tools" role="toolbar" aria-label="Preview controls">
          <div class="ap-seg ap-seg--small" role="group" aria-label="Compare">
            <button type="button" data-compare="optimised" aria-pressed="true">Optimised</button>
            <button type="button" data-compare="original" aria-pressed="false">Original</button>
            <button type="button" data-compare="split" aria-pressed="false">Side by side</button>
          </div>
          <select data-viewmode aria-label="Display mode">
            <option value="textured">Textured</option>
            <option value="untextured">Untextured</option>
            <option value="wireframe">Wireframe</option>
            <option value="overlay">Wire overlay</option>
            <option value="normals">Normals</option>
            <option value="uv">UV checker</option>
          </select>
          <select data-lod aria-label="LOD level" hidden></select>
          <select data-clip aria-label="Animation clip" hidden></select>
          <button type="button" class="ap-btn ap-btn--xs" data-action="reset-cam">Reset view</button>
        </div>
        <div class="ap-viewport-wrap">
          <div data-viewport></div>
          <p class="ap-view-empty" data-view-empty>Select an asset to preview it.</p>
          <p class="ap-view-busy" data-view-busy hidden>Loading preview…</p>
        </div>
        <div class="ap-info">
          <div class="ap-info-tabs" role="tablist" aria-label="Asset details">
            <button type="button" role="tab" data-info="stats" aria-selected="true">Stats</button>
            <button type="button" role="tab" data-info="plan" aria-selected="false">Pipeline plan</button>
            <button type="button" role="tab" data-info="checks" aria-selected="false">Issues &amp; validation</button>
            <button type="button" role="tab" data-info="materials" aria-selected="false">Materials</button>
            <button type="button" role="tab" data-info="files" aria-selected="false">Files</button>
            <button type="button" role="tab" data-info="log" aria-selected="false">Log</button>
          </div>
          <div class="ap-info-body" data-info-body></div>
        </div>
      </main>

      <aside class="ap-panel ap-right" data-panel="settings" aria-label="Pipeline settings">
        <div class="ap-panel-h"><h2>Pipeline settings</h2></div>
        <div class="ap-profile">
          <select data-profile aria-label="Profile"></select>
          <div class="ap-profile-actions">
            <button type="button" class="ap-btn ap-btn--xs" data-action="profile-rename">Rename</button>
            <button type="button" class="ap-btn ap-btn--xs" data-action="profile-duplicate">Duplicate</button>
            <button type="button" class="ap-btn ap-btn--xs" data-action="profile-delete">Delete</button>
            <button type="button" class="ap-btn ap-btn--xs" data-action="profile-import">Import</button>
            <button type="button" class="ap-btn ap-btn--xs" data-action="profile-export">Export</button>
          </div>
          <label class="ap-field ap-field--inline"><span>Parallel assets</span><select data-concurrency aria-label="Parallel assets"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label>
        </div>
        <div class="ap-settings" data-settings></div>
      </aside>
    </div>

    <div class="ap-actionbar" role="toolbar" aria-label="Pipeline actions">
      <button type="button" class="ap-btn" data-action="add">Add Assets</button>
      <button type="button" class="ap-btn" data-action="profile-save">Save Profile</button>
      <button type="button" class="ap-btn" data-action="preview-plan">Preview Pipeline</button>
      <span class="ap-status" data-status role="status" aria-live="polite"></span>
      <button type="button" class="ap-btn ap-btn--primary" data-action="process">Process Batch</button>
      <button type="button" class="ap-btn" data-action="download" disabled>Download Results</button>
    </div>

    <input type="file" data-input="files" multiple hidden accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2,.zip">
    <input type="file" data-input="folder" multiple hidden webkitdirectory>
    <input type="file" data-input="replace" hidden accept=".glb,.gltf">
    <input type="file" data-input="profile" hidden accept=".json,application/json">
  </div>`;
}
