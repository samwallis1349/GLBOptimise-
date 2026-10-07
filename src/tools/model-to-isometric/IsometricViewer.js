import * as THREE from 'three';
import { ThumbnailViewer } from '../thumbnail-maker/ThumbnailViewer.js';
import {fitViews,cameraDirection} from './framing.js';
import {animatedBounds,frameTimes,inPlaceClip} from './animation.js';
export class IsometricViewer extends ThumbnailViewer {
  constructor(container) {
    super(container);
    this.controls.enabled=false;
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.001,1000);
    this.controls.object=this.camera;
    this.settings={front:0,elevation:35.26438968,shadow:false};
    this.direction=0;
    this.playing=true;
  }
  // No free orbit: the preview exactly matches an exported direction. Animations loop in the preview.
  animate() {
    if (!this.running) return; requestAnimationFrame(()=>this.animate());
    const now=performance.now(),delta=Math.min((now-(this.lastTick??now))/1000,.1);this.lastTick=now;
    if(this.mixer&&this.playing){this.playhead=(this.playhead+delta)%this.animation.duration;this.mixer.setTime(this.playhead);}
    this.render();
  }
  resize() {
    const size=Math.min(this.container.clientWidth,this.container.clientHeight);
    // Also set the CSS size: without it the canvas displays at size × devicePixelRatio and overflows the viewport on scaled screens.
    if(size) this.renderer.setSize(size,size);
  }
  setModel(model) {
    super.setModel(model);
    this.restPose=[];model.traverse(node=>this.restPose.push([node,node.position.clone(),node.quaternion.clone(),node.scale.clone()]));
  }
  clearModel() { this.stopAnimation(); this.restPose=null; this.modelBounds=null; super.clearModel(); }
  stopAnimation() {
    if(this.mixer){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
    this.mixer=null;this.animation=null;
    this.restPose?.forEach(([node,position,quaternion,scale])=>{node.position.copy(position);node.quaternion.copy(quaternion);node.scale.copy(scale);});
  }
  /** index < 0 (or a model without clips) returns to the static rest pose. */
  setAnimation(index,{frames=8,inPlace=true}={}) {
    this.stopAnimation();
    const source=this.model?.animations?.[index];
    if(source){
      const clip=inPlace?inPlaceClip(source,this.model):source,duration=Math.max(clip.duration,1/1000);
      this.mixer=new THREE.AnimationMixer(this.model);this.mixer.clipAction(clip).play();
      this.animation={name:source.name||`Animation ${index+1}`,duration,inPlace,times:frameTimes(duration,frames)};
      this.playhead=0;
    }
    this.modelBounds=null;
    this.frame();
  }
  /** Pose the model at one exported frame (used while capturing). */
  showFrame(time) { if(!this.mixer)return; this.playhead=time; this.mixer.setTime(time); this.model.updateMatrixWorld(true); }
  lock() { const s=this.settings; return s?.scaleMode==='locked'?{pixelsPerUnit:s.pixelsPerUnit,size:s.size}:null; }
  frame() {
    if(!this.model) return;
    if(!this.modelBounds||!this.animation){
      if(this.animation){
        const {duration,times}=this.animation;
        this.modelBounds=animatedBounds(this.model,this.mixer,[...times,...frameTimes(duration,24)]);
        this.mixer.setTime(this.playhead);
      }else{this.model.updateMatrixWorld(true);this.modelBounds=new THREE.Box3().setFromObject(this.model,true);}
    }
    const box=this.modelBounds;
    this.fit=fitViews(box,this.settings?.front||0,this.settings?.elevation||35.26438968,this.settings?.shadow||false,this.lock());
    this.center=box.getCenter(new THREE.Vector3());
    this.radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,.001);
    this.setDirection(this.direction||0);
    this.updateShadow();
    this.onFit?.(this.fit);
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
    this.fit=fitViews(this.modelBounds,front,elevation,this.settings.shadow,this.lock());
    this.setDirection(this.direction);
    this.onFit?.(this.fit);
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
