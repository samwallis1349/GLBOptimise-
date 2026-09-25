import './wizard-hero.css';
import manifest from './hero-manifest.json';
import { DOWNLOADS, EXPORT_BYTES, HERO_BASE, HERO_CONFIG, OPTIMISED, mb } from './config.js';

const ORIGINAL_TRIANGLES = manifest.lods[0].triangles;
const ORIGINAL_BYTES = EXPORT_BYTES[4][0];
const HINT = 'Five turns to simplify · Mesh to inspect · Reset to compare';

/**
 * Homepage hero: a free wizard model the visitor simplifies by dragging.
 * The section and its still poster render immediately; Three.js and the
 * model stream in afterwards (see WizardScene.js).
 *
 * @returns {{ element: HTMLElement, mount: () => () => void }}
 */
export function WizardHero() {
  const section = document.createElement('div');
  section.className = 'wizard-hero';
  section.dataset.layoutEditable = '';
  section.dataset.layoutId = 'home-hero-visual';
  section.dataset.layoutName = 'Wizard Model';
  section.innerHTML = `
    <div class="wizard-hero__eyebrow">Prepare your next game asset</div>
    <div class="wizard-hero__stage" data-el="stage" style="--hero-bg: url('${HERO_BASE}background.webp')">
      <img class="wizard-hero__poster" src="${HERO_BASE}poster.webp" alt="" width="927" height="800" decoding="async" fetchpriority="high" />
      <div class="wizard-hero__stats" aria-live="polite">
        <b data-el="count">—</b><span class="wizard-hero__stats-label">Triangles</span>
        <span class="wizard-hero__reduction" data-el="reduction">Loading…</span>
        <span class="wizard-hero__minor">from ${ORIGINAL_TRIANGLES.toLocaleString('en-GB')} triangles</span>
        <span class="wizard-hero__glb" data-el="glb-size">— MB</span>
        <span class="wizard-hero__minor" data-el="glb-saving">GLB export · textures included</span>
        <div class="wizard-hero__meter"><i data-el="meter"></i></div>
      </div>
      <div class="wizard-hero__zoom" role="group" aria-label="Model zoom">
        <button type="button" data-el="zoom-out" aria-label="Zoom out">−</button>
        <button type="button" data-el="zoom-reset" aria-label="Reset zoom" title="Reset zoom">100%</button>
        <button type="button" data-el="zoom-in" aria-label="Zoom in">+</button>
      </div>
      <div class="wizard-hero__status" data-el="status" role="status">Loading the wizard…</div>
    </div>
    <div class="wizard-hero__controls">
      <button type="button" data-el="reset" disabled>Reset</button>
      <button type="button" class="wizard-hero__optimise" data-el="optimise" aria-pressed="false" title="Balanced preset: 25k triangles, tuned textures and Meshopt compression" disabled>✧ Optimise</button>
      <input type="range" data-el="detail" min="0" max="1" step="0.001" value="0" aria-label="Simplification: left is detailed, right is low polygon" disabled />
      <button type="button" data-el="wire" aria-pressed="false" disabled>Mesh</button>
    </div>
    <div class="wizard-hero__strip">
      <span><i></i>Geometry <b data-el="geometry-result">original</b></span>
      <span><i></i>GLB <b data-el="size-result">original</b></span>
      <span class="wizard-hero__textures" role="group" aria-label="Texture resolution" data-el="textures">
        <span>Textures</span>
        ${['1', '2', '4']
          .map((k) => `<label><input type="checkbox" name="wizard-texture" value="${k}" aria-label="${k}K textures" disabled />${k}K</label>`)
          .join('')}
      </span>
    </div>
    <p class="wizard-hero__hint" data-el="hint">${HINT}</p>
    <div class="wizard-hero__sample">
      <a class="wizard-hero__download" data-el="download" href="${HERO_BASE}${DOWNLOADS.standard.file}" download="${DOWNLOADS.standard.name}">
        <span class="wizard-hero__download-emblem" aria-hidden="true">✧</span>
        <span class="wizard-hero__download-copy"><strong><em>Grab your</em> free wizard</strong><small>Download GLB · Try the tools · Make some magic</small></span>
        <span class="wizard-hero__download-arrow" aria-hidden="true">→</span>
      </a>
      <div class="wizard-hero__note" data-el="download-note"></div>
      <a class="wizard-hero__compare" href="/wizard-compare">Compare texture + mesh optimisation →</a>
    </div>
  `;

  const el = Object.fromEntries([...section.querySelectorAll('[data-el]')].map((node) => [node.dataset.el, node]));
  const textureInputs = [...section.querySelectorAll('[name="wizard-texture"]')];

  function mount() {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const saveData = navigator.connection?.saveData === true;
    const defaultTextures = saveData ? HERO_CONFIG.saveDataTextures : HERO_CONFIG.defaultTextures;

    let scene = null;
    let disposed = false;
    let fullDetail = false;
    let fullDetailFailed = false;
    let textureChoice = null; // texture set on screen (null while preview uses 1K)
    let zoom = 1;
    let wire = false;
    let lastState = null;
    let statusTimer = 0;

    const setStatus = (text, { transient = false } = {}) => {
      clearTimeout(statusTimer);
      el.status.textContent = text;
      el.status.hidden = !text;
      if (transient && text) statusTimer = setTimeout(() => (el.status.hidden = true), 4000);
    };

    const checkTextures = (key) => textureInputs.forEach((input) => (input.checked = input.value === key));

    function setDownload(kind) {
      const d = DOWNLOADS[kind];
      el.download.href = HERO_BASE + d.file;
      el.download.download = d.name;
      el.download.setAttribute('aria-label', `Download ${kind === 'optimised' ? 'optimised' : 'free textured'} wizard GLB, ${mb(d.bytes)}`);
      el['download-note'].textContent = `${mb(d.bytes)} · ${d.note}`;
    }
    setDownload('standard');

    function renderStats(state) {
      lastState = state;
      const { triangles, displayedLod, desiredLod, optimised } = state;
      el.count.textContent = triangles ? triangles.toLocaleString('en-GB') : '—';
      const saving = triangles ? 100 * (1 - triangles / ORIGINAL_TRIANGLES) : 0;
      el.meter.style.width = `${saving}%`;

      if (!fullDetail) {
        el.reduction.textContent = fullDetailFailed ? 'Preview only' : 'Preview · full detail loading…';
        el['glb-size'].textContent = '— MB';
        el['glb-saving'].textContent = 'GLB export · textures included';
        el['geometry-result'].textContent = '…';
        el['size-result'].textContent = '…';
        return;
      }

      el.reduction.textContent =
        displayedLod !== desiredLod ? 'Loading next detail level…' : saving > 0 ? `${saving.toFixed(1)}% fewer triangles` : 'Original detail';
      el['geometry-result'].textContent = saving > 0 ? `−${saving.toFixed(1)}%` : 'original';

      const bytes = optimised ? OPTIMISED.bytes : EXPORT_BYTES[textureChoice]?.[displayedLod];
      if (!bytes) return;
      const saved = 100 * (1 - bytes / ORIGINAL_BYTES);
      el['glb-size'].textContent = `${mb(bytes, optimised ? 2 : 1)} GLB`;
      el['glb-saving'].textContent = `${saved.toFixed(1)}% smaller · ${optimised ? 'balanced' : `${textureChoice}K textures`}`;
      el['size-result'].textContent = saved > 0.05 ? `−${saved.toFixed(1)}%` : 'original';
    }

    function showOptimisedUI(on) {
      el.optimise.textContent = on ? '✓ Optimised' : '✧ Optimise';
      el.optimise.setAttribute('aria-pressed', String(on));
      el.hint.textContent = on ? OPTIMISED.summary : HINT;
      setDownload(on ? 'optimised' : 'standard');
      // Mixed resolutions: none of the uniform texture sizes applies.
      checkTextures(on ? null : textureChoice);
    }

    function leaveOptimised() {
      if (!scene) return;
      scene.leaveOptimised();
      showOptimisedUI(false);
      el.optimise.disabled = false;
    }

    function setZoom(value) {
      const { min, max } = HERO_CONFIG.zoom;
      zoom = Math.max(min, Math.min(max, Math.round(value * 100) / 100));
      el['zoom-reset'].textContent = `${Math.round(zoom * 100)}%`;
      el['zoom-out'].disabled = zoom <= min;
      el['zoom-in'].disabled = zoom >= max;
      scene?.setZoom(zoom);
    }
    setZoom(1);

    let textureRequest = 0;
    async function chooseTextures(key) {
      leaveOptimised();
      const request = ++textureRequest;
      checkTextures(key);
      el.textures.setAttribute('aria-busy', 'true');
      if (key === '4') setStatus(`Loading 4K textures (${mb(manifest.textureBytes[4], 1)})…`);
      try {
        const applied = await scene.setTextures(key);
        if (!applied || disposed) return;
        textureChoice = key;
        if (request === textureRequest) setStatus('');
        if (lastState) renderStats(lastState);
      } catch (error) {
        console.error(error);
        if (request !== textureRequest) return;
        checkTextures(textureChoice);
        setStatus('Could not load that texture size. Please try again.', { transient: true });
      } finally {
        if (request === textureRequest) el.textures.removeAttribute('aria-busy');
      }
    }

    // ------------------------------------------------------------ wiring

    const zoomStep = HERO_CONFIG.zoom.step;
    el['zoom-in'].onclick = () => setZoom(zoom + zoomStep);
    el['zoom-out'].onclick = () => setZoom(zoom - zoomStep);
    el['zoom-reset'].onclick = () => setZoom(1);

    textureInputs.forEach((input) => {
      input.onchange = () => chooseTextures(input.value);
    });

    el.detail.addEventListener('input', () => {
      leaveOptimised();
      scene?.setTarget(Number(el.detail.value));
    });

    el.wire.onclick = () => {
      wire = !wire;
      el.wire.setAttribute('aria-pressed', String(wire));
      scene?.setWireframe(wire);
    };

    el.reset.onclick = () => {
      if (!scene) return;
      textureRequest++; // drop any texture request still in flight
      setStatus('');
      scene.reset();
      showOptimisedUI(false);
      el.optimise.disabled = false;
      el.detail.value = '0';
      setZoom(1);
      if (textureChoice !== defaultTextures) chooseTextures(defaultTextures);
      else el.textures.removeAttribute('aria-busy');
    };

    let optimiseRequest = 0;
    el.optimise.onclick = async () => {
      if (!scene) return;
      if (scene.optimised) {
        leaveOptimised();
        return;
      }
      const request = ++optimiseRequest;
      textureRequest++; // a pending texture change must not land on top of the preset
      el.textures.removeAttribute('aria-busy');
      setStatus('');
      el.optimise.disabled = true;
      el.optimise.textContent = 'Applying…';
      try {
        const applied = await scene.applyOptimised();
        if (disposed || request !== optimiseRequest) return;
        if (applied) showOptimisedUI(true);
        else showOptimisedUI(false);
      } catch (error) {
        console.error(error);
        if (request !== optimiseRequest) return;
        showOptimisedUI(false);
        el.hint.textContent = 'Could not apply the preset. Try Optimise again.';
      } finally {
        if (request === optimiseRequest) el.optimise.disabled = false;
      }
    };

    // ------------------------------------------------------------ loading

    const stage = el.stage;
    const fail = (message, error) => {
      if (error) console.error(error);
      if (disposed) return;
      stage.classList.add('is-failed');
      setStatus(message);
    };

    (async () => {
      let createWizardScene;
      try {
        ({ createWizardScene } = await import('./WizardScene.js'));
      } catch (error) {
        return fail('3D preview unavailable. The free download below still works.', error);
      }
      if (disposed) return;
      try {
        scene = createWizardScene({
          stage,
          manifest,
          reducedMotion,
          onChange: renderStats,
          onTarget: (target) => {
            el.detail.value = String(target);
          },
        });
      } catch (error) {
        return fail('This browser cannot start 3D graphics. The free download below still works.', error);
      }
      scene.setZoom(zoom);

      // 1. Small preview (25k triangles, 1K textures ≈ 1.6 MB) so the hero is
      //    interactive quickly.
      try {
        await Promise.all([scene.loadPreview(), scene.setTextures('1')]);
      } catch (error) {
        return fail('Could not load the wizard. The free download below still works.', error);
      }
      if (disposed) return;
      stage.classList.add('is-live');
      el.wire.disabled = false;
      setStatus('');

      // 2. Full detail + the default texture set.
      try {
        await Promise.all([scene.loadFullDetail(), scene.setTextures(defaultTextures)]);
      } catch (error) {
        console.error(error);
        if (disposed) return;
        fullDetailFailed = true;
        if (lastState) renderStats(lastState);
        setStatus('Full detail could not load. Reload the page to try again.');
        return;
      }
      if (disposed) return;
      fullDetail = true;
      textureChoice = defaultTextures;
      checkTextures(textureChoice);
      textureInputs.forEach((input) => (input.disabled = false));
      el.detail.disabled = false;
      el.reset.disabled = false;
      el.optimise.disabled = false;
      if (lastState) renderStats(lastState);
    })();

    return () => {
      disposed = true;
      clearTimeout(statusTimer);
      scene?.dispose();
    };
  }

  return { element: section, mount };
}
