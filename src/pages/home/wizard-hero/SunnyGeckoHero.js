import './sunny-gecko-hero.css';

/** Animated homepage mascot, using the Walking clip bundled with Sunny's GLB. */
export function SunnyGeckoHero() {
  const section = document.createElement('section');
  section.className = 'sunny-hero';
  section.dataset.layoutEditable = '';
  section.dataset.layoutId = 'home-hero-visual';
  section.dataset.layoutName = 'Sunny the Gecko';
  section.innerHTML = `
    <div class="sunny-hero__eyebrow">Meet Sunny</div>
    <div class="sunny-hero__stage" data-el="stage" aria-label="Sunny the gecko walking">
      <div class="sunny-hero__glow" aria-hidden="true"></div>
      <p class="sunny-hero__status" data-el="status" role="status">Sunny is stretching his legs…</p>
    </div>
    <p class="sunny-hero__caption">Sunny the Gecko <span>·</span> always exploring</p>
  `;

  const stage = section.querySelector('[data-el="stage"]');
  const status = section.querySelector('[data-el="status"]');

  function mount() {
    let disposed = false;
    let renderer;
    let mixer;
    let frameId = 0;
    let observer;
    let previousTime = 0;

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

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.domElement.className = 'sunny-hero__canvas';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        stage.prepend(renderer.domElement);

        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync('/hero/sunny-gecko.glb');
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
        status.hidden = true;
        stage.classList.add('is-live');

        const resize = () => {
          const { width, height } = stage.getBoundingClientRect();
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        observer = new ResizeObserver(resize);
        observer.observe(stage);
        resize();

        const tick = (time) => {
          if (disposed) return;
          frameId = requestAnimationFrame(tick);
          const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
          previousTime = time;
          mixer?.update(delta);
          renderer.render(scene, camera);
        };
        frameId = requestAnimationFrame(tick);
      } catch (error) {
        if (disposed) return;
        console.error('Could not load Sunny the Gecko:', error);
        status.textContent = 'Sunny will be back in a moment.';
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }

  return { element: section, mount };
}
