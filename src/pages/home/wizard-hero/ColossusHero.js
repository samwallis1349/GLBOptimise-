import './colossus-hero.css';

/**
 * Homepage hero: the Neon Cube Companion on a slow turntable, cycling through its
 * Mixamo animations (Walking → Running → Agree Gesture), with interactive clip pills
 * and the full rigged/animated model offered as a free download underneath.
 *
 * A still (public/hero/poster.webp) shows at once, so every visitor sees him
 * whatever their browser can do. The 3D version loads on top and fades in
 * after its first frame. It is skipped, and the still stays, when WebGL is
 * unavailable, the visitor asked for reduced motion or Data Saver, or loading
 * fails. Visitors can drag to turn him or click an animation pill to switch clips.
 *
 * public/hero/neon-cube-web.glb (~2.3 MB) and the download are both built by
 * scripts/hero/build-neon-cube-web.mjs.
 */
const MODEL_URL = '/hero/neon-cube-web.glb';
const DOWNLOAD_URL = '/hero/downloads/neon-cube-companion.glb';
const DOWNLOAD_NAME = 'assetbench-neon-cube-companion.glb';
const DOWNLOAD_NOTE = '5.2 MB · 109k triangles · Rigged + 3 Mixamo animations · Free to use';
/** Turntable speed, radians per second. */
const SPIN_SPEED = 0.32;
/** Seconds each animation plays before crossfading to the next in auto-cycle mode. */
const CYCLE_INTERVAL_SEC = 4.2;

const ANIM_LABELS = {
  Walking: 'Walk',
  Running: 'Run',
  Agree_Gesture: 'Agree Gesture',
};

function formatClipLabel(name) {
  return ANIM_LABELS[name] || String(name || 'Clip').replace(/_/g, ' ');
}

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
  section.dataset.layoutName = 'Neon Cube Companion';
  section.innerHTML = `
    <div class="colossus-hero__eyebrow">Free rigged &amp; animated model</div>
    <div class="colossus-hero__stage" data-el="stage">
      <picture class="colossus-hero__poster" data-el="poster">
        <img src="/hero/poster.webp" width="927" height="800" decoding="async" fetchpriority="high"
          alt="The Neon Cube Companion, a glowing sci-fi cube character with Mixamo animations">
      </picture>
      <div class="colossus-hero__anims" data-el="anims" hidden aria-label="Character animations"></div>
      <button type="button" class="colossus-hero__play" data-el="play" hidden><span aria-hidden="true">▶</span> View in 3D</button>
    </div>
    <p class="colossus-hero__caption">Neon Cube Companion <span>·</span> cycling animations (<b data-el="clip-name">Walking</b>) <span>·</span> drag to turn</p>
    <p class="colossus-hero__proof">Shrunk for this page with our own tools: <b>53.8 MB → 2.3 MB</b>, <b>198k → 59k triangles</b>, <b>3 animations</b> kept. <a href="/optimise-glb">Try it on yours →</a></p>
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
      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'neon-cube-download' }),
        keepalive: true,
      }).catch(() => {});
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
  const animsBar = section.querySelector('[data-el="anims"]');
  const clipNameEl = section.querySelector('[data-el="clip-name"]');

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
        camera.position.set(0, 0.12, 4.9);
        camera.lookAt(0, 0, 0);
        scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a4866, 2.5));
        const key = new THREE.DirectionalLight(0xffe0aa, 3.2);
        key.position.set(-3, 4, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x66b8ff, 2.3);
        rim.position.set(3, 2, -3);
        scene.add(rim);

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.domElement.className = 'colossus-hero__canvas';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        // A lost GPU context (driver reset, too many tabs) falls back to the still.
        renderer.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          showStill();
        });
        stage.append(renderer.domElement);

        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(MODEL_URL);
        if (disposed) {
          gltf.scene.traverse((node) => {
            node.geometry?.dispose();
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
              material?.dispose();
            }
          });
          return;
        }

        // Keep metallic surfaces readable without an HDR environment map.
        gltf.scene.traverse((node) => {
          if (node.material) node.material.metalness = Math.min(node.material.metalness, 0.3);
          if (node.isSkinnedMesh) node.frustumCulled = false;
        });

        const model = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = 2.65 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        const turntable = new THREE.Group();
        turntable.add(model);
        scene.add(turntable);

        // Set up AnimationMixer to cycle through all clips in the GLB.
        const clips = Array.isArray(gltf.animations) ? [...gltf.animations] : [];
        // Order nicely: Walking first, then Running, then Agree_Gesture (or whatever is present).
        const preferredOrder = ['Walking', 'Running', 'Agree_Gesture'];
        clips.sort((a, b) => {
          const ia = preferredOrder.indexOf(a.name);
          const ib = preferredOrder.indexOf(b.name);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

        let mixer = null;
        let currentClipIndex = 0;
        let currentAction = null;
        let cycleElapsed = 0;
        let autoCycle = true;

        const playClipAt = (index, crossfadeSec = 0.35) => {
          if (!mixer || !clips.length) return;
          currentClipIndex = ((index % clips.length) + clips.length) % clips.length;
          const clip = clips[currentClipIndex];
          const nextAction = mixer.clipAction(clip);
          nextAction.reset();
          nextAction.setLoop(THREE.LoopRepeat, Infinity);
          nextAction.play();
          if (currentAction && currentAction !== nextAction) {
            currentAction.crossFadeTo(nextAction, crossfadeSec, false);
          }
          currentAction = nextAction;
          cycleElapsed = 0;

          const label = formatClipLabel(clip.name);
          if (clipNameEl) clipNameEl.textContent = label;
          if (animsBar) {
            animsBar.querySelectorAll('[data-clip-idx]').forEach((btn) => {
              btn.setAttribute('aria-pressed', String(Number(btn.dataset.clipIdx) === currentClipIndex));
            });
            const cycleBtn = animsBar.querySelector('[data-cycle-toggle]');
            if (cycleBtn) {
              cycleBtn.setAttribute('aria-pressed', String(autoCycle));
              cycleBtn.textContent = autoCycle ? '⟳ Auto' : '⟳ Cycle';
            }
          }
        };

        if (clips.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          if (animsBar) {
            animsBar.innerHTML = `
              <button type="button" class="colossus-hero__anim-btn colossus-hero__anim-btn--cycle" data-cycle-toggle title="Cycle through all animations automatically" aria-pressed="true">⟳ Auto</button>
              ${clips
                .map(
                  (clip, idx) =>
                    `<button type="button" class="colossus-hero__anim-btn" data-clip-idx="${idx}" aria-pressed="${idx === 0}">${formatClipLabel(clip.name)}</button>`,
                )
                .join('')}
            `;
            animsBar.hidden = false;
            animsBar.querySelectorAll('[data-clip-idx]').forEach((btn) => {
              btn.addEventListener('click', () => {
                autoCycle = false;
                playClipAt(Number(btn.dataset.clipIdx), 0.3);
              });
            });
            animsBar.querySelector('[data-cycle-toggle]')?.addEventListener('click', () => {
              autoCycle = !autoCycle;
              if (autoCycle) playClipAt((currentClipIndex + 1) % clips.length, 0.35);
              else playClipAt(currentClipIndex, 0.1);
            });
          }
          playClipAt(0, 0);
        }

        // Drag to turn; the turntable resumes on release.
        let dragX = null;
        const canvas = renderer.domElement;
        canvas.addEventListener('pointerdown', (event) => {
          dragX = event.clientX;
          canvas.setPointerCapture(event.pointerId);
        });
        canvas.addEventListener('pointermove', (event) => {
          if (dragX === null) return;
          turntable.rotation.y += (event.clientX - dragX) * 0.01;
          dragX = event.clientX;
        });
        const release = () => {
          dragX = null;
        };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);

        const resize = () => {
          const { width, height } = stage.getBoundingClientRect();
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
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
          visibilityObserver = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          });
          visibilityObserver.observe(stage);
        }

        let shown = false;
        const tick = (time) => {
          if (disposed) return;
          frameId = requestAnimationFrame(tick);
          const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
          previousTime = time;
          if (!visible && shown) return;
          if (mixer) {
            mixer.update(delta);
            if (autoCycle && clips.length > 1) {
              cycleElapsed += delta;
              if (cycleElapsed >= CYCLE_INTERVAL_SEC) {
                playClipAt((currentClipIndex + 1) % clips.length, 0.4);
              }
            }
          }
          if (dragX === null) turntable.rotation.y += delta * SPIN_SPEED;
          renderer.render(scene, camera);
          if (!shown) {
            shown = true;
            stage.classList.add('is-live');
            stage.dataset.mode = 'live';
            // The still stays underneath until the fade has finished.
            setTimeout(() => {
              if (!disposed && stage.classList.contains('is-live')) poster.hidden = true;
            }, 600);
          }
        };
        frameId = requestAnimationFrame(tick);
      } catch (error) {
        if (disposed) return;
        console.warn('Hero character stays still: the 3D version could not load.', error);
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
