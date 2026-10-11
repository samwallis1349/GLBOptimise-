import './sunny-gecko-hero.css';

/**
 * Animated homepage mascot, using the Walking clip bundled with Sunny's GLB.
 *
 * A still of Sunny (public/hero/sunny-poster.*, the same framing as the live
 * scene) shows at once, so every visitor sees him whatever their browser can
 * do. The 3D version loads on top and fades in after its first frame. It is
 * skipped entirely, and the still stays, when WebGL is unavailable, the
 * visitor asked for reduced motion or Data Saver, or loading fails.
 *
 * The model is public/hero/sunny-gecko-web.glb, a standards-valid ~2 MB copy
 * built by scripts/hero/build-sunny-web.mjs (JPEG textures, Walking clip only).
 */
const MODEL_URL = '/hero/sunny-gecko-web.glb';

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

export function SunnyGeckoHero() {
  const section = document.createElement('section');
  section.className = 'sunny-hero';
  section.dataset.layoutEditable = '';
  section.dataset.layoutId = 'home-hero-visual';
  section.dataset.layoutName = 'Sunny the Gecko';
  section.innerHTML = `
    <div class="sunny-hero__eyebrow">Meet Sunny</div>
    <div class="sunny-hero__stage" data-el="stage">
      <div class="sunny-hero__glow" aria-hidden="true"></div>
      <picture class="sunny-hero__poster" data-el="poster">
        <source srcset="/hero/sunny-poster.webp" type="image/webp">
        <img src="/hero/sunny-poster.png" width="1240" height="1069" decoding="async" fetchpriority="high"
          alt="Sunny the gecko, a cartoon lizard in sunglasses, a Hawaiian shirt and red trainers, walking with his tongue out">
      </picture>
    </div>
    <p class="sunny-hero__caption">Sunny the Gecko <span>·</span> always exploring</p>
  `;

  const stage = section.querySelector('[data-el="stage"]');
  const poster = section.querySelector('[data-el="poster"]');

  function mount() {
    let disposed = false;
    let renderer;
    let mixer;
    let frameId = 0;
    let resizeObserver;
    let visibilityObserver;
    let visible = true;
    let previousTime = 0;
    const showStill = () => {
      stage.classList.remove('is-live');
      poster.hidden = false;
    };

    const still = reasonToStayStill();
    if (still) {
      stage.dataset.mode = `still: ${still}`;
      return () => {};
    }

    (async () => {
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
        scene.add(new THREE.HemisphereLight(0xe0f4ff, 0x50402a, 2.3));
        const key = new THREE.DirectionalLight(0xffe0aa, 3.2);
        key.position.set(-3, 4, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x9bd7ce, 2.1);
        rim.position.set(3, 2, -3);
        scene.add(rim);

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.domElement.className = 'sunny-hero__canvas';
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

        const model = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = 2.9 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        scene.add(model);

        const walk = gltf.animations.find((clip) => /walk/i.test(clip.name));
        if (walk) {
          mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(walk).play();
        }

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

        // Only animate while Sunny is on screen: saves battery once the visitor scrolls on.
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
          mixer?.update(delta);
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
        console.warn('Sunny stays still: the 3D version could not load.', error);
        stage.dataset.mode = 'still: load failed';
        renderer?.domElement.remove();
        showStill();
      }
    })();

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
