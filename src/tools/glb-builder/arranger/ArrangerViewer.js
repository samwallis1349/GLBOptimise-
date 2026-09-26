import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { worldBox } from './bounds.js';
import { ARRANGER_CONFIG } from '../config.js';

const AMBER = 0xffb547;

/**
 * The Arranger viewport: camera + orbit, ground plane and grid, studio
 * lighting, selection boxes and the TransformControls gizmo.
 *
 * Renders on demand — only when something changed, the camera is still
 * damping, or an animation mixer is playing — so an idle scene with dozens
 * of instances costs nothing.
 */
export class ArrangerViewer {
  constructor(container, { onPick, onGizmoStart, onGizmoChange, onGizmoEnd } = {}) {
    this.container = container;
    this.handlers = { onPick, onGizmoStart, onGizmoChange, onGizmoEnd };
    this.mixers = new Set();
    this.timer = new THREE.Timer();
    this.dirty = true;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0b0c');
    this.scene.fog = new THREE.Fog('#0b0b0c', 60, 260);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
    this.camera.position.set(9, 7, 11);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(0, 0.5, 0);
    this.controls.addEventListener('change', () => this.invalidate());

    this.addLights();

    this.instanceRoot = new THREE.Group();
    this.instanceRoot.name = 'Instances';
    this.scene.add(this.instanceRoot);

    this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.name = 'Ground';
    this.scene.add(this.ground);
    this.baseMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 1 });
    this.base = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.baseMaterial);
    this.base.rotation.x = -Math.PI / 2;
    this.base.position.y = -0.002;
    this.base.receiveShadow = true;
    this.scene.add(this.base);
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.groundTextureId = 'none';
    this.groundVisible = true;
    this.gridVisible = true;
    this.setPlaneSize(ARRANGER_CONFIG.defaultPlaneSize);

    this.selectionHelpers = new Map();

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSpace('local');
    this.transform.addEventListener('change', () => this.invalidate());
    this.transform.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      if (event.value) this.handlers.onGizmoStart?.();
      else this.handlers.onGizmoEnd?.();
    });
    this.transform.addEventListener('objectChange', () => this.handlers.onGizmoChange?.(this.transform.mode));
    this.gizmo = this.transform.getHelper();
    this.scene.add(this.gizmo);
    this.mode = 'select';

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.bindPointer();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.running = true;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0x2a2622, 0.9));
    this.sun = new THREE.DirectionalLight(0xffe7c4, 2.6);
    this.sun.position.set(14, 22, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight(0xc8d6ff, 0.6);
    fill.position.set(-10, 8, -12);
    this.scene.add(fill);
  }

  invalidate() {
    this.dirty = true;
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.1);
    let animating = false;
    for (const mixer of this.mixers) {
      mixer.update(delta);
      animating = true;
    }
    if (animating) this.refreshSelectionBoxes();
    const damping = this.controls.update();
    if (!this.dirty && !animating && !damping) return;
    this.dirty = false;
    this.sizeRotateGizmo();
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- ground & grid ----------

  setPlaneSize(size) {
    this.planeSize = size;
    this.ground.scale.set(size, size, 1);
    this.base.scale.set(size, size, 1);
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    this.grid = new THREE.GridHelper(size, size, 0x5a4a32, 0x2c2a27);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.7;
    this.grid.material.depthWrite = false;
    this.grid.position.y = 0.003;
    this.grid.visible = this.gridVisible;
    this.grid.renderOrder = 1;
    this.scene.add(this.grid);
    const half = size / 2 + 2;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: 80 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.updateGroundRepeat();
    this.invalidate();
  }

  updateGroundRepeat() {
    const map = this.groundMaterial.map;
    if (map) {
      const repeat = this.planeSize / ARRANGER_CONFIG.groundTileMetres;
      map.repeat.set(repeat, repeat);
    }
  }

  /** texture = null for grid-only. */
  setGroundTexture(id, texture) {
    this.groundTextureId = id;
    this.groundMaterial.map = texture || null;
    this.groundMaterial.needsUpdate = true;
    this.updateGroundRepeat();
    this.applyGroundVisibility();
  }

  setGroundVisible(visible) {
    this.groundVisible = visible;
    this.applyGroundVisibility();
  }

  applyGroundVisibility() {
    const textured = Boolean(this.groundMaterial.map);
    this.ground.visible = this.groundVisible && textured;
    this.base.visible = this.groundVisible && !textured;
    this.invalidate();
  }

  setGridVisible(visible) {
    this.gridVisible = visible;
    this.grid.visible = visible;
    this.invalidate();
  }

  // ---------- instances ----------

  addObject(object) {
    object.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    this.instanceRoot.add(object);
    this.invalidate();
  }

  removeObject(object) {
    if (this.transform.object === object) this.transform.detach();
    this.instanceRoot.remove(object);
    this.invalidate();
  }

  // ---------- selection ----------

  /** @param {THREE.Object3D[]} objects primary last */
  setSelection(objects) {
    const wanted = new Set(objects);
    for (const [object, helper] of this.selectionHelpers) {
      if (!wanted.has(object)) {
        this.scene.remove(helper);
        helper.geometry.dispose();
        helper.material.dispose();
        this.selectionHelpers.delete(object);
      }
    }
    const primary = objects[objects.length - 1] || null;
    for (const object of objects) {
      if (!this.selectionHelpers.has(object)) {
        const helper = new THREE.Box3Helper(new THREE.Box3(), AMBER);
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.renderOrder = 10;
        this.scene.add(helper);
        this.selectionHelpers.set(object, helper);
      }
      this.selectionHelpers.get(object).material.opacity = object === primary ? 0.95 : 0.45;
    }
    this.primary = primary;
    this.refreshSelectionBoxes();
    this.attachGizmo();
  }

  refreshSelectionBoxes() {
    for (const [object, helper] of this.selectionHelpers) {
      worldBox(object, false, helper.box);
      helper.visible = object.visible && !helper.box.isEmpty();
    }
    this.gizmoRadius = null;
    this.invalidate();
  }

  setMode(mode) {
    this.mode = mode;
    this.attachGizmo();
  }

  attachGizmo() {
    const object = this.primary;
    if (!object || this.mode === 'select' || !object.visible) {
      this.transform.detach();
    } else {
      this.transform.setMode({ move: 'translate', rotate: 'rotate', scale: 'scale' }[this.mode]);
      this.transform.setSpace(this.mode === 'move' ? 'world' : 'local');
      if (this.transform.object !== object) this.transform.attach(object);
      this.gizmoRadius = null;
    }
    this.invalidate();
  }

  setSnap(move, rotateDegrees) {
    this.transform.setTranslationSnap(move || null);
    this.transform.setRotationSnap(rotateDegrees ? THREE.MathUtils.degToRad(rotateDegrees) : null);
    this.transform.setScaleSnap(move ? 0.05 : null);
  }

  /**
   * Rotate mode: grow the rotation rings so they wrap the selected model
   * like a rotation sphere, instead of TransformControls' fixed screen size.
   * TransformControls scales its gizmo by distance · fov factor · size / 4,
   * and the rotate rings have radius 0.5 in gizmo space.
   */
  sizeRotateGizmo() {
    const object = this.transform.object;
    if (!object || this.transform.mode !== 'rotate') {
      if (this.transform.size !== 1) this.transform.size = 1;
      return;
    }
    if (this.gizmoRadius == null) {
      const box = worldBox(object, false);
      if (box.isEmpty()) this.gizmoRadius = 1;
      else {
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const origin = object.getWorldPosition(new THREE.Vector3());
        this.gizmoRadius = Math.max(sphere.radius * 0.95, origin.distanceTo(sphere.center) + sphere.radius * 0.55);
      }
    }
    const origin = object.getWorldPosition(new THREE.Vector3());
    const distance = origin.distanceTo(this.camera.position);
    const factor = distance * Math.min((1.9 * Math.tan((Math.PI * this.camera.fov) / 360)) / this.camera.zoom, 7);
    const size = THREE.MathUtils.clamp((this.gizmoRadius * 8) / factor, 0.35, 6);
    if (Math.abs(this.transform.size - size) > 1e-3) this.transform.size = size;
  }

  // ---------- picking ----------

  bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      down = { x: event.clientX, y: event.clientY };
    });
    el.addEventListener('pointerup', (event) => {
      if (!down || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > 4 || this.transform.dragging || this.transform.axis) return;
      this.handlers.onPick?.(this.pick(event.clientX, event.clientY), { additive: event.shiftKey || event.ctrlKey || event.metaKey });
    });
  }

  setPointer(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /** @returns {THREE.Object3D|null} the instance root under the pointer */
  pick(clientX, clientY) {
    this.setPointer(clientX, clientY);
    const hits = this.raycaster.intersectObjects(this.instanceRoot.children.filter((o) => o.visible), true);
    for (const hit of hits) {
      let node = hit.object;
      if (!node.visible) continue;
      while (node && node.parent !== this.instanceRoot) node = node.parent;
      if (node) return node;
    }
    return null;
  }

  /** Ground-plane point under the pointer, clamped to the plane. */
  groundPoint(clientX, clientY) {
    this.setPointer(clientX, clientY);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, point)) return new THREE.Vector3();
    const half = this.planeSize / 2;
    point.x = THREE.MathUtils.clamp(point.x, -half, half);
    point.z = THREE.MathUtils.clamp(point.z, -half, half);
    return point;
  }

  // ---------- camera ----------

  setView(view) {
    const target = this.controls.target.clone();
    const distance = Math.max(this.camera.position.distanceTo(target), 4);
    const offsets = {
      perspective: new THREE.Vector3(0.62, 0.48, 0.62),
      top: new THREE.Vector3(0, 1, 0.0008),
      front: new THREE.Vector3(0, 0.12, 1),
      right: new THREE.Vector3(1, 0.12, 0),
    };
    this.camera.position.copy(target).add(offsets[view].normalize().multiplyScalar(distance));
    this.controls.maxPolarAngle = view === 'top' ? Math.PI : Math.PI * 0.495;
    this.controls.update();
    this.invalidate();
  }

  frameObjects(objects) {
    const box = new THREE.Box3();
    for (const object of objects) box.union(worldBox(object, false));
    if (box.isEmpty()) {
      const half = this.planeSize / 2;
      box.set(new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, 1, half));
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.25);
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.1;
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).add(direction.multiplyScalar(distance));
    this.camera.near = Math.max(distance / 500, 0.01);
    this.camera.far = Math.max(distance * 50, 500);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }

  dispose() {
    this.running = false;
    this.resizeObserver.disconnect();
    this.transform.detach();
    this.transform.dispose();
    this.controls.dispose();
    this.setSelection([]);
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.ground.geometry.dispose();
    this.groundMaterial.dispose();
    this.base.geometry.dispose();
    this.baseMaterial.dispose();
    this.envMap.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
