import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeModel } from '../rig-inspector/viewer/disposeModel.js';
export function disposeThumbnailModel(model) {
  if (!model) return;
  const images=new Set();model.traverse(node=>{for(const material of [node.material].flat().filter(Boolean))for(const value of Object.values(material))if(value?.isTexture&&value.image?.close)images.add(value.image);});
  disposeModel(model);images.forEach(image=>image.close());
}

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
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
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
    this.lights.children.forEach(light=>light.shadow?.dispose());
    this.lights.clear();
    const values = { studio: [1.2, 3.2, 1.2, 0.8], bright: [2, 4.2, 2, 1.2], dramatic: [0.45, 4.5, 0.25, 1.8] }[preset] || [1.2, 3.2, 1.2, 0.8];
    this.lights.add(new THREE.HemisphereLight(0xffffff, 0x20242e, values[0]));
    [[4, 6, 4, values[1]], [-4, 2, 2, values[2]], [1, 4, -5, values[3]]].forEach(([x, y, z, intensity]) => {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.set(x, y, z);
      this.lights.add(light);
    });
    this.updateShadow();
  }

  setModel(model) {
    this.clearModel();
    this.model = model;
    this.scene.add(model);
    model.traverse(node=>{if(node.isMesh)node.castShadow=true;});
    this.frame();
  }

  clearModel() {
    this.clearShadow();
    if(this.model){this.scene.remove(this.model);disposeThumbnailModel(this.model);this.model=null;}
    if(this.grid){this.scene.remove(this.grid);this.grid.geometry.dispose();this.grid.material.dispose();this.grid=null;}
    this.renderer.renderLists.dispose();
  }

  frame(angle='three-quarter') {
    if (!this.model) return;
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.center = sphere.center.clone();
    this.radius = Math.max(sphere.radius, 0.001);
    const distance = (this.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.18;
    const direction={front:[0,0,1],side:[1,0,0],back:[0,0,-1]}[angle]||[1,.7,1];
    this.controls.enableDamping=false;this.controls.update();
    this.camera.position.copy(this.center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
    this.camera.near = Math.max(distance / 200, 0.001);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(this.center);
    this.controls.update();
    this.controls.enableDamping=true;
    this.updateGrid();
    this.updateShadow();
  }

  clearShadow(){if(this.shadowPlane){this.scene.remove(this.shadowPlane);this.shadowPlane.geometry.dispose();this.shadowPlane.material.dispose();this.shadowPlane=null;}if(this.shadowTarget){this.scene.remove(this.shadowTarget);this.shadowTarget=null;}}
  setShadow(enabled,strength=.3){this.shadowEnabled=enabled;this.shadowStrength=strength;this.updateShadow();}
  updateShadow(){
    this.clearShadow();const key=this.lights.children[1];if(!key)return;key.castShadow=false;key.position.set(4,6,4);key.target=new THREE.Object3D();
    if(!this.shadowEnabled||!this.model)return;
    const box=new THREE.Box3().setFromObject(this.model),center=box.getCenter(new THREE.Vector3()),r=Math.max(box.getSize(new THREE.Vector3()).length()/2,.001);
    this.shadowPlane=new THREE.Mesh(new THREE.PlaneGeometry(r*12,r*12),new THREE.ShadowMaterial({opacity:this.shadowStrength??.3,depthWrite:false}));
    this.shadowPlane.rotation.x=-Math.PI/2;this.shadowPlane.position.set(center.x,box.min.y-r*.002,center.z);this.shadowPlane.receiveShadow=true;this.scene.add(this.shadowPlane);
    this.shadowTarget=new THREE.Object3D();this.shadowTarget.position.copy(center);this.scene.add(this.shadowTarget);key.target=this.shadowTarget;key.position.copy(center).add(new THREE.Vector3(3,6,4).multiplyScalar(r));key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-r*3,right:r*3,top:r*3,bottom:-r*3,near:r*.1,far:r*20});key.shadow.normalBias=r*.005;key.shadow.bias=-.0001;key.shadow.camera.updateProjectionMatrix();
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
    const pixels = new Uint8Array(size * size * 4);
    try {
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(this.background, this.transparent ? 0 : 1);
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    } finally {
    this.renderer.setRenderTarget(null);
    this.camera.aspect = previousAspect;
    this.camera.updateProjectionMatrix();
    if (this.grid) this.grid.visible = gridWasVisible;
    target.dispose();
    }
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
    this.clearModel();
    this.lights.children.forEach(light=>light.shadow?.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

