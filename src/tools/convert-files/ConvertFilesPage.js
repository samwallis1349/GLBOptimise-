import { CONVERT_FILES_CONFIG, FORMAT_MATRIX, TARGET_FORMATS } from './config.js';

export function ConvertFilesPage() {
  const page = document.createElement('div');
  page.className = 'cf-page';
  page.innerHTML = `
    <header class="cf-hero">
      <div>
        <p class="cf-eyebrow">Model pipeline utility</p>
        <h1>Model <span>Forge</span></h1>
        <p class="cf-lede">Convert 3D game models between GLB, glTF, FBX, OBJ, STL, PLY, DAE and USDZ. Preview, rescale and re-pivot before you export.</p>
      </div>
      <span class="cf-pill">Private · browser-only processing</span>
    </header>

    <div class="cf-grid">
      <section class="cf-card cf-stage-card">
        <div class="cf-card-h">
          <span class="cf-num">3D</span>
          <div><h2>Preview</h2><p>Drag to orbit, scroll to zoom. Drop a file anywhere on the viewport.</p></div>
          <span class="cf-spacer"></span>
          <span class="cf-tag">Local viewer</span>
        </div>
        <div class="cf-card-b">
          <div class="cf-stage" id="cf-stage">
            <canvas id="cf-view" aria-label="3D preview of the loaded model"></canvas>
            <div class="cf-tools">
              <button type="button" class="cf-tool" id="cf-wire" aria-pressed="false">Wireframe</button>
              <button type="button" class="cf-tool" id="cf-grid" aria-pressed="true">Grid</button>
              <button type="button" class="cf-tool" id="cf-anim" aria-pressed="false">Play animation</button>
              <button type="button" class="cf-tool" id="cf-frame">Reset view</button>
            </div>
            <div class="cf-badge"><b id="cf-src-name">Loading…</b></div>
            <div class="cf-busy" id="cf-busy">LOADING</div>
          </div>
          <dl class="cf-stats">
            <div><dt>Meshes</dt><dd id="cf-s-mesh">–</dd></div>
            <div><dt>Triangles</dt><dd id="cf-s-tri">–</dd></div>
            <div><dt>Vertices</dt><dd id="cf-s-vert">–</dd></div>
            <div><dt>Materials</dt><dd id="cf-s-mat">–</dd></div>
            <div><dt>Textures</dt><dd id="cf-s-tex">–</dd></div>
            <div><dt>Bones</dt><dd id="cf-s-bone">–</dd></div>
            <div><dt>Animations</dt><dd id="cf-s-anim">–</dd></div>
            <div><dt>Size (units)</dt><dd id="cf-s-size">–</dd></div>
          </dl>
        </div>
      </section>

      <div class="cf-col">
        <section class="cf-card">
          <div class="cf-card-h">
            <span class="cf-num">01</span>
            <div><h2>Source model</h2><p>Drop the model with its textures, .mtl or .bin files</p></div>
          </div>
          <div class="cf-card-b">
            <div class="cf-drop" id="cf-drop" tabindex="0" role="button" aria-label="Choose model files">
              <span class="cf-plus" aria-hidden="true">+</span>
              <strong>Add a model</strong>
              <small>Or drop everything as one .zip</small>
              <span class="cf-exts">.glb .gltf .fbx .obj .dae .stl .ply .3mf .3ds .zip</span>
            </div>
            <input type="file" id="cf-file" multiple hidden accept="${CONVERT_FILES_CONFIG.accept}">
            <ul class="cf-notes" id="cf-notes"></ul>
          </div>
        </section>

        <section class="cf-card">
          <div class="cf-card-h">
            <span class="cf-num">02</span>
            <div><h2>Target format</h2><p>Pick where the model is going</p></div>
          </div>
          <div class="cf-card-b">
            <div class="cf-fmts">
              ${TARGET_FORMATS.map((f, i) => `
                <label class="cf-fmt"><input type="radio" name="cf-fmt" value="${f.id}"${i === 0 ? ' checked' : ''}><b>${f.label}<i>${f.ext}</i></b><small>${f.note}</small></label>`).join('')}
            </div>
          </div>
        </section>

        <section class="cf-card">
          <div class="cf-card-h">
            <span class="cf-num">03</span>
            <div><h2>Adjust &amp; export</h2><p>Transform the model, then download</p></div>
          </div>
          <div class="cf-card-b">
            <div class="cf-opts">
              <div class="cf-field">
                <label for="cf-scale">Scale</label>
                <div class="cf-scale-row">
                  <input type="number" id="cf-scale" value="1" step="any" min="0.00001">
                  <button type="button" class="cf-chip" data-scale="0.01" title="Centimetres to metres">÷100</button>
                  <button type="button" class="cf-chip" data-scale="100" title="Metres to centimetres">×100</button>
                </div>
              </div>
              <div class="cf-field">
                <label for="cf-up">Up axis</label>
                <select id="cf-up">
                  <option value="y">Keep (Y-up)</option>
                  <option value="z">Rotate to Z-up</option>
                </select>
              </div>
              <div class="cf-field">
                <label for="cf-pivot">Pivot</label>
                <select id="cf-pivot">
                  <option value="keep">Keep original</option>
                  <option value="center">Centre of model</option>
                  <option value="bottom" selected>Bottom centre</option>
                </select>
              </div>
              <div class="cf-field">
                <span class="cf-lbl">Extras</span>
                <label class="cf-check"><input type="checkbox" id="cf-anims" checked>Include animations</label>
              </div>
            </div>
            <button type="button" class="cf-btn" id="cf-convert" disabled>Convert and download</button>
            <div class="cf-status" id="cf-status" role="status">Waiting for a model</div>
            <p class="cf-fine">Files are saved inside a .zip. FBX and DAE can be opened but not written, since no browser-side FBX writer exists. Export GLB for Unity or Unreal instead.</p>
          </div>
        </section>
      </div>
    </div>

    <section class="cf-card">
      <div class="cf-card-h">
        <span class="cf-num">i</span>
        <div><h2>Format support</h2><p>What each format can carry</p></div>
      </div>
      <div class="cf-card-b cf-tscroll">
        <table class="cf-table">
          <thead><tr><th>Format</th><th>Open</th><th>Save</th><th>Keeps</th><th>Typical use</th></tr></thead>
          <tbody>
            ${FORMAT_MATRIX.map(([fmt, open, save, keeps, use]) => `
              <tr><td>${fmt}</td><td class="${open ? 'cf-y' : 'cf-n'}">${open ? 'Yes' : 'No'}</td><td class="${save ? 'cf-y' : 'cf-n'}">${save ? 'Yes' : 'No'}</td><td>${keeps}</td><td>${use}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
  return page;
}
