import { PACK_PBR_CONFIG } from './config.js';

export function PackPBRPage() {
  const page = document.createElement('main');
  page.className = 'pbr-page';
  page.innerHTML = `
    <section class="pbr-hero">
      <div><p class="pbr-eyebrow">Material pipeline utility</p><h1>Pack <span>PBR</span></h1>
        <p>Combine grayscale material maps into one GPU-friendly texture. Build ORM, RMA, Unity mask maps—or route every RGBA channel yourself.</p></div>
      <div class="pbr-local"><i></i>Private · browser-only processing</div>
    </section>

    <div id="pbr-notice" class="pbr-notice" hidden></div>
    <section class="pbr-panel pbr-generator">
      <header><span class="pbr-num">AI</span><div><h2>Image to PBR material</h2><p>Turn one surface image into a complete editable texture set</p></div><span class="pbr-beta">LOCAL GENERATOR</span></header>
      <div class="pbr-gen-body">
        <div id="pbr-gen-drop" class="pbr-gen-drop" tabindex="0" role="button">
          <input id="pbr-gen-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <img id="pbr-gen-image" alt="Source material" hidden>
          <div id="pbr-gen-empty"><b>+</b><strong>Add a surface image</strong><span>Brick, stone, wood, fabric, ground or another mostly flat material</span></div>
        </div>
        <div class="pbr-gen-controls">
          <label><span>Height detail <output id="pbr-detail-value">100%</output></span><input id="pbr-detail" type="range" min="25" max="250" value="100"></label>
          <label><span>Normal strength <output id="pbr-normal-value">150%</output></span><input id="pbr-normal" type="range" min="25" max="400" value="150"></label>
          <label><span>Surface roughness <output id="pbr-rough-value">70%</output></span><input id="pbr-rough" type="range" min="0" max="100" value="70"></label>
          <label><span>Metallic threshold <output id="pbr-metal-value">95%</output></span><input id="pbr-metal" type="range" min="0" max="100" value="95"></label>
          <label><span>AO strength <output id="pbr-ao-value">100%</output></span><input id="pbr-ao" type="range" min="0" max="250" value="100"></label>
          <label class="pbr-gen-select"><span>Generated resolution</span><select id="pbr-gen-size"><option value="source">Source size · max 2K</option><option value="2048">2048 square</option><option value="1024">1024 square</option><option value="512">512 square</option></select></label>
          <button id="pbr-generate" class="pbr-primary" type="button" disabled>Generate PBR maps</button>
        </div>
      </div>
      <div id="pbr-generated" class="pbr-generated" hidden></div>
      <div id="pbr-gen-actions" class="pbr-gen-actions" hidden><span>Generated maps have been loaded into the packer below.</span><button id="pbr-download-set" type="button">Download material ZIP</button></div>
    </section>
    <section class="pbr-grid">
      <div class="pbr-left">
        <section class="pbr-panel">
          <header><span class="pbr-num">01</span><div><h2>Source maps</h2><p>Drop grayscale maps into their semantic slots</p></div><button id="pbr-clear" class="pbr-quiet" type="button">Clear</button></header>
          <div class="pbr-slots">
            ${PACK_PBR_CONFIG.sources.map((source) => `
              <article class="pbr-slot" data-slot="${source.id}" tabindex="0" role="button">
                <input type="file" accept="image/png,image/jpeg,image/webp" data-file="${source.id}" hidden>
                <div class="pbr-slot-preview"><span>${source.short}</span><img alt="" hidden></div>
                <div class="pbr-slot-copy"><strong>${source.label}</strong><span class="pbr-slot-hint">${source.hint}</span><span class="pbr-slot-meta">Drop or click to add</span></div>
                <button class="pbr-remove" data-remove="${source.id}" type="button" aria-label="Remove ${source.label}" hidden>×</button>
              </article>`).join('')}
          </div>
        </section>

        <section class="pbr-panel">
          <header><span class="pbr-num">02</span><div><h2>Channel layout</h2><p>Start with a preset, then customise any channel</p></div></header>
          <div id="pbr-presets" class="pbr-presets">
            ${Object.entries(PACK_PBR_CONFIG.presets).map(([id, preset], index) => `<button type="button" data-preset="${id}" class="${index === 0 ? 'is-active' : ''}">${preset.label}</button>`).join('')}
          </div>
          <div class="pbr-channels">
            ${['R', 'G', 'B', 'A'].map((channel, index) => `
              <div class="pbr-channel pbr-channel--${channel.toLowerCase()}">
                <span class="pbr-channel-key">${channel}</span>
                <select data-channel="${index}" aria-label="${channel} channel source">
                  <option value="ao">Ambient Occlusion</option><option value="roughness">Roughness</option>
                  <option value="metallic">Metallic</option><option value="height">Height / Detail</option>
                  <option value="white">Constant white</option><option value="black">Constant black</option>
                </select>
                <label><input type="checkbox" data-invert="${index}"> Invert</label>
              </div>`).join('')}
          </div>
        </section>
      </div>

      <aside class="pbr-right">
        <section class="pbr-panel pbr-output">
          <header><span class="pbr-num">03</span><div><h2>Output</h2><p>Inspect and export the packed texture</p></div></header>
          <div class="pbr-preview-wrap">
            <canvas id="pbr-preview" width="512" height="512"></canvas>
            <div id="pbr-empty" class="pbr-empty"><strong>RGBA</strong><span>Your packed texture will appear here</span></div>
            <div id="pbr-preview-labels"><b>R</b><b>G</b><b>B</b><b>A</b></div>
          </div>
          <div class="pbr-controls">
            <label><span>Resolution</span><select id="pbr-resolution"><option value="largest">Largest source</option><option value="smallest">Smallest source</option><option value="4096">4096 × 4096</option><option value="2048">2048 × 2048</option><option value="1024">1024 × 1024</option><option value="512">512 × 512</option></select></label>
            <label><span>Filename</span><input id="pbr-name" type="text" value="material_orm" maxlength="80"></label>
          </div>
          <div id="pbr-summary" class="pbr-summary"><span>Waiting for source maps</span></div>
          <button id="pbr-pack" class="pbr-primary" type="button" disabled>Pack channels</button>
          <button id="pbr-download" class="pbr-download" type="button" hidden>Download lossless PNG</button>
        </section>
        <section class="pbr-guidance">
          <h3>Engine notes</h3>
          <p><strong>glTF / Unreal ORM</strong> uses AO in red, roughness in green, metallic in blue.</p>
          <p><strong>Unity HDRP mask</strong> uses metallic in red, AO in green and smoothness (inverted roughness) in alpha.</p>
          <p>Grayscale values are read as luminance. Inputs are resampled to one output resolution.</p>
        </section>
      </aside>
    </section>
  `;
  return page;
}
