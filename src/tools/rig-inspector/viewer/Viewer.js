import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeModel } from './disposeModel.js';

/**
 * A self-contained Three.js preview, same shape as the other tools' Viewer —
 * Rig Inspector only ever mounts one (there is no before/after to compare),
 * but keeps the class separate from index.js so RigViewer.js can wrap it
 * with the skeleton overlay without duplicating camera/lighting/resize code.
 */
export class Viewer {
  constructor(container) {
    this.container = container;
    this.currentModel = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    this.camera.position.set(2, 1.6, 2.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 200;

    this._setupLighting();

    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(container);
    this._onResize();

    this._running = true;
    this._animate();
  }

  _setupLighting() {
    // Strictly white lights on a black background — neutral lighting is the
    // correct choice for an inspection tool, so nothing here misrepresents
    // the model's own materials.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.9);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 4);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-5, 2, -3);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(-2, 3, 5);
    this.scene.add(rim);
  }

  _onResize() {
    const { clientWidth, clientHeight } = this.container;
    if (!clientWidth || !clientHeight) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  _animate() {
    if (!this._running) return;
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Replaces the current preview model, disposing the previous one. */
  setModel(object3d) {
    this.clear();
    this.currentModel = object3d;
    this.scene.add(object3d);
    this.autoFrame(object3d);
    if (this._wireframeMode && this._wireframeMode !== 'solid') {
      this.setWireframeMode(this._wireframeMode);
    }
  }

  clear() {
    this._removeWireframeOverlay();
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      disposeModel(this.currentModel);
      this.currentModel = null;
    }
  }

  /** @param {'solid'|'wireframe'|'both'} mode */
  setWireframeMode(mode) {
    this._wireframeMode = mode;
    this._removeWireframeOverlay();
    if (!this.currentModel) return;

    const solidVisible = mode !== 'wireframe';
    this.currentModel.traverse((node) => {
      if (!node.isMesh) return;
      node.visible = solidVisible;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material) material.wireframe = false;
      }
    });

    if (mode === 'solid') return;

    const overlay = new THREE.Group();
    overlay.name = '__wireframeOverlay';
    const colour = mode === 'wireframe' ? 0xffb547 : 0xffffff;
    this.currentModel.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      const lines = new THREE.LineSegments(
        new THREE.WireframeGeometry(node.geometry),
        new THREE.LineBasicMaterial({
          color: colour,
          transparent: true,
          opacity: mode === 'wireframe' ? 0.95 : 0.28,
          depthTest: true,
        })
      );
      node.updateWorldMatrix(true, false);
      lines.applyMatrix4(node.matrixWorld);
      overlay.add(lines);
    });
    this._wireframeOverlay = overlay;
    this.scene.add(overlay);
  }

  _removeWireframeOverlay() {
    if (!this._wireframeOverlay) return;
    this.scene.remove(this._wireframeOverlay);
    this._wireframeOverlay.traverse((node) => {
      node.geometry?.dispose?.();
      node.material?.dispose?.();
    });
    this._wireframeOverlay = null;
  }

  setGridVisible(visible) {
    if (visible && !this._grid) {
      const size = this._frameRadius ? this._frameRadius * 8 : 10;
      this._grid = new THREE.GridHelper(size, 20, 0xffb547, 0xffffff);
      this._grid.material.transparent = true;
      this._grid.material.opacity = 0.14;
      if (this._frameCenter) this._grid.position.y = this._frameCenter.y - (this._frameRadius || 0);
      this.scene.add(this._grid);
    } else if (!visible && this._grid) {
      this.scene.remove(this._grid);
      this._grid.geometry.dispose();
      this._grid.material.dispose();
      this._grid = null;
    }
  }

  resetCamera() {
    if (this.currentModel) this.autoFrame(this.currentModel);
  }

  /** Frames the camera/controls target to fit the given object's bounding sphere. */
  autoFrame(object3d) {
    const box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return;

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = Math.max(sphere.radius, 0.001);
    this._frameCenter = center.clone();
    this._frameRadius = radius;

    const fovRad = (this.camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fovRad / 2)) * 1.35;

    const direction = new THREE.Vector3(1, 0.65, 1).normalize();
    this.camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
    this.camera.near = Math.max(distance / 100, 0.001);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.update();
  }

  dispose() {
    this._running = false;
    this.clear();
    this._resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
