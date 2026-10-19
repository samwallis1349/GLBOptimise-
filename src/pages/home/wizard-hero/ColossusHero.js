import './colossus-hero.css';

/**
 * Homepage hero: the Rusted Colossus on a slow turntable, with the full model
 * offered as a free download underneath.
 *
 * A still (public/hero/poster.webp) shows at once, so every visitor sees him
 * whatever their browser can do. The 3D version loads on top and fades in
 * after its first frame. It is skipped, and the still stays, when WebGL is
 * unavailable, the visitor asked for reduced motion or Data Saver, or loading
 * fails. Visitors can drag to turn him.
 *
 * public/hero/colossus-web.glb (~2 MB) and the download are both built by
 * scripts/hero/build-colossus-web.mjs.
 */
const MODEL_URL = '/hero/colossus-web.glb';
const DOWNLOAD_URL = '/hero/downloads/rusted-colossus.glb';
const DOWNLOAD_NAME = 'assetbench-rusted-colossus.glb';
const DOWNLOAD_NOTE = '7 MB · 328k triangles · 2K textures · Free to use';
/** Turntable speed, radians per second. */
const SPIN_SPEED = 0.35;

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Why the 3D version should not load, or null when it should. */
function reasonToStayStill() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'reduced motion';
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return 'data saver';
  if (!webglAvailable()) return 'no WebGL';
  return null;
}

export function ColossusHero() {
  const section = document.createElement('section');
  section.className = 'colossus-hero';
  section.dataset.layoutEditable = '';
  section.dataset.layoutId = 'home-hero-visual';
  section.dataset.layoutName = 'Rusted Colossus';
  section.innerHTML = `
    <div class="colossus-hero__eyebrow">Free model</div>
    <div class="colossus-hero__stage" data-el="stage">
      <picture class="colossus-hero__poster" data-el="poster">
        <img src="/hero/poster.webp" width="927" height="800" decoding="async" fetchpriority="high"
          alt="The Rusted Colossus, a battered walking robot built from an old camper van">
      </picture>
      <button type="button" class="colossus-hero__play" data-el="play" hidden><span aria-hidden="true">▶</span> View in 3D</button>
    </div>
    <p class="colossus-hero__caption">The Rusted Colossus <span>·</span> drag to turn him</p>
    <p class="colossus-hero__proof">Shrunk for this page with our own tools: <b>11 MB → 1.9 MB</b>, <b>328k → 115k triangles</b>. <a href="/optimise-glb">Try it on yours →</a></p>
    <form class="colossus-hero__download" id="free-model" data-el="download">
      <input type="email" name="email" placeholder="Email for more free models (optional)" autocomplete="email" aria-label="Email address, optional">
      <button type="submit" class="btn btn--secondary">Download free GLB ↓</button>
      <span class="colossus-hero__download-note">${DOWNLOAD_NOTE}</span>
    </form>
  `;

  // The download never waits on the email: it's saved in the background (worker /api/subscribe).
  const form = section.querySelector('[data-el="download"]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = form.email.value.trim();
    if (email) {
      fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, source: 'colossus-download' }), keepalive: true }).catch(() => {});
      form.email.value = '';
      form.email.placeholder = "Thanks, you're on the list";
    }
    const link = document.createElement('a');
    link.href = DOWNLOAD_URL;
    link.download = DOWNLOAD_NAME;
    document.body.append(link);
    link.click();
    link.remove();
  });

  const stage = section.querySelector('[data-el="stage"]');
  const poster = section.querySelector('[data-el="poster"]');
  const play = section.querySelector('[data-el="play"]');

  function mount() {
    let disposed = false;
    let renderer;
    let frameId = 0;
    let resizeObserver;
    let visibilityObserver;
    let visible = true;
    let previousTime = 0;
    const showStill = () => {
      stage.classList.remove('is-live');
      poster.hidden = false;
    };

    // When he stays still (reduced motion, Data Saver, or a failed load),
    // the visitor can still choose to load the 3D version.
    const offerPlay = (label) => {
      play.lastChild.textContent = ` ${label}`;
      play.hidden = false;
    };
    play.onclick = () => {
      play.hidden = true;
      start();
    };

    const still = reasonToStayStill();
    if (still) {
      stage.dataset.mode = `still: ${still}`;
      if (still !== 'no WebGL') offerPlay('View in 3D');
    } else {
      start();
    }

    async function start() {
      try {
        const [THREE, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/libs/meshopt_decoder.module.js'),
        ]);
        if (disposed) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
        camera.position.set(0, 0.15, 5.3);
        camera.lookAt(0, 0, 0);
        scene.add(new THREE.HemisphereLight(0xfff1dc, 0x4a3a26, 2.4));
        const key = new THREE.DirectionalLight(0xffe0aa, 3.2);
        key.position.set(-3, 4, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffc670, 2.1);
        rim.position.set(3, 2, -3);
        scene.add(rim);

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        renderer.domElement.className = 'colossus-hero__canvas';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        // A lost GPU context (driver reset, too many tabs) falls back to the still.
        renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); showStill(); });
        stage.append(renderer.domElement);

        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(MODEL_URL);
        if (disposed) {
          gltf.scene.traverse((node) => {
            node.geometry?.dispose();
            for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
              material?.dispose();
            }
          });
          return;
        }

        // The model is metallic with no environment map to reflect, so it
        // would render near-black; keep it mostly diffuse.
        gltf.scene.traverse((node) => {
          if (node.material) node.material.metalness = Math.min(node.material.metalness, 0.25);
        });

        const model = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = 2.9 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        const turntable = new THREE.Group();
        turntable.add(model);
        scene.add(turntable);

        // Drag to turn; the turntable resumes on release.
        let dragX = null;
        const canvas = renderer.domElement;
        canvas.addEventListener('pointerdown', (event) => { dragX = event.clientX; canvas.setPointerCapture(event.pointerId); });
        canvas.addEventListener('pointermove', (event) => {
          if (dragX === null) return;
          turntable.rotation.y += (event.clientX - dragX) * 0.01;
          dragX = event.clientX;
        });
        const release = () => { dragX = null; };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);

        const resize = () => {
          const { width, height } = stage.getBoundingClientRect();
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          // Resizing clears the canvas; redraw now, as the loop may be paused off screen.
          renderer.render(scene, camera);
        };
        if ('ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(stage);
        } else {
          window.addEventListener('resize', resize);
        }
        resize();

        // Only animate while he is on screen: saves battery once the visitor scrolls on.
        if ('IntersectionObserver' in window) {
          visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
          visibilityObserver.observe(stage);
        }

        let shown = false;
        const tick = (time) => {
          if (disposed) return;
          frameId = requestAnimationFrame(tick);
          const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
          previousTime = time;
          if (!visible && shown) return;
          if (dragX === null) turntable.rotation.y += delta * SPIN_SPEED;
          renderer.render(scene, camera);
          if (!shown) {
            shown = true;
            stage.classList.add('is-live');
            stage.dataset.mode = 'live';
            // The still stays underneath until the fade has finished.
            setTimeout(() => { if (!disposed && stage.classList.contains('is-live')) poster.hidden = true; }, 600);
          }
        };
        frameId = requestAnimationFrame(tick);
      } catch (error) {
        if (disposed) return;
        console.warn('Colossus stays still: the 3D version could not load.', error);
        stage.dataset.mode = 'still: load failed';
        renderer?.dispose();
        renderer?.domElement.remove();
        showStill();
        offerPlay('Try again');
      }
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }

  return { element: section, mount };
}
