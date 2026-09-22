import { TEXTURE_RESIZER_CONFIG } from './config.js';

export function TextureResizerPage() {
  const page = document.createElement('main');
  page.className = 'tr-page';
  page.innerHTML = `
    <section class="tr-hero">
      <div>
        <p class="tr-eyebrow">Texture pipeline utility</p>
        <h1>Texture <span>Resizer</span></h1>
        <p class="tr-lede">Prepare clean, game-ready textures without uploading your art. Resize, convert and package a whole batch in your browser.</p>
      </div>
      <div class="tr-privacy"><span></span> Local processing · files never leave your device</div>
    </section>

    <div id="tr-notice" class="tr-notice" role="status" hidden></div>

    <section id="tr-drop" class="tr-drop" tabindex="0" role="button" aria-label="Choose texture images">
      <input id="tr-file" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
      <div class="tr-drop-icon" aria-hidden="true">↥</div>
      <h2>Drop textures here</h2>
      <p>PNG, JPEG or WebP · up to ${TEXTURE_RESIZER_CONFIG.maxFiles} files · 32 MB each</p>
      <button id="tr-choose" class="tr-button tr-button--primary" type="button">Choose textures</button>
    </section>

    <section id="tr-workspace" class="tr-workspace" hidden>
      <aside class="tr-panel tr-settings">
        <div class="tr-panel-head">
          <div><span class="tr-step">01</span><h2>Output settings</h2></div>
          <button id="tr-add" class="tr-button tr-button--quiet" type="button">+ Add files</button>
        </div>

        <fieldset class="tr-fieldset">
          <legend>Texture size</legend>
          <div class="tr-size-grid">
            ${TEXTURE_RESIZER_CONFIG.sizePresets.map((size) => `<button class="tr-size${size === 2048 ? ' is-active' : ''}" type="button" data-size="${size}"><strong>${size >= 1024 ? `${size / 1024}K` : size}</strong><small>${size} px</small></button>`).join('')}
          </div>
          <label class="tr-field tr-custom-field">
            <span>Custom maximum edge</span>
            <input id="tr-custom-size" type="number" min="16" max="8192" step="1" placeholder="16–8192 px">
          </label>
        </fieldset>

        <fieldset class="tr-fieldset">
          <legend>Resize behaviour</legend>
          <label class="tr-field">
            <span>Fit mode</span>
            <select id="tr-fit">
              <option value="contain">Preserve aspect ratio</option>
              <option value="square">Force square</option>
            </select>
          </label>
          <label class="tr-check"><input id="tr-no-upscale" type="checkbox" checked><span><strong>Never upscale</strong><small>Keep small source textures sharp</small></span></label>
          <label class="tr-check"><input id="tr-pot" type="checkbox"><span><strong>Power-of-two dimensions</strong><small>Snap each edge down for broad engine support</small></span></label>
        </fieldset>

        <fieldset class="tr-fieldset">
          <legend>File output</legend>
          <label class="tr-field">
            <span>Format</span>
            <select id="tr-format">
              <option value="webp">WebP — smallest</option>
              <option value="png">PNG — lossless / alpha</option>
              <option value="jpeg">JPEG — universal</option>
            </select>
          </label>
          <label id="tr-quality-field" class="tr-field">
            <span>Quality <output id="tr-quality-value">85%</output></span>
            <input id="tr-quality" type="range" min="40" max="100" value="85">
          </label>
          <label class="tr-field">
            <span>Filename suffix</span>
            <input id="tr-suffix" type="text" value="_2k" maxlength="32" spellcheck="false">
          </label>
        </fieldset>

        <button id="tr-process" class="tr-button tr-button--primary tr-process" type="button">Resize <span id="tr-process-count">0 textures</span></button>
      </aside>

      <div class="tr-main">
        <section class="tr-panel">
          <div class="tr-panel-head">
            <div><span class="tr-step">02</span><h2>Texture queue</h2><span id="tr-queue-meta" class="tr-meta"></span></div>
            <button id="tr-clear" class="tr-button tr-button--quiet" type="button">Clear all</button>
          </div>
          <div id="tr-queue" class="tr-queue"></div>
        </section>

        <section id="tr-results-panel" class="tr-panel tr-results-panel" hidden>
          <div class="tr-panel-head">
            <div><span class="tr-step">03</span><h2>Ready to ship</h2><span id="tr-savings" class="tr-meta tr-meta--good"></span></div>
            <button id="tr-download-all" class="tr-button tr-button--primary" type="button">Download ZIP</button>
          </div>
          <div id="tr-results" class="tr-results"></div>
        </section>
      </div>
    </section>

    <section class="tr-tips" aria-label="Game texture guidance">
      <article><strong>Power-of-two</strong><span>Use POT textures for mipmaps, older hardware and predictable GPU memory.</span></article>
      <article><strong>Choose by role</strong><span>PNG suits normal/data maps; WebP or JPEG is ideal for opaque colour textures.</span></article>
      <article><strong>Budget by distance</strong><span>Reserve 4K for hero assets. Most props are comfortable at 1K–2K.</span></article>
    </section>
  `;
  return page;
}
