import { ARRANGER_CONFIG, EXPORT_FORMATS, GROUND_TEXTURES, SNAP_OPTIONS } from './config.js';
import { icon } from './arranger/icons.js';

const axisInputs = (group, step) => ['x', 'y', 'z'].map((axis) => `
  <label class="aa-axis aa-axis--${axis}"><span>${axis.toUpperCase()}</span><input type="number" step="${step}" data-field="${group}" data-axis="${axis}" inputmode="decimal" disabled></label>`).join('');

const toolButton = (id, label, iconName, extra = '') => `
  <button class="aa-tool" type="button" data-tool="${id}" ${extra}>${icon(iconName)}<span>${label}</span></button>`;

export function GLBBuilderPage() {
  const page = document.createElement('main');
  page.className = 'aa-page';
  page.innerHTML = `
  <h1 class="aa-sr">GLB Builder &amp; Merger — arrange GLB, glTF and FBX assets and export one scene</h1>
  <div class="aa-small-screen">The Asset Arranger is built for desktop — on a small screen the panels stack below the viewport.</div>
  <div class="aa-app" id="aa-app">
    <header class="aa-topbar">
      <div class="aa-brand">
        <span class="aa-brand-mark">${icon('arrange')}</span>
        <div><strong>GLB Builder <em>&amp; Merger</em></strong><small>Asset Arranger · load → place → arrange → export</small></div>
      </div>
      <nav class="aa-tabs" aria-label="Arranger steps">
        <button class="aa-tab" type="button" data-tab="import">${icon('upload')}<span>Import</span></button>
        <button class="aa-tab is-active" type="button" data-tab="arrange">${icon('arrange')}<span>Arrange</span></button>
        <button class="aa-tab" type="button" data-tab="export">${icon('download')}<span>Export</span></button>
      </nav>
      <div class="aa-top-actions">
        <div class="aa-seg">
          <button id="aa-undo" class="aa-icon-btn" type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled>${icon('undo')}</button>
          <button id="aa-redo" class="aa-icon-btn" type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled>${icon('redo')}</button>
        </div>
        <div class="aa-settings-wrap">
          <button id="aa-settings-btn" class="aa-icon-btn" type="button" title="Settings" aria-label="Settings" aria-expanded="false">${icon('settings')}</button>
          <div id="aa-settings" class="aa-popover" hidden>
            <h3>Gizmo snapping</h3>
            <label class="aa-row"><span>Move snap</span><select id="aa-snap-move">${SNAP_OPTIONS.move.map((v) => `<option value="${v}">${v ? `${v} m` : 'Off'}</option>`).join('')}</select></label>
            <label class="aa-row"><span>Rotate snap</span><select id="aa-snap-rotate">${SNAP_OPTIONS.rotate.map((v) => `<option value="${v}">${v ? `${v}°` : 'Off'}</option>`).join('')}</select></label>
            <h3>Viewport</h3>
            <label class="aa-row"><span>Shadows</span><input id="aa-shadows" type="checkbox" class="aa-switch" checked></label>
            <h3>Shortcuts</h3>
            <dl class="aa-keys">
              <dt>W / E / R</dt><dd>Move / Rotate / Scale</dd>
              <dt>Q · Esc</dt><dd>Select · Deselect</dd>
              <dt>Ctrl D</dt><dd>Duplicate</dd>
              <dt>Del</dt><dd>Delete</dd>
              <dt>F</dt><dd>Frame selected</dd>
              <dt>Shift click</dt><dd>Multi-select</dd>
            </dl>
          </div>
        </div>
      </div>
    </header>

    <aside class="aa-panel aa-library" id="aa-library">
      <div class="aa-panel-head">
        <h2>Assets <span id="aa-asset-count" class="aa-count">0 / ${ARRANGER_CONFIG.maxAssets}</span></h2>
        <button id="aa-add-assets" class="aa-icon-btn aa-icon-btn--sm" type="button" title="Add assets" aria-label="Add assets">${icon('plus')}</button>
      </div>
      <input id="aa-file" type="file" accept="${ARRANGER_CONFIG.accept}" multiple hidden>
      <button id="aa-drop" class="aa-drop" type="button">
        ${icon('cloud')}
        <strong>Drag &amp; Drop GLB / GLTF / FBX</strong>
        <small>or click to add assets (max ${ARRANGER_CONFIG.maxAssets})</small>
      </button>
      <label class="aa-search">${icon('search')}<input id="aa-asset-search" type="search" placeholder="Search assets…" autocomplete="off"></label>
      <div class="aa-filters" role="tablist">
        <button class="aa-filter is-active" type="button" data-filter="all">All <span>0</span></button>
        <button class="aa-filter" type="button" data-filter="models">Models <span>0</span></button>
        <button class="aa-filter" type="button" data-filter="animated">Animated <span>0</span></button>
      </div>
      <div id="aa-assets" class="aa-assets"></div>
      <p id="aa-assets-empty" class="aa-empty">Imported assets wait here. Nothing is added to the scene until you drag it in or press +.</p>
    </aside>

    <section class="aa-viewport" id="aa-viewport">
      <div id="aa-canvas" class="aa-canvas"></div>
      <div class="aa-view-bar">
        <div class="aa-views">
          <button class="aa-view is-active" type="button" data-view="perspective">Perspective</button>
          <button class="aa-view" type="button" data-view="top">Top</button>
          <button class="aa-view" type="button" data-view="front">Front</button>
          <button class="aa-view" type="button" data-view="right">Right</button>
        </div>
        <div class="aa-view-actions">
          <button id="aa-frame-selected" class="aa-icon-btn" type="button" title="Frame selected (F)" aria-label="Frame selected">${icon('target')}</button>
          <button id="aa-frame-all" class="aa-icon-btn" type="button" title="Frame all" aria-label="Frame all">${icon('frame')}</button>
          <button id="aa-grid-toggle" class="aa-icon-btn is-on" type="button" title="Toggle grid" aria-label="Toggle grid">${icon('grid')}</button>
        </div>
      </div>
      <div id="aa-drop-overlay" class="aa-drop-overlay" hidden><span id="aa-drop-label">Drop to place</span></div>
      <div id="aa-hint" class="aa-hint">${icon('mouse')}<span>Drag an asset from the left<br>or click + to add it to the scene</span></div>
      <div id="aa-busy" class="aa-busy" hidden><span class="aa-spinner"></span><span id="aa-busy-label">Loading…</span></div>
      <div class="aa-toolbar" role="toolbar" aria-label="Viewport tools">
        ${toolButton('select', 'Select', 'pointer', 'data-mode="select" title="Select (Q)"')}
        ${toolButton('move', 'Move', 'move', 'data-mode="move" title="Move (W)"')}
        ${toolButton('rotate', 'Rotate', 'rotate', 'data-mode="rotate" title="Rotate (E)"')}
        ${toolButton('scale', 'Scale', 'scale', 'data-mode="scale" title="Scale (R)"')}
        <span class="aa-sep"></span>
        ${toolButton('duplicate', 'Duplicate', 'copy', 'data-action="duplicate" title="Duplicate (Ctrl+D)"')}
        ${toolButton('duplicate-gap', 'Dup + Gap', 'copyGap', 'data-action="duplicate-gap" title="Duplicate and repeat the last offset"')}
        ${toolButton('delete', 'Delete', 'trash', 'data-action="delete" title="Delete (Del)"')}
        <span class="aa-sep"></span>
        ${toolButton('align', 'Align', 'alignX', 'data-action="align" title="Line selected up into a straight row along the arrange axis"')}
        ${toolButton('arrange', 'Arrange', 'distribute', 'data-action="arrange" title="Arrange selected with the gap below"')}
      </div>
    </section>

    <aside class="aa-side">
      <section class="aa-panel aa-outliner">
        <div class="aa-panel-head"><h2>Scene Outliner <span id="aa-instance-count" class="aa-count">(0)</span></h2></div>
        <label class="aa-search">${icon('search')}<input id="aa-scene-search" type="search" placeholder="Search scene…" autocomplete="off"></label>
        <ul id="aa-outliner" class="aa-tree" role="tree"></ul>
      </section>

      <section class="aa-panel aa-transform" id="aa-transform">
        <div class="aa-panel-head"><h2>Transform</h2><span id="aa-transform-target" class="aa-count">Nothing selected</span></div>
        <div class="aa-field-label">Position (m)</div>
        <div class="aa-axes">${axisInputs('position', 0.1)}</div>
        <button id="aa-snap-floor" class="aa-btn aa-btn--primary aa-btn--wide" type="button" disabled>${icon('floor')}Snap to Floor</button>
        <div class="aa-field-label">Rotation (°)</div>
        <div class="aa-axes">${axisInputs('rotation', 5)}</div>
        <div class="aa-field-label">Scale</div>
        <div class="aa-axes aa-axes--lock">${axisInputs('scale', 0.1)}
          <button id="aa-scale-lock" class="aa-icon-btn aa-icon-btn--sm is-on" type="button" title="Uniform scale lock" aria-pressed="true">${icon('link')}</button>
        </div>
        <div class="aa-btn-grid">
          <button class="aa-btn" type="button" data-action="duplicate" disabled>${icon('copy')}Duplicate</button>
          <button class="aa-btn aa-btn--outline" type="button" data-action="duplicate-gap" disabled>${icon('copyGap')}Duplicate + Gap</button>
          <button class="aa-btn" type="button" data-action="delete" disabled>${icon('trash')}Delete</button>
          <button class="aa-btn" type="button" data-action="reset" disabled>${icon('reset')}Reset Transform</button>
          <button class="aa-btn aa-btn--span" type="button" data-action="centre" disabled>${icon('centre')}Centre on Plane</button>
        </div>
      </section>

      <section class="aa-panel aa-anim" id="aa-anim">
        <button id="aa-anim-toggle" class="aa-anim-head" type="button" aria-expanded="false" disabled>
          <h2>Animations <span id="aa-anim-count" class="aa-count">(0)</span></h2>
          <span id="aa-anim-summary" class="aa-anim-summary">No animations on this object</span>
          ${icon('chevron', 'aa-chevron')}
        </button>
        <div id="aa-anim-body" class="aa-anim-body" hidden>
          <select id="aa-anim-clip" class="aa-select" aria-label="Animation clip"></select>
          <div class="aa-anim-controls">
            <button id="aa-anim-play" class="aa-icon-btn" type="button" title="Play" aria-label="Play">${icon('play')}</button>
            <button id="aa-anim-pause" class="aa-icon-btn" type="button" title="Pause" aria-label="Pause">${icon('pause')}</button>
            <button id="aa-anim-restart" class="aa-icon-btn" type="button" title="Restart" aria-label="Restart">${icon('restart')}</button>
            <button id="aa-anim-loop" class="aa-chip is-on" type="button" aria-pressed="true">${icon('loop')}Loop ON</button>
            <label class="aa-speed"><span>Speed</span><select id="aa-anim-speed">${[0.25, 0.5, 1, 1.5, 2].map((v) => `<option value="${v}"${v === 1 ? ' selected' : ''}>${v}×</option>`).join('')}</select></label>
          </div>
          <p class="aa-note">Drop a GLB / FBX animation onto the viewport with this model selected to add a compatible clip.</p>
        </div>
      </section>
    </aside>

    <footer class="aa-bottom">
      <section class="aa-panel aa-ground">
        <div class="aa-panel-head"><h2>Scene / Ground Settings</h2></div>
        <div class="aa-ground-body">
          <div class="aa-plane-card" aria-hidden="true"><div class="aa-plane" id="aa-plane-preview"></div><span>Ground Plane</span></div>
          <div class="aa-ground-fields">
            <div class="aa-row">
              <span>Ground Texture</span>
              <div class="aa-inline">
                <select id="aa-ground-texture" class="aa-select">${GROUND_TEXTURES.map((t) => `<option value="${t.id}"${t.id === 'custom' ? ' disabled' : ''}${t.id === 'dust' ? ' selected' : ''}>${t.label}</option>`).join('')}</select>
                <button id="aa-upload-texture" class="aa-btn" type="button">${icon('cloud')}Upload Texture</button>
                <input id="aa-texture-file" type="file" accept="${ARRANGER_CONFIG.textureAccept}" hidden>
              </div>
            </div>
            <div class="aa-row">
              <span>Plane Size</span>
              <div class="aa-stepper">
                <button id="aa-plane-down" type="button" aria-label="Smaller plane">${icon('minus')}</button>
                <output id="aa-plane-size">25m × 25m</output>
                <button id="aa-plane-up" type="button" aria-label="Larger plane">${icon('plus')}</button>
              </div>
            </div>
            <div class="aa-row aa-row--toggles">
              <label><span>Grid Visible</span><input id="aa-grid-visible" type="checkbox" class="aa-switch" checked></label>
              <label><span>Ground Visible</span><input id="aa-ground-visible" type="checkbox" class="aa-switch" checked></label>
            </div>
          </div>
        </div>
      </section>

      <section class="aa-panel aa-arrange">
        <div class="aa-panel-head"><h2>Arrange Tools</h2><span id="aa-arrange-meta" class="aa-count">Select 2+ objects</span></div>
        <div class="aa-arrange-tools">
          ${toolButton('duplicate', 'Duplicate', 'copy', 'data-action="duplicate"')}
          ${toolButton('duplicate-gap', 'Dup + Gap', 'copyGap', 'data-action="duplicate-gap"')}
          ${toolButton('align-x', 'Align X', 'alignX', 'data-action="align-x" title="Line selected up on the primary object\'s X"')}
          ${toolButton('align-z', 'Align Z', 'alignZ', 'data-action="align-z" title="Line selected up on the primary object\'s Z"')}
          ${toolButton('distribute', 'Distribute', 'distribute', 'data-action="distribute" title="Equal visible gaps between the outermost objects"')}
        </div>
        <div class="aa-arrange-row">
          <label class="aa-gap"><span>Gap (m)</span><input id="aa-gap" type="number" min="0" step="0.05" value="${ARRANGER_CONFIG.defaultGap.toFixed(2)}"></label>
          <div class="aa-seg aa-seg--axis" role="radiogroup" aria-label="Arrange axis">
            <button class="aa-axis-btn is-active" type="button" data-arrange-axis="x">X</button>
            <button class="aa-axis-btn" type="button" data-arrange-axis="z">Z</button>
          </div>
          <button class="aa-btn aa-btn--outline" type="button" data-action="arrange">Arrange Selected</button>
        </div>
      </section>

      <section class="aa-panel aa-export" id="aa-export">
        <div class="aa-panel-head"><h2>Export</h2></div>
        <div class="aa-export-body">
          <div class="aa-export-options">
            <div class="aa-row"><span>Export As</span>
              <div class="aa-formats">${EXPORT_FORMATS.map((f) => `<button class="aa-format${f.id === 'glb' ? ' is-active' : ''}" type="button" data-format="${f.id}"${f.enabled ? '' : ' disabled'} title="${f.note || ''}">${f.label}</button>`).join('')}</div>
            </div>
            <label class="aa-check"><input id="aa-include-ground" type="checkbox"><span>Include Ground Base</span></label>
          </div>
          <div class="aa-export-actions">
            <button id="aa-download-selected" class="aa-btn aa-btn--export" type="button" disabled>${icon('download')}<span><strong>Download Selected</strong><small id="aa-selected-meta">Nothing selected</small></span></button>
            <button id="aa-export-scene" class="aa-btn aa-btn--primary aa-btn--export" type="button" disabled>${icon('download')}<span><strong>Export Scene</strong><small id="aa-scene-meta">All visible objects combined</small></span></button>
          </div>
        </div>
      </section>
    </footer>
  </div>
  <div id="aa-toasts" class="aa-toasts" aria-live="polite"></div>
  `;
  return page;
}
