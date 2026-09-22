import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeModel } from './disposeModel.js';

/**
 * A self-contained Three.js preview: one per result card. Original and
 * Optimised viewers are each configured identically (camera, lighting,
 * neutral studio background) so a side-by-side comparison is meaningful.
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
    // Strictly white lights on a black background. Beyond matching the
    // theme, neutral lighting is the correct choice for an inspection tool:
    // a tinted rig would misrepresent the colour of the user's textures.
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
  }

  clear() {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      disposeModel(this.currentModel);
      this.currentModel = null;
    }
  }

  /** Frames the camera/controls target to fit the given object's bounding sphere. */
  autoFrame(object3d) {
    const box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return;

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = Math.max(sphere.radius, 0.001);

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
