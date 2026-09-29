import * as THREE from 'three';
import { ThumbnailViewer } from '../thumbnail-maker/ThumbnailViewer.js';
import {fitViews,cameraDirection} from './framing.js';
export class IsometricViewer extends ThumbnailViewer {
  constructor(container) {
    super(container);
    this.controls.enabled=false;
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.001,1000);
    this.controls.object=this.camera;
    this.settings={front:0,elevation:35.26438968,shadow:false};
    this.direction=0;
  }
  // No free orbit: the preview exactly matches an exported direction.
  animate() { if (!this.running) return; requestAnimationFrame(()=>this.animate()); this.render(); }
  resize() {
    const size=Math.min(this.container.clientWidth,this.container.clientHeight);
    if(size) this.renderer.setSize(size,size,false);
  }
  frame() {
    if(!this.model) return;
    this.model.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(this.model,true);
    this.modelBounds=box;
    this.fit=fitViews(box,this.settings?.front||0,this.settings?.elevation||35.26438968,this.settings?.shadow||false);
    this.center=box.getCenter(new THREE.Vector3());
    this.radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,.001);
    this.setDirection(this.direction||0);
    this.updateShadow();
  }
  configure(settings) {
    this.settings=settings;
    this.setBackground(settings.colour,settings.background==='transparent');
    this.setLighting(settings.lighting);
    this.shadowEnabled=settings.shadow; this.shadowStrength=.3;
    this.frame();
  }
  setFront(front) { this.setOrientation(front,this.settings.elevation); }
  setElevation(elevation) { this.setOrientation(this.settings.front,elevation); }
  setOrientation(front,elevation) {
    this.settings={...this.settings,front,elevation};
    if(!this.modelBounds)return;
    this.fit=fitViews(this.modelBounds,front,elevation,this.settings.shadow);
    this.setDirection(this.direction);
  }
  setDirection(index) {
    this.direction=index;
    if(!this.fit) return;
    const f=this.fit;
    Object.assign(this.camera,{left:f.left,right:f.right,top:f.top,bottom:f.bottom,near:f.distance/1000,far:f.distance*3});
    this.camera.position.copy(f.ground).addScaledVector(cameraDirection(index,this.settings.front,this.settings.elevation),f.distance);
    this.camera.lookAt(f.ground); this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }
}
