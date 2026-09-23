import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeModel } from '../rig-inspector/viewer/disposeModel.js';

export class ThumbnailViewer {
  constructor(container) {
    this.container = container;
    this.background = new THREE.Color('#111318');
    this.transparent = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.03;
    this.controls.maxDistance = 500;
    this.lights = new THREE.Group();
    this.scene.add(this.lights);
    this.setLighting('studio');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.running = true;
    this.animate();
  }

  setLighting(preset) {
    this.lights.clear();
    const values = { studio: [1.2, 3.2, 1.2, 0.8], bright: [2, 4.2, 2, 1.2], dramatic: [0.45, 4.5, 0.25, 1.8] }[preset] || [1.2, 3.2, 1.2, 0.8];
    this.lights.add(new THREE.HemisphereLight(0xffffff, 0x20242e, values[0]));
    [[4, 6, 4, values[1]], [-4, 2, 2, values[2]], [1, 4, -5, values[3]]].forEach(([x, y, z, intensity]) => {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.set(x, y, z);
      this.lights.add(light);
    });
  }

  setModel(model) {
    if (this.model) { this.scene.remove(this.model); disposeModel(this.model); }
    this.model = model;
    this.scene.add(model);
    this.frame();
  }

  frame() {
    if (!this.model) return;
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.center = sphere.center.clone();
    this.radius = Math.max(sphere.radius, 0.001);
    const distance = (this.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.18;
    this.camera.position.copy(this.center).add(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(distance));
    this.camera.near = Math.max(distance / 200, 0.001);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(this.center);
    this.controls.update();
    this.updateGrid();
  }

  setBackground(value, transparent = false) { this.background.set(value); this.transparent = transparent; }
  setGridVisible(visible) { this.gridVisible = visible; this.updateGrid(); }

  updateGrid() {
    if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); this.grid.material.dispose(); this.grid = null; }
    if (!this.gridVisible || !this.model) return;
    this.grid = new THREE.GridHelper(this.radius * 5, 16, 0xffb547, 0x667080);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.28;
    const box = new THREE.Box3().setFromObject(this.model);
    this.grid.position.set(this.center.x, box.min.y, this.center.z);
    this.scene.add(this.grid);
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render() { this.renderer.setClearColor(this.background, this.transparent ? 0 : 1); this.renderer.render(this.scene, this.camera); }
  animate() { if (!this.running) return; requestAnimationFrame(() => this.animate()); this.controls.update(); this.render(); }

  async capture(size) {
    const gridWasVisible = this.grid?.visible ?? false;
    if (this.grid) this.grid.visible = false;
    const target = new THREE.WebGLRenderTarget(size, size, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
    const previousAspect = this.camera.aspect;
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(this.background, this.transparent ? 0 : 1);
    this.renderer.render(this.scene, this.camera);
    const pixels = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    this.renderer.setRenderTarget(null);
    this.camera.aspect = previousAspect;
    this.camera.updateProjectionMatrix();
    if (this.grid) this.grid.visible = gridWasVisible;
    target.dispose();
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      const source = (size - y - 1) * size * 4;
      image.data.set(pixels.subarray(source, source + size * 4), y * size * 4);
    }
    context.putImageData(image, 0, 0);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png'));
  }

  dispose() {
    this.running = false; this.resizeObserver.disconnect(); this.controls.dispose();
    if (this.grid) { this.grid.geometry.dispose(); this.grid.material.dispose(); }
    if (this.model) disposeModel(this.model);
    this.renderer.dispose();
  }
}
