import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeModel } from './disposeModel.js';
import { frameModel } from './frameModel.js';

/**
 * Shared Three.js model viewer for the inspection tools.
 *
 *   const viewer = new Viewer(containerEl);
 *   viewer.setModel(scene, clips, meshObjects);
 *   viewer.setViewMode('wireframe');   // shaded | wireframe | overlay | normals | uv
 *   viewer.highlightMesh(3);           // glTF mesh index, null to clear
 *   viewer.capture(480, 320);          // PNG data URL (report thumbnails)
 *   viewer.dispose();
 *
 * Debug view modes swap materials on the fly and always restore the
 * originals, so the loaded model is never mutated permanently.
 */

const HIGHLIGHT = new THREE.Color(0xffb547);
const VIEW_MODES = ['shaded', 'wireframe', 'overlay', 'normals', 'uv'];

let checkerTexture = null;
function getCheckerTexture() {
  if (checkerTexture) return checkerTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const cells = 8;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      g.fillStyle = (x + y) % 2 ? '#1c1c1c' : '#ffb547';
      g.fillRect((x * size) / cells, (y * size) / cells, size / cells, size / cells);
    }
  }
  g.fillStyle = '#fff';
  g.font = 'bold 20px sans-serif';
  g.fillText('0,0', 6, size - 8);
  checkerTexture = new THREE.CanvasTexture(canvas);
  checkerTexture.colorSpace = THREE.SRGBColorSpace;
  checkerTexture.wrapS = checkerTexture.wrapT = THREE.RepeatWrapping;
  return checkerTexture;
}

export class Viewer {
  constructor(container, { background = null, grid = true } = {}) {
    this.container = container;
    this.model = null;
    this.clips = [];
    this.meshObjects = new Map();
    this.mixer = null;
    this.action = null;
    this.playing = false;
    this.viewMode = 'shaded';
    this.highlighted = null;
    this._originalMaterials = new Map();
    this._debugMaterials = [];
    this._overlay = null;
    this._grid = null;
    this._gridWanted = grid;
    this._listeners = new Set();

    this.scene = new THREE.Scene();
    if (background != null) this.scene.background = new THREE.Color(background);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    this.camera.position.set(2, 1.5, 2.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: background == null, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.className = 'ab-viewer__canvas';
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.addEventListener('change', () => this._listeners.forEach((fn) => fn()));

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 4);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-5, 2, -3);
    const rim = new THREE.DirectionalLight(0xffe2cc, 0.7);
    rim.position.set(-2, 3, -5);
    this.scene.add(key, fill, rim);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(container);
    this._resize();

    this._last = performance.now();
    this.renderer.setAnimationLoop((now) => this._tick(now));
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _tick(now) {
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    if (this.mixer && this.playing) this.mixer.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- model

  setModel(object3d, clips = [], meshObjects = new Map()) {
    this.clear();
    this.model = object3d;
    this.clips = clips;
    this.meshObjects = meshObjects;
    this.scene.add(object3d);
    this.mixer = clips.length ? new THREE.AnimationMixer(object3d) : null;
    this.resetCamera();
    this._rebuildGrid();
    if (this.viewMode !== 'shaded') this.setViewMode(this.viewMode);
  }

  clear() {
    this.stopClip();
    this._restoreMaterials();
    this._removeOverlay();
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    if (this.model) {
      this.scene.remove(this.model);
      disposeModel(this.model);
      this.model = null;
    }
    this.meshObjects = new Map();
    this.highlighted = null;
  }

  // ------------------------------------------------------------ view modes

  setViewMode(mode) {
    if (!VIEW_MODES.includes(mode)) return;
    this.viewMode = mode;
    this._restoreMaterials();
    this._removeOverlay();
    if (!this.model) return;

    if (mode === 'wireframe' || mode === 'normals' || mode === 'uv') {
      const shared =
        mode === 'wireframe'
          ? new THREE.MeshBasicMaterial({ color: 0xffb547, wireframe: true })
          : mode === 'normals'
            ? new THREE.MeshNormalMaterial()
            : new THREE.MeshBasicMaterial({ map: getCheckerTexture() });
      this._debugMaterials.push(shared);
      this.model.traverse((o) => {
        if (!o.isMesh) return;
        this._originalMaterials.set(o, o.material);
        // Keep skinning/morphs working with the debug material.
        o.material = shared;
      });
    } else if (mode === 'overlay') {
      this._overlay = new THREE.Group();
      this.model.traverse((o) => {
        if (!o.isMesh || !o.geometry || o.isSkinnedMesh) return;
        const lines = new THREE.LineSegments(new THREE.WireframeGeometry(o.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
        o.updateWorldMatrix(true, false);
        lines.applyMatrix4(o.matrixWorld);
        this._overlay.add(lines);
      });
      this.scene.add(this._overlay);
    }
    if (this.highlighted != null) this.highlightMesh(this.highlighted);
  }

  _restoreMaterials() {
    // Highlight tints sit on top of whatever material is current, so undo them first.
    this._clearHighlightMaterials();
    for (const [mesh, material] of this._originalMaterials) mesh.material = material;
    this._originalMaterials.clear();
    this._debugMaterials.forEach((m) => m.dispose());
    this._debugMaterials = [];
  }

  _removeOverlay() {
    if (!this._overlay) return;
    this.scene.remove(this._overlay);
    this._overlay.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this._overlay = null;
  }

  // ------------------------------------------------------------- highlight

  /** Tints every THREE.Mesh belonging to glTF mesh `index` (null clears). */
  highlightMesh(index) {
    this._clearHighlightMaterials();
    this.highlighted = index;
    if (index == null) return;
    for (const mesh of this.meshObjects.get(index) || []) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const tinted = materials.map((m) => {
        const copy = m.clone();
        if (copy.emissive) {
          copy.emissive = HIGHLIGHT.clone();
          copy.emissiveIntensity = 0.55;
        } else if (copy.color) {
          copy.color = HIGHLIGHT.clone();
        }
        return copy;
      });
      if (!this._highlightBackup) this._highlightBackup = new Map();
      this._highlightBackup.set(mesh, mesh.material);
      mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0];
    }
  }

  _clearHighlightMaterials() {
    if (!this._highlightBackup) return;
    for (const [mesh, material] of this._highlightBackup) {
      const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      current.forEach((m) => m.dispose());
      mesh.material = material;
    }
    this._highlightBackup = null;
  }

  /** Frames the camera on one glTF mesh index. */
  focusMesh(index) {
    const objects = this.meshObjects.get(index);
    if (!objects?.length) return;
    const group = new THREE.Box3();
    objects.forEach((o) => group.expandByObject(o, true));
    const helper = new THREE.Object3D();
    const size = group.getSize(new THREE.Vector3());
    const geo = new THREE.BoxGeometry(Math.max(size.x, 1e-4), Math.max(size.y, 1e-4), Math.max(size.z, 1e-4));
    const proxy = new THREE.Mesh(geo);
    proxy.position.copy(group.getCenter(new THREE.Vector3()));
    helper.add(proxy);
    helper.updateMatrixWorld(true);
    frameModel(this.camera, helper, this.controls);
    geo.dispose();
  }

  // ------------------------------------------------------------- animation

  playClip(index) {
    if (!this.mixer || !this.clips[index]) return;
    this.stopClip();
    this.action = this.mixer.clipAction(this.clips[index]);
    this.action.reset().play();
    this.playing = true;
  }

  stopClip() {
    if (this.action) this.action.stop();
    this.action = null;
    this.playing = false;
  }

  // ---------------------------------------------------------------- camera

  resetCamera() {
    if (!this.model) return;
    this._frame = frameModel(this.camera, this.model, this.controls);
  }

  setGridVisible(visible) {
    this._gridWanted = visible;
    this._rebuildGrid();
  }

  _rebuildGrid() {
    if (this._grid) {
      this.scene.remove(this._grid);
      this._grid.geometry.dispose();
      this._grid.material.dispose();
      this._grid = null;
    }
    if (!this._gridWanted || !this._frame) return;
    const { radius, box } = this._frame;
    const size = 10 ** Math.ceil(Math.log10(radius * 4));
    this._grid = new THREE.GridHelper(size, 20, 0x6b4e22, 0x2a2218);
    this._grid.position.set(box.getCenter(new THREE.Vector3()).x, box.min.y, box.getCenter(new THREE.Vector3()).z);
    this.scene.add(this._grid);
  }

  /** Mirrors this viewer's camera onto another (Asset Compare's synced views). */
  copyCameraTo(other) {
    if (!other || other === this) return;
    other.camera.position.copy(this.camera.position);
    other.camera.quaternion.copy(this.camera.quaternion);
    other.camera.near = this.camera.near;
    other.camera.far = this.camera.far;
    other.camera.updateProjectionMatrix();
    other.controls.target.copy(this.controls.target);
  }

  onCameraChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** Renders one frame at the given size and returns a PNG data URL. */
  capture(width = 480, height = 320) {
    const size = this.renderer.getSize(new THREE.Vector2());
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(size.x, size.y, false);
    this._resize();
    return url;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.clear();
    this.setGridVisible(false);
    this._resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this._listeners.clear();
  }
}

/** Convenience factory matching the originally documented interface. */
export function createViewer(container, options) {
  return new Viewer(container, options);
}
