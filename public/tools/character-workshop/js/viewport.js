/**
 * The Three.js viewport: renderer, cameras (perspective + isometric
 * orthographic), orbit controls, lights, grid and shadow ground. Owns the
 * one render loop; other modules hook in with onFrame(delta).
 *
 * The loaded model is never transformed directly. It sits inside
 * `display` (scale + rotation correction) inside `grounding` (feet offset),
 * so the imported nodes and bones keep their original transforms.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const BACKGROUNDS = { charcoal: 0x111214, black: 0x000000, grey: 0x3a3c40, light: 0xc9ccd1 };
// True isometric view: 45° azimuth, atan(1/√2) ≈ 35.264° elevation.
const ISO_DIRECTION = new THREE.Vector3(1, 1, 1).normalize();

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BACKGROUNDS.charcoal);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;

    this.perspective = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
    this.camera = this.perspective;
    this.mode = 'perspective';
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a2b2e, 0.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.grid = new THREE.GridHelper(10, 20, 0x5a5d63, 0x2c2e33);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.8;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.grid, this.ground);

    this.grounding = new THREE.Group();
    this.grounding.name = 'CW_Grounding';
    this.display = new THREE.Group();
    this.display.name = 'CW_Display';
    this.grounding.add(this.display);
    this.scene.add(this.grounding);

    this.model = null;
    this.radius = 1;
    this.settings = { scale: 1, rotationX: 0, rotationY: 0, groundFeet: true, shadows: true, grid: true, background: 'charcoal', skeleton: false };
    this.skeletonHelper = null;
    this.frameHooks = new Set();
    this.clock = new THREE.Clock();
    this.running = true;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  onFrame(fn) { this.frameHooks.add(fn); return () => this.frameHooks.delete(fn); }

  tick() {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    for (const fn of this.frameHooks) fn(delta);
    this.updateBoneMarker();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const el = this.canvas.parentElement;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.perspective.aspect = w / h;
    this.perspective.updateProjectionMatrix();
    this.updateOrthoFrustum();
  }

  updateOrthoFrustum() {
    const el = this.canvas.parentElement;
    const aspect = Math.max(1, el.clientWidth) / Math.max(1, el.clientHeight);
    const half = this.radius * 1.15;
    this.ortho.left = -half * aspect; this.ortho.right = half * aspect;
    this.ortho.top = half; this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
  }

  setModel(model) {
    this.clearModel();
    this.model = model;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = this.settings.shadows;
        o.receiveShadow = this.settings.shadows;
        // Skinned meshes can move outside their bind-pose bounds while animating.
        if (o.isSkinnedMesh) o.frustumCulled = false;
      }
    });
    this.display.add(model);
    this.applySettings();
    this.frame();
  }

  /** Detaches the model; the caller disposes it (see dispose.js). */
  clearModel() {
    this.removeSkeletonHelper();
    this.clearBoneHighlight();
    if (this.model) this.display.remove(this.model);
    this.model = null;
  }

  /** Draws the bones on top of the mesh (a view aid; nothing is added to the model). */
  updateSkeletonHelper() {
    this.removeSkeletonHelper();
    if (!this.settings.skeleton || !this.model) return;
    let hasBones = false;
    this.model.traverse((o) => { if (o.isBone) hasBones = true; });
    if (!hasBones) return;
    this.skeletonHelper = new THREE.SkeletonHelper(this.model);
    this.skeletonHelper.material.depthTest = false;
    this.skeletonHelper.material.transparent = true;
    this.skeletonHelper.renderOrder = 10;
    this.scene.add(this.skeletonHelper);
  }

  /** Marks one bone with a small always-on-top ring that follows it while animating. */
  highlightBone(bone) {
    this.clearBoneHighlight();
    if (!bone) return;
    const r = Math.max(this.radius * 0.035, 1e-4);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9, wireframe: true }),
    );
    marker.renderOrder = 20;
    marker.name = 'CW_BoneMarker';
    marker.userData.bone = bone;
    marker.userData.size = r;
    this.boneMarker = marker;
    this.scene.add(marker);
    this.updateBoneMarker();
  }

  updateBoneMarker() {
    const m = this.boneMarker;
    if (!m) return;
    const bone = m.userData.bone;
    if (!bone.parent) { this.clearBoneHighlight(); return; }
    bone.getWorldPosition(m.position);
    m.scale.setScalar(m.userData.size);
  }

  clearBoneHighlight() {
    if (!this.boneMarker) return;
    this.scene.remove(this.boneMarker);
    this.boneMarker.geometry.dispose();
    this.boneMarker.material.dispose();
    this.boneMarker = null;
  }

  removeSkeletonHelper() {
    if (!this.skeletonHelper) return;
    this.scene.remove(this.skeletonHelper);
    this.skeletonHelper.geometry.dispose();
    this.skeletonHelper.material.dispose();
    this.skeletonHelper = null;
  }

  applySettings(patch = {}) {
    Object.assign(this.settings, patch);
    const s = this.settings;
    this.display.scale.setScalar(s.scale > 0 ? s.scale : 1);
    this.display.rotation.set(THREE.MathUtils.degToRad(s.rotationX), THREE.MathUtils.degToRad(s.rotationY), 0);
    this.grounding.position.set(0, 0, 0);
    this.grounding.updateMatrixWorld(true);
    if (this.model && s.groundFeet) {
      const box = new THREE.Box3().setFromObject(this.display);
      if (!box.isEmpty()) this.grounding.position.y = -box.min.y;
    }
    this.grid.visible = s.grid;
    this.renderer.shadowMap.enabled = s.shadows;
    this.sun.castShadow = s.shadows;
    this.ground.visible = s.shadows;
    this.model?.traverse((o) => { if (o.isMesh) { o.castShadow = s.shadows; o.receiveShadow = s.shadows; } });
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.scene.background = new THREE.Color(BACKGROUNDS[s.background] ?? BACKGROUNDS.charcoal);
    this.updateSkeletonHelper();
    this.fitHelpers();
  }

  /** Sizes grid, ground and shadow camera to the model so nothing is hardcoded. */
  fitHelpers() {
    const box = this.worldBox();
    const size = box.isEmpty() ? new THREE.Vector3(2, 2, 2) : box.getSize(new THREE.Vector3());
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const r = Math.max(size.length() / 2, 0.01);
    this.radius = r;
    const groundY = box.isEmpty() ? 0 : (this.settings.groundFeet ? 0 : box.min.y);
    const extent = niceStep(r * 6);
    this.grid.scale.setScalar(extent / 10);
    this.grid.position.set(center.x, groundY, center.z);
    this.ground.scale.setScalar(extent);
    this.ground.position.set(center.x, groundY - r * 0.001, center.z);
    this.sun.position.copy(center).add(new THREE.Vector3(r * 2, r * 4, r * 3));
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r * 1.6; cam.right = cam.top = r * 1.6;
    cam.near = r * 0.1; cam.far = r * 10;
    cam.updateProjectionMatrix();
    this.updateOrthoFrustum();
  }

  worldBox() {
    this.scene.updateMatrixWorld(true);
    return this.model ? new THREE.Box3().setFromObject(this.display) : new THREE.Box3();
  }

  /** Points the active camera at the model's bounding box. */
  frame() {
    const box = this.worldBox();
    const center = box.isEmpty() ? new THREE.Vector3(0, 1, 0) : box.getCenter(new THREE.Vector3());
    const r = box.isEmpty() ? 1 : Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.01);
    this.radius = r;
    const dir = this.mode === 'isometric' ? ISO_DIRECTION.clone() : new THREE.Vector3(0.35, 0.25, 1).normalize();
    const fov = THREE.MathUtils.degToRad(this.perspective.fov);
    const dist = (r / Math.sin(Math.min(fov, fov * this.perspective.aspect) / 2)) * 1.05;
    for (const cam of [this.perspective, this.ortho]) {
      cam.position.copy(center).addScaledVector(dir, dist);
      cam.near = Math.max(dist / 1000, r / 1000);
      cam.far = dist + r * 20;
      cam.lookAt(center);
      cam.updateProjectionMatrix();
    }
    this.ortho.zoom = 1;
    this.updateOrthoFrustum();
    this.controls.target.copy(center);
    this.controls.update();
  }

  setMode(mode) {
    this.mode = mode;
    this.camera = mode === 'isometric' ? this.ortho : this.perspective;
    this.controls.object = this.camera;
    // Isometric keeps a fixed elevation; orbiting only spins around the vertical axis.
    const iso = mode === 'isometric';
    const polar = Math.acos(ISO_DIRECTION.y);
    this.controls.minPolarAngle = iso ? polar : 0;
    this.controls.maxPolarAngle = iso ? polar : Math.PI;
    this.frame();
  }

  resetCamera() {
    this.setMode(this.mode);
  }

  /** Renders the current view to a PNG blob; `square` crops to the centre for thumbnails. */
  snapshot({ square = false, hideHelpers = true } = {}) {
    const hidden = [];
    if (hideHelpers) for (const o of [this.grid, this.skeletonHelper, this.boneMarker]) if (o?.visible) { o.visible = false; hidden.push(o); }
    this.renderer.render(this.scene, this.camera);
    let source = this.canvas;
    if (square) {
      const s = Math.min(this.canvas.width, this.canvas.height);
      const c = document.createElement('canvas');
      c.width = c.height = s;
      c.getContext('2d').drawImage(this.canvas, (this.canvas.width - s) / 2, (this.canvas.height - s) / 2, s, s, 0, 0, s, s);
      source = c;
    }
    for (const o of hidden) o.visible = true;
    return new Promise((resolve, reject) => source.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not capture the viewport.'))), 'image/png'));
  }

  dispose() {
    this.running = false;
    this.clearBoneHighlight();
    this.removeSkeletonHelper();
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.envTexture.dispose();
    this.pmrem.dispose();
    this.grid.geometry.dispose(); this.grid.material.dispose();
    this.ground.geometry.dispose(); this.ground.material.dispose();
    this.renderer.dispose();
  }
}

function niceStep(n) {
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
