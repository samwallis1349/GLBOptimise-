import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { countUp, prefersReducedMotion } from './CountUp.js';

// The homepage demo asset (public/models/hero-demo.glb) ships uncompressed,
// so this deliberately skips wiring up DRACOLoader/MeshoptDecoder — unlike
// the per-tool viewers, which must handle arbitrary user uploads. Keeping
// those (and their wasm payloads) out of the homepage's JS graph matters
// here, since the hero loads on every visit.

/**
 * The homepage hero's interactive GLB presentation: a real model, loaded
 * once, rendered through a single Three.js render loop. Combines:
 *  - a slow showroom auto-rotate (via OrbitControls' own autoRotate, which
 *    already pauses while the user is dragging) that resumes a few seconds
 *    after the user lets go,
 *  - a draggable textured/wireframe split, implemented as two scissored
 *    render passes of the SAME scene/camera/frame with the mesh materials
 *    swapped between passes — never two separate model instances, so the
 *    two halves can never drift out of alignment,
 *  - a one-time entrance reveal (wireframe in, then the model's real
 *    materials), skipped under prefers-reduced-motion,
 *  - genuine stats read from the loaded file (triangle count, mesh count,
 *    byte size) — there is no "before/after" here, just one real asset, so
 *    only one set of real numbers is ever shown.
 *
 * @param {{ canvasHost: HTMLElement, divider: HTMLElement, statsEl: HTMLElement, sweepEl: HTMLElement, root: HTMLElement }} els
 * @returns {() => void} dispose
 */
export function mountHeroReveal(els) {
  const { canvasHost, divider, statsEl, sweepEl, root } = els;

  const scene = new THREE.Scene();
  const pivot = new THREE.Group();
  scene.add(pivot);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
  camera.position.set(1.6, 1.1, 2.1);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  canvasHost.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 6, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(-5, 2, -3);
  scene.add(fill);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.3;
  controls.maxDistance = 12;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 1.8; // ~33s per revolution at 60fps

  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb547,
    wireframe: true,
    transparent: true,
    opacity: 1,
    depthTest: true,
  });

  let meshes = [];
  let modelLoaded = false;
  let introStart = null;
  let introDone = prefersReducedMotion();
  let resumeTimer = null;
  let running = false;
  let rafId = null;
  let disposed = false;
  let splitPercent = 50;
  let dragging = false;

  const INTRO_DURATION = 1200;
  const RESUME_DELAY = 4000;

  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    if (resumeTimer) clearTimeout(resumeTimer);
  });
  controls.addEventListener('end', () => {
    if (prefersReducedMotion()) return;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, RESUME_DELAY);
  });

  // ---------------------------------------------------------------- load

  const loader = new GLTFLoader();
  const MODEL_URL = `${import.meta.env.BASE_URL || '/'}models/hero-demo.glb`;

  fetch(MODEL_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.arrayBuffer();
    })
    .then(
      (buffer) =>
        new Promise((resolve, reject) => {
          loader.parse(buffer, '', resolve, reject);
          statsEl.dataset.bytes = String(buffer.byteLength);
        })
    )
    .then((gltf) => {
      if (disposed) return;
      pivot.add(gltf.scene);
      meshes = [];
      gltf.scene.traverse((node) => {
        if (node.isMesh) meshes.push({ mesh: node, original: node.material });
      });
      frameCamera(gltf.scene);
      renderStats(Number(statsEl.dataset.bytes || 0));
      modelLoaded = true;
      introStart = performance.now();
      // Reduced motion skips the animated intro (introDone is already true)
      // but must NOT auto-rotate either — manual orbit stays available,
      // the automatic showroom spin does not.
      startLoop();
    })
    .catch((err) => {
      console.warn('[AssetBench] Hero model failed to load.', err);
      statsEl.classList.add('hidden');
    });

  function frameCamera(object3d) {
    const box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = (sphere.radius / Math.sin(((camera.fov * Math.PI) / 180) / 2)) * 1.15;
    const dir = new THREE.Vector3(0.8, 0.5, 1).normalize();
    camera.position.copy(sphere.center.clone().add(dir.multiplyScalar(distance)));
    camera.near = Math.max(distance / 100, 0.01);
    camera.far = distance * 50;
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.minDistance = distance * 0.3;
    controls.maxDistance = distance * 3;
    controls.update();
  }

  function renderStats(byteLength) {
    let tris = 0;
    for (const { mesh } of meshes) {
      const geom = mesh.geometry;
      const index = geom.getIndex();
      const count = index ? index.count : geom.getAttribute('position')?.count || 0;
      tris += Math.floor(count / 3);
    }
    const mb = byteLength / (1024 * 1024);
    const trisEl = statsEl.querySelector('[data-stat="tris"]');
    const sizeEl = statsEl.querySelector('[data-stat="size"]');
    const meshEl = statsEl.querySelector('[data-stat="meshes"]');
    if (trisEl) countUp(trisEl, 0, tris, { duration: 700 });
    if (sizeEl) sizeEl.textContent = `${mb.toFixed(1)} MB`;
    if (meshEl) meshEl.textContent = String(meshes.length);
    statsEl.classList.remove('hidden');
  }

  // -------------------------------------------------------------- divider

  function setSplit(pct) {
    splitPercent = Math.max(4, Math.min(96, pct));
    divider.style.left = `${splitPercent}%`;
  }
  setSplit(50);

  function onDividerDown(e) {
    dragging = true;
    divider.setPointerCapture(e.pointerId);
    divider.classList.add('is-dragging');
  }
  function onDividerMove(e) {
    if (!dragging) return;
    const rect = root.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplit(pct);
  }
  function onDividerUp(e) {
    dragging = false;
    divider.classList.remove('is-dragging');
    try {
      divider.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
  }
  divider.addEventListener('pointerdown', onDividerDown);
  divider.addEventListener('pointermove', onDividerMove);
  divider.addEventListener('pointerup', onDividerUp);
  divider.addEventListener('pointercancel', onDividerUp);

  // --------------------------------------------------------------- resize

  function onResize() {
    const { clientWidth, clientHeight } = canvasHost;
    if (!clientWidth || !clientHeight) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight, false);
  }
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(canvasHost);
  onResize();

  // ----------------------------------------------------------- intersection

  let inView = true;
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      if (inView) startLoop();
    },
    { threshold: 0.05 }
  );
  intersectionObserver.observe(root);

  function onVisibilityChange() {
    if (!document.hidden) startLoop();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // -------------------------------------------------------------- render

  function setMaterials(mat) {
    for (const { mesh, original } of meshes) {
      mesh.material = mat || original;
    }
  }

  function renderSplitFrame() {
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    if (!w || !h) return;

    // The intro sequence animates wireMaterial's opacity/blending down to
    // zero as it crossfades into the textured reveal; reset both before
    // reusing the same material for the ongoing wireframe half.
    wireMaterial.opacity = 1;
    wireMaterial.blending = THREE.NormalBlending;

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.clear();

    const splitX = Math.round((splitPercent / 100) * w);

    renderer.setScissorTest(true);
    if (splitX > 0) {
      renderer.setScissor(0, 0, splitX, h);
      renderer.setViewport(0, 0, w, h);
      setMaterials(null);
      renderer.render(scene, camera);
    }
    if (splitX < w) {
      renderer.setScissor(splitX, 0, w - splitX, h);
      renderer.setViewport(0, 0, w, h);
      setMaterials(wireMaterial);
      renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
  }

  function renderIntroFrame(t) {
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    if (!w || !h) return;
    renderer.setViewport(0, 0, w, h);
    renderer.clear();

    if (t < 650) {
      // Fade in, then brighten a wireframe-only view.
      const opacity = t < 300 ? (t / 300) * 0.5 : 0.5 + ((t - 300) / 350) * 0.5;
      wireMaterial.opacity = Math.min(1, opacity);
      setMaterials(wireMaterial);
      renderer.render(scene, camera);
    } else if (t < 1050) {
      // Crossfade: real materials underneath, wireframe fading out on top.
      setMaterials(null);
      renderer.render(scene, camera);
      const fade = 1 - (t - 650) / 400;
      wireMaterial.opacity = Math.max(0, fade);
      wireMaterial.blending = THREE.AdditiveBlending;
      setMaterials(wireMaterial);
      renderer.render(scene, camera);
      wireMaterial.blending = THREE.NormalBlending;
    } else {
      setMaterials(null);
      renderer.render(scene, camera);
      if (!sweepEl.classList.contains('is-swept')) {
        sweepEl.classList.add('is-swept');
        setTimeout(() => sweepEl.classList.remove('is-swept'), 260);
      }
    }
  }

  function frame(now) {
    rafId = null;
    if (disposed || !running) return;
    if (document.hidden || !inView) {
      running = false;
      return;
    }

    controls.update();

    if (modelLoaded) {
      if (!introDone) {
        const t = now - introStart;
        if (t >= INTRO_DURATION) {
          introDone = true;
          controls.autoRotate = true;
          renderSplitFrame();
        } else {
          renderIntroFrame(t);
        }
      } else {
        renderSplitFrame();
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (running || disposed) return;
    running = true;
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }

  startLoop();

  return function dispose() {
    disposed = true;
    running = false;
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (resumeTimer) clearTimeout(resumeTimer);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    divider.removeEventListener('pointerdown', onDividerDown);
    divider.removeEventListener('pointermove', onDividerMove);
    divider.removeEventListener('pointerup', onDividerUp);
    divider.removeEventListener('pointercancel', onDividerUp);

    controls.dispose();
    wireMaterial.dispose();
    for (const { mesh } of meshes) {
      mesh.geometry?.dispose?.();
      const mats = Array.isArray(mesh.original) ? mesh.original : [mesh.original];
      for (const m of mats) {
        if (!m) continue;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
          m[key]?.dispose?.();
        }
        m.dispose?.();
      }
    }
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  };
}
