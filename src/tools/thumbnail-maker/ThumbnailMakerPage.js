import './thumbnail-maker.css';

export function ThumbnailMakerPage() {
  const page = document.createElement('main');
  page.className = 'tm-page container section';
  page.innerHTML = `
    <header class="tm-hero">
      <div><p class="tm-eyebrow">Local 3D render utility</p><h1>Thumbnail <span>Maker</span></h1>
      <p>Frame a GLB, glTF or FBX in your browser and export a clean PNG. Build a free asset catalogue from your batch, with full-resolution images and no watermark. Your model never leaves this device.</p></div>
      <div class="tm-local"><span></span> 100% local processing</div>
    </header>
    <div id="tm-notice" class="tm-notice" role="status" hidden></div>
    <section id="tm-drop" class="tm-drop" role="button" tabindex="0">
      <input id="tm-file" type="file" accept=".glb,.gltf,.fbx" multiple hidden>
      <div class="tm-drop__icon">◇</div><h2>Drop models here</h2><p>One GLB, glTF or FBX · or batch up to 200 self-contained GLBs</p>
      <button id="tm-choose" class="tm-btn tm-btn--primary" type="button">Choose model</button>
    </section>
    <section id="tm-workspace" class="tm-workspace" hidden>
      <div class="tm-preview-panel">
        <div class="tm-panel-head"><div><span class="tm-step">01</span><h2>Compose</h2></div><span id="tm-file-name" class="tm-file-name"></span></div>
        <div id="tm-viewer" class="tm-viewer" aria-label="Interactive 3D preview"><div id="tm-loading" class="tm-loading">Loading model…</div></div>
        <div class="tm-viewer-help">Drag to orbit · wheel to zoom · right-drag to pan</div>
      </div>
      <aside class="tm-controls">
        <div class="tm-panel-head"><div><span class="tm-step">02</span><h2>Export</h2></div></div>
        <fieldset><legend>Canvas</legend>
          <label class="tm-field"><span>Resolution</span><select id="tm-size"><option value="512">512 × 512</option><option value="1024" selected>1024 × 1024</option><option value="2048">2048 × 2048</option></select></label>
          <label class="tm-field"><span>Background</span><select id="tm-background-mode"><option value="colour">Solid colour</option><option value="transparent">Transparent</option><option value="image">Imported image</option></select></label>
          <label id="tm-colour-field" class="tm-colour-field"><span>Colour</span><input id="tm-background" type="color" value="#111318"><output id="tm-background-value">#111318</output></label>
          <div id="tm-image-fields" hidden>
            <label class="tm-field"><span>Background image</span><input id="tm-background-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
            <label class="tm-range"><span>Image opacity <output id="tm-background-opacity-value">50%</output></span><input id="tm-background-opacity" type="range" min="0" max="1" step="0.01" value="0.5"></label>
            <button id="tm-background-remove" class="tm-btn tm-btn--secondary" type="button">Remove image</button>
            <p class="tm-tip" id="tm-background-name">PNG, JPG or WebP, up to 20 MB. Image fills the canvas; edges may be cropped. Lower opacity makes the background transparent in PNG exports. Imported images are kept for this session only.</p>
          </div>
        </fieldset>
        <fieldset><legend>Presentation</legend>
          <label class="tm-field"><span>Camera angle</span><select id="tm-angle"><option value="three-quarter">Three-quarter</option><option value="front">Front</option><option value="side">Side</option><option value="back">Back</option></select></label>
          <label class="tm-field"><span>Lighting</span><select id="tm-lighting"><option value="studio" selected>Studio</option><option value="bright">Bright</option><option value="dramatic">Dramatic</option></select></label>
          <label class="tm-range"><span>Exposure <output id="tm-exposure-value">1.0</output></span><input id="tm-exposure" type="range" min="0.5" max="2" step="0.1" value="1"></label>
          <label class="tm-check"><input id="tm-grid" type="checkbox"><span>Show ground grid in preview</span></label>
          <label class="tm-check"><input id="tm-shadow" type="checkbox"><span>Soft ground shadow</span></label>
          <label class="tm-range"><span>Shadow strength</span><input id="tm-shadow-strength" type="range" min="0" max="1" step="0.05" value="0.3"></label>
        </fieldset>
        <div class="tm-actions"><button id="tm-reset" class="tm-btn tm-btn--secondary" type="button">Reset view</button><button id="tm-replace" class="tm-btn tm-btn--secondary" type="button">Replace model</button><button id="tm-download" class="tm-btn tm-btn--primary tm-download" type="button">Download PNG</button></div>
        <p class="tm-tip">The exported image uses the exact angle and zoom shown in the preview.</p>
      </aside>
    </section>`;
  return page;
}
