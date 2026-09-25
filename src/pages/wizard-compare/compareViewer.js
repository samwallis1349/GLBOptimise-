import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HERO_CONFIG } from '../home/wizard-hero/config.js';

/**
 * Minimal viewer for the compare page: same camera and lighting as the
 * homepage hero, one model on screen at a time, cached per URL.
 */
export function createCompareViewer(stage) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HERO_CONFIG.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const canvas = renderer.domElement;
  canvas.className = 'wizard-compare__canvas';
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, 0.01, 100);
  camera.position.set(0, 0.12, 5.4);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xc9e5ff, 0x665039, 2.4));
  const key = new THREE.DirectionalLight(0xffd99d, 3.5);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x90cddd, 2);
  rim.position.set(3, 2, -3);
  scene.add(rim);
  const pivot = new THREE.Group();
  scene.add(pivot);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cache = new Map();
  let disposed = false;
  let ticket = 0;

  function load(url) {
    if (!cache.has(url)) {
      const promise = loader.loadAsync(url).then((gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const group = new THREE.Group();
        const scale = HERO_CONFIG.modelHeight / size.y;
        group.scale.setScalar(scale);
        group.position.copy(center).multiplyScalar(-scale);
        group.add(gltf.scene);
        return group;
      });
      promise.catch(() => cache.delete(url));
      cache.set(url, promise);
    }
    return cache.get(url);
  }

  let dirty = true;
  let frameId = 0;
  const wake = () => {
    dirty = true;
    if (!frameId && !disposed) frameId = requestAnimationFrame(frame);
  };
  function frame() {
    frameId = 0;
    if (disposed || !dirty || document.hidden) return;
    dirty = false;
    renderer.render(scene, camera);
  }

  const resize = new ResizeObserver(() => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    wake();
  });
  resize.observe(stage);
  document.addEventListener('visibilitychange', wake);

  let dragging = false;
  let lastX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    pivot.rotation.y += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
    wake();
  });
  const release = () => (dragging = false);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.zoom = THREE.MathUtils.clamp(camera.zoom - e.deltaY * 0.001, HERO_CONFIG.zoom.min, HERO_CONFIG.zoom.max);
      camera.updateProjectionMatrix();
      wake();
    },
    { passive: false },
  );

  return {
    /** Resolves true once `url` is on screen, false if superseded. */
    async show(url) {
      const mine = ++ticket;
      const group = await load(url);
      if (disposed || mine !== ticket) return false;
      pivot.clear();
      pivot.add(group);
      wake();
      return true;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      resize.disconnect();
      document.removeEventListener('visibilitychange', wake);
      for (const promise of cache.values()) {
        promise
          .then((group) =>
            group.traverse((node) => {
              if (!node.isMesh) return;
              node.geometry.dispose();
              for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) node.material[k]?.dispose();
              node.material.dispose();
            }),
          )
          .catch(() => {});
      }
      renderer.dispose();
      canvas.remove();
    },
  };
}
