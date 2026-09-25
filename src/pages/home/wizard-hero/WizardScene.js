import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HERO_BASE, HERO_CONFIG, OPTIMISED } from './config.js';

const LOD_COUNT = 6;
const clamp = THREE.MathUtils.clamp;

/**
 * The wizard hero's Three.js side: one renderer, six precomputed detail
 * levels loaded on demand, shared texture sets, and the optional balanced
 * preset. It never decimates at runtime — switching between levels is
 * discrete — and every triangle count it reports is read from the mesh
 * actually on screen.
 *
 * Drag maps to "progress" (0 = full detail, 1 = lowest level) only once
 * full detail is available and the balanced preset is not applied; in every
 * other state dragging just spins the model (`spin`), so simplification
 * state can never drift away from what the slider shows.
 *
 * @param {{
 *   stage: HTMLElement,
 *   manifest: { bounds: { min: number[], max: number[] }, lods: { file: string, triangles: number }[], textures: Record<string, Record<string, string>> },
 *   reducedMotion: MediaQueryList,
 *   onChange: (state: SceneState) => void,
 *   onTarget: (target: number) => void,
 * }} options
 *
 * @typedef {{ displayedLod: number, desiredLod: number, triangles: number, optimised: boolean, simplifying: boolean }} SceneState
 */
export function createWizardScene({ stage, manifest, reducedMotion, onChange, onTarget }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HERO_CONFIG.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const canvas = renderer.domElement;
  canvas.className = 'wizard-hero__canvas';
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

  // Every level and the preset share the full-detail mesh's framing, so
  // switching never shifts the silhouette.
  const holder = new THREE.Group();
  {
    const min = new THREE.Vector3().fromArray(manifest.bounds.min);
    const max = new THREE.Vector3().fromArray(manifest.bounds.max);
    const scale = HERO_CONFIG.modelHeight / (max.y - min.y);
    holder.scale.setScalar(scale);
    holder.position.copy(min.add(max).multiplyScalar(-0.5 * scale));
  }
  pivot.add(holder);

  // One material for all six levels: a texture change is a single swap.
  // normalScale.y is flipped exactly as GLTFLoader does for meshes without
  // tangents, so the shared maps shade the same as the embedded originals.
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, metalness: 1, roughness: 1 });
  material.normalScale.set(1, -1);

  const fx = createFx(scene);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const textureLoader = new THREE.TextureLoader();

  /** @type {{ promise: Promise<THREE.Object3D> | null, object: THREE.Object3D | null }[]} */
  const lods = Array.from({ length: LOD_COUNT }, () => ({ promise: null, object: null }));
  const textureSets = new Map();
  let optimisedPromise = null;
  let optimisedObject = null;

  let disposed = false;
  let fullDetail = false;
  let optimised = false;
  let wireframe = false;
  let target = 0;
  let progress = 0;
  let velocity = 0;
  let spin = 0;
  let angularSpeed = 0;
  let lastRotation = 0;
  let displayed = -1;
  let dirty = true;
  let fxTime = 0;

  // ---------------------------------------------------------------- loading

  function loadLod(index) {
    const slot = lods[index];
    if (slot.promise) return slot.promise;
    slot.promise = loader
      .loadAsync(HERO_BASE + manifest.lods[index].file)
      .then((gltf) => {
        const object = gltf.scene;
        object.traverse((node) => {
          if (!node.isMesh) return;
          node.material.dispose();
          node.material = material;
        });
        if (disposed) {
          disposeObject(object);
          throw new Error('disposed');
        }
        object.visible = false;
        holder.add(object);
        slot.object = object;
        updateVisibility();
        return object;
      })
      .catch((error) => {
        slot.promise = null; // allow a later retry
        throw error;
      });
    return slot.promise;
  }

  function loadTextureSet(key) {
    if (textureSets.has(key)) return textureSets.get(key);
    const files = manifest.textures[key];
    const promise = Promise.all(
      ['map', 'normalMap', 'roughnessMap'].map((slot) => textureLoader.loadAsync(HERO_BASE + files[slot])),
    )
      .then(([map, normalMap, roughnessMap]) => {
        for (const texture of [map, normalMap, roughnessMap]) {
          texture.flipY = false;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        }
        map.colorSpace = THREE.SRGBColorSpace;
        return { map, normalMap, roughnessMap };
      })
      .catch((error) => {
        textureSets.delete(key);
        throw error;
      });
    textureSets.set(key, promise);
    return promise;
  }

  let appliedTextures = null;
  let textureTicket = 0;

  /** Resolves true once `key` is on screen, false if a newer request won. */
  async function setTextures(key) {
    const ticket = ++textureTicket;
    const set = await loadTextureSet(key);
    if (ticket !== textureTicket || disposed) return false;
    const previous = appliedTextures;
    material.map = set.map;
    material.normalMap = set.normalMap;
    material.roughnessMap = set.roughnessMap;
    material.metalnessMap = set.roughnessMap; // glTF packs roughness (G) + metalness (B)
    material.needsUpdate = true;
    appliedTextures = set;
    // Free the GPU copy of the set we left; the decoded image stays cached
    // so switching back is instant (it is simply re-uploaded).
    if (previous && previous !== set) for (const t of Object.values(previous)) t.dispose();
    dirty = true;
    return true;
  }

  function loadOptimised() {
    if (!optimisedPromise) {
      optimisedPromise = loader
        .loadAsync(HERO_BASE + OPTIMISED.file)
        .then((gltf) => {
          if (disposed) {
            disposeObject(gltf.scene, true);
            throw new Error('disposed');
          }
          gltf.scene.visible = false;
          gltf.scene.traverse((node) => {
            if (node.isMesh) node.material.wireframe = wireframe;
          });
          holder.add(gltf.scene);
          optimisedObject = gltf.scene;
          return gltf.scene;
        })
        .catch((error) => {
          optimisedPromise = null;
          throw error;
        });
    }
    return optimisedPromise;
  }

  let optimiseTicket = 0;

  /** Resolves true if the preset is now showing, false if superseded. */
  async function applyOptimised() {
    const ticket = ++optimiseTicket;
    await loadOptimised();
    if (ticket !== optimiseTicket || disposed) return false;
    optimised = true;
    // Park progress at the preset's level so the slider and stats agree.
    const parked = OPTIMISED.lod / (LOD_COUNT - 1);
    target = progress = parked;
    velocity = 0;
    onTarget(target);
    fx.flash(reducedMotion.matches);
    updateVisibility();
    return true;
  }

  function leaveOptimised() {
    optimiseTicket++; // cancels an in-flight apply
    if (!optimised) return;
    optimised = false;
    updateVisibility();
  }

  // ---------------------------------------------------------------- state

  function desiredLod() {
    if (!fullDetail) return HERO_CONFIG.previewLod;
    return Math.min(LOD_COUNT - 1, Math.floor(clamp(progress, 0, 1) * (LOD_COUNT - 1) + 1e-4));
  }

  /** The loaded level closest to `want`, preferring more detail on ties. */
  function nearestLoaded(want) {
    for (let d = 0; d < LOD_COUNT; d++) {
      if (lods[want - d]?.object) return want - d;
      if (lods[want + d]?.object) return want + d;
    }
    return -1;
  }

  let lastReported = '';
  function updateVisibility() {
    const want = desiredLod();
    if (fullDetail && !optimised && !lods[want].object) {
      loadLod(want).catch(() => {}); // failure is reported via state below
    }
    const show = optimised ? -1 : nearestLoaded(want);
    if (show !== displayed && displayed !== -1 && show !== -1) fx.flash(reducedMotion.matches);
    displayed = show;
    lods.forEach((slot, i) => slot.object && (slot.object.visible = !optimised && i === show));
    if (optimisedObject) optimisedObject.visible = optimised;
    dirty = true;

    const state = {
      displayedLod: optimised ? OPTIMISED.lod : show,
      desiredLod: optimised ? OPTIMISED.lod : want,
      triangles: optimised ? countTriangles(optimisedObject) : show >= 0 ? countTriangles(lods[show].object) : 0,
      optimised,
      simplifying: fullDetail && !optimised,
    };
    const signature = JSON.stringify(state);
    if (signature !== lastReported) {
      lastReported = signature;
      onChange(state);
    }
  }

  // ---------------------------------------------------------------- input

  let dragging = false;
  let lastX = 0;
  let pointerId = null;

  function onPointerDown(event) {
    if (!event.isPrimary || event.button > 0 || (displayed === -1 && !optimised)) return;
    dragging = true;
    pointerId = event.pointerId;
    lastX = event.clientX;
    velocity = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    prefetchLods();
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    lastX = event.clientX;
    const width = stage.clientWidth || 1;
    if (fullDetail && !optimised) {
      target = clamp(target + dx / (width * HERO_CONFIG.totalTurns), 0, 1);
      onTarget(target);
    } else {
      spin += (dx / width) * Math.PI * 2;
    }
    dirty = true;
    wake();
  }

  function release() {
    dragging = false;
    pointerId = null;
    canvas.classList.remove('is-dragging');
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);

  let prefetched = false;
  /** Fetch the remaining levels, next-needed first, one at a time. */
  function prefetchLods() {
    if (prefetched || !fullDetail) return;
    prefetched = true;
    const order = [1, 2, 3, 4, 5].filter((i) => !lods[i].object);
    order.reduce((chain, i) => chain.then(() => loadLod(i).catch(() => {})), Promise.resolve());
  }

  // ---------------------------------------------------------------- loop

  const resizeObserver = new ResizeObserver(() => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
    wake();
  });
  resizeObserver.observe(stage);

  let inView = true;
  const intersectionObserver = new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    wake();
  });
  intersectionObserver.observe(stage);
  const onVisibility = () => wake();
  document.addEventListener('visibilitychange', onVisibility);

  const onContextLost = (event) => {
    event.preventDefault();
    stage.classList.add('is-failed');
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  let frameId = 0;
  let previous = 0;

  function wake() {
    if (frameId || disposed || !inView || document.hidden) return;
    previous = performance.now();
    frameId = requestAnimationFrame(frame);
  }

  function frame(now) {
    frameId = 0;
    if (disposed || !inView || document.hidden) return;
    const dt = Math.min((now - previous) / 1000, 0.033);
    previous = now;
    const still = reducedMotion.matches;

    if (still) {
      progress = target;
      velocity = 0;
    } else {
      const { stiffness, dampingDragging, dampingReleased } = HERO_CONFIG.spring;
      velocity += ((target - progress) * stiffness - velocity * (dragging ? dampingDragging : dampingReleased)) * dt;
      progress += velocity * dt;
    }

    const rotation = progress * Math.PI * 2 * HERO_CONFIG.totalTurns + spin;
    const instant = dt > 0 ? (rotation - lastRotation) / dt : 0;
    angularSpeed = still ? 0 : THREE.MathUtils.damp(angularSpeed, instant, 12, dt);
    lastRotation = rotation;
    pivot.rotation.y = rotation;
    pivot.rotation.z = still ? 0 : -clamp(angularSpeed * 0.00175, -HERO_CONFIG.maxTilt, HERO_CONFIG.maxTilt);

    if (!optimised) updateVisibility();

    fxTime += dt;
    const fxActive = fx.update({ dt, time: fxTime, rotation, motion: still ? 0 : Math.min(1, Math.abs(angularSpeed) * 0.38), still });

    renderer.render(scene, camera);
    dirty = false;

    const settling = Math.abs(target - progress) > 1e-5 || Math.abs(velocity) > 1e-5 || Math.abs(angularSpeed) > 1e-3;
    if (settling || fxActive || dragging || dirty) wake();
  }

  reducedMotion.addEventListener?.('change', wake);

  // ---------------------------------------------------------------- API

  return {
    canvas,
    loadPreview: () => loadLod(HERO_CONFIG.previewLod),
    /** Loads full detail; resolves once level 0 is displayable. */
    async loadFullDetail() {
      await loadLod(0);
      if (disposed) return;
      fullDetail = true;
      updateVisibility();
      wake();
    },
    prefetchLods,
    setTextures: (key) => setTextures(key).finally(wake),
    applyOptimised: () => applyOptimised().finally(wake),
    leaveOptimised() {
      leaveOptimised();
      wake();
    },
    get optimised() {
      return optimised;
    },
    setTarget(value) {
      target = clamp(value, 0, 1);
      prefetchLods();
      wake();
    },
    setWireframe(on) {
      wireframe = on;
      material.wireframe = on;
      optimisedObject?.traverse((node) => node.isMesh && (node.material.wireframe = on));
      dirty = true;
      wake();
    },
    setZoom(zoom) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      dirty = true;
      wake();
    },
    reset() {
      leaveOptimised();
      target = progress = 0;
      velocity = 0;
      spin = 0;
      angularSpeed = 0;
      updateVisibility();
      wake();
    },
    wake,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener?.('change', wake);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      for (const slot of lods) if (slot.object) disposeObject(slot.object);
      if (optimisedObject) disposeObject(optimisedObject, true);
      material.dispose();
      for (const promise of textureSets.values()) {
        promise.then((set) => Object.values(set).forEach((t) => t.dispose())).catch(() => {});
      }
      fx.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

function countTriangles(object) {
  let count = 0;
  object?.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry;
    count += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return Math.round(count);
}

function disposeObject(object, withMaterials = false) {
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    if (!withMaterials) return;
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) node.material[key]?.dispose();
    node.material.dispose();
  });
  object.removeFromParent();
}

/** Gold trails and sparks: procedural, no extra downloads. */
function createFx(scene) {
  const intensity = HERO_CONFIG.fxIntensity;
  const count = 36;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = i * 2.4;
    positions[i * 3] = Math.cos(a) * (1 + Math.random() * 0.2);
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2.5;
    positions[i * 3 + 2] = Math.sin(a) * 0.7;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparkMaterial = new THREE.PointsMaterial({ color: 0xffbf45, size: 0.025, transparent: true, opacity: 0, depthWrite: false });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  scene.add(sparks);

  const trails = new THREE.Group();
  scene.add(trails);
  for (let j = 0; j < 3; j++) {
    const points = [];
    for (let k = 0; k < 48; k++) {
      const a = (k / 47) * Math.PI * 1.35;
      points.push(new THREE.Vector3(Math.cos(a) * (1.05 + j * 0.08), Math.sin(a * 1.5) * 0.12 + (j - 1) * 0.8, Math.sin(a) * (1.05 + j * 0.08)));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: j === 1 ? 0xffdf83 : 0xe9a22c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    line.rotation.y = j * 2;
    trails.add(line);
  }

  return {
    flash(still) {
      if (!still && intensity > 0) sparkMaterial.opacity = 0.85 * intensity;
    },
    /** Returns true while anything is still visibly animating. */
    update({ dt, time, rotation, motion, still }) {
      const level = motion * intensity;
      let active = false;
      trails.rotation.y = rotation * 0.65;
      trails.children.forEach((line, i) => {
        line.material.opacity = still ? 0 : THREE.MathUtils.damp(line.material.opacity, level * 0.65, 8, dt);
        line.rotation.z = still ? 0 : Math.sin(time * 2 + i) * 0.07;
        if (line.material.opacity > 0.004) active = true;
      });
      sparkMaterial.opacity = still ? 0 : Math.max(level * 0.65, sparkMaterial.opacity - dt * 1.6);
      if (sparkMaterial.opacity > 0.004) {
        active = true;
        sparks.rotation.y = rotation * 0.8;
        for (let i = 0; i < count; i++) positions[i * 3 + 1] = (((i / count) * 2.7 + time * 0.15) % 2.7) - 1.35;
        sparkGeometry.attributes.position.needsUpdate = true;
      }
      return active;
    },
    dispose() {
      sparkGeometry.dispose();
      sparkMaterial.dispose();
      trails.children.forEach((line) => {
        line.geometry.dispose();
        line.material.dispose();
      });
    },
  };
}
