import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {animatedBounds,frameTimes,inPlaceClip} from './animation.js';

test('frame times are evenly spaced and leave out the loop end',()=>{
  assert.deepEqual(frameTimes(2,4),[0,.5,1,1.5]);
});
test('keep in place removes forward travel in world space but keeps sway and bob',()=>{
  // Armature rotated like many FBX/Mixamo exports: the hips' local Y axis points along world Z.
  const model=new THREE.Group(),armature=new THREE.Group(),hips=new THREE.Object3D();
  armature.rotation.x=Math.PI/2;hips.name='Hips';armature.add(hips);model.add(armature);
  // Local [x, y, z]: x = sway, y = forward travel (world +Z), z = bob (world -Y).
  const clip=new THREE.AnimationClip('Walk',1,[new THREE.VectorKeyframeTrack('Hips.position',[0,.5,1],[0,0,0, .2,1,-.1, 0,2,0])]);
  const stripped=inPlaceClip(clip,model).tracks[0].values;
  assert.deepEqual([...clip.tracks[0].values],[...Float32Array.from([0,0,0,.2,1,-.1,0,2,0])],'source clip untouched');
  const close=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-6);
  assert.ok(close([...stripped],[0,0,0, .2,0,-.1, 0,0,0]),String([...stripped]));
});
test('clips without position tracks are returned unchanged',()=>{
  const model=new THREE.Group(),vane=new THREE.Object3D();vane.name='Vane';model.add(vane);
  const clip=new THREE.AnimationClip('Spin',1,[new THREE.QuaternionKeyframeTrack('Vane.quaternion',[0,1],[0,0,0,1,0,0,0,1])]);
  assert.equal(inPlaceClip(clip,model),clip);
});
test('animated bounds cover every sampled pose',()=>{
  const model=new THREE.Group(),box=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));box.name='Box';model.add(box);
  const mixer=new THREE.AnimationMixer(model);
  mixer.clipAction(new THREE.AnimationClip('Slide',1,[new THREE.VectorKeyframeTrack('Box.position',[0,1],[0,0,0,4,0,0])])).play();
  const bounds=animatedBounds(model,mixer,frameTimes(1,4).concat(.99));
  assert.ok(bounds.min.x<=-.5+1e-9&&bounds.max.x>3.4,`${bounds.min.x} ${bounds.max.x}`);
});
