import './thumbnail-maker.css';

export function ThumbnailMakerPage() {
  const page = document.createElement('main');
  page.className = 'tm-page container section';
  page.innerHTML = `
    <header class="tm-hero">
      <div><p class="tm-eyebrow">Local 3D render utility</p><h1>Thumbnail <span>Maker</span></h1>
      <p>Frame a GLB, glTF or FBX in your browser and export a clean PNG. Your model never leaves this device.</p></div>
      <div class="tm-local"><span></span> 100% local processing</div>
    </header>
    <div id="tm-notice" class="tm-notice" role="status" hidden></div>
    <section id="tm-drop" class="tm-drop" role="button" tabindex="0">
      <input id="tm-file" type="file" accept=".glb,.gltf,.fbx" hidden>
      <div class="tm-drop__icon">◇</div><h2>Drop a 3D model here</h2><p>GLB, glTF or FBX · one model at a time</p>
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
          <label class="tm-field"><span>Background</span><select id="tm-background-mode"><option value="colour">Solid colour</option><option value="transparent">Transparent</option></select></label>
          <label id="tm-colour-field" class="tm-colour-field"><span>Colour</span><input id="tm-background" type="color" value="#111318"><output id="tm-background-value">#111318</output></label>
        </fieldset>
        <fieldset><legend>Presentation</legend>
          <label class="tm-field"><span>Lighting</span><select id="tm-lighting"><option value="studio" selected>Studio</option><option value="bright">Bright</option><option value="dramatic">Dramatic</option></select></label>
          <label class="tm-range"><span>Exposure <output id="tm-exposure-value">1.0</output></span><input id="tm-exposure" type="range" min="0.5" max="2" step="0.1" value="1"></label>
          <label class="tm-check"><input id="tm-grid" type="checkbox"><span>Show ground grid in preview</span></label>
        </fieldset>
        <div class="tm-actions"><button id="tm-reset" class="tm-btn tm-btn--secondary" type="button">Reset view</button><button id="tm-replace" class="tm-btn tm-btn--secondary" type="button">Replace model</button><button id="tm-download" class="tm-btn tm-btn--primary tm-download" type="button">Download PNG</button></div>
        <p class="tm-tip">The exported image uses the exact angle and zoom shown in the preview.</p>
      </aside>
    </section>`;
  return page;
}
