import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {fitViews,cameraDirection,makeMetadata,DIRECTIONS,ELEVATION_PRESETS,matchElevationPreset} from './framing.js';

test('all eight orthographic views contain tall, wide and offset models at a shared scale and anchor',()=>{
  for(const bounds of [[[-2,-1,-.5],[4,8,2]],[[-20,0,-1],[20,.2,1]],[[2,3,4],[2.01,3.01,4.01]]]){
    const box=new THREE.Box3(new THREE.Vector3(...bounds[0]),new THREE.Vector3(...bounds[1]));
    for(const front of [0,22.5,45,135,315,359.9,360])for(const elevation of [30,35.26438968])for(const shadow of [false,true]){
      const fit=fitViews(box,front,elevation,shadow);let anchor;
      for(let i=0;i<8;i++){
        const camera=new THREE.OrthographicCamera(fit.left,fit.right,fit.top,fit.bottom,fit.distance/1000,fit.distance*3);
        camera.position.copy(fit.ground).addScaledVector(cameraDirection(i,front,elevation),fit.distance);camera.lookAt(fit.ground);camera.updateMatrixWorld();
        const projected=fit.ground.clone().project(camera);const point=[(projected.x+1)/2,(1-projected.y)/2];
        if(anchor)point.forEach((v,k)=>assert.ok(Math.abs(v-anchor[k])<1e-10));anchor=point;
        assert.ok(Math.abs(point[1]-fit.anchor.y)<1e-10);
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
          const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1);
        }
      }
    }
  }
});
test('metadata preserves direction order, angles and sheet coordinates at every output size',()=>{
  const fit=fitViews(new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,3,1)));
  for(const size of [256,512,1024,2048]){
    const m=makeMetadata('example',size,{front:315,elevation:30},fit);
    assert.deepEqual(m.frames.map(f=>f.direction),DIRECTIONS);assert.deepEqual(m.frames.map(f=>f.angle),[315,0,45,90,135,180,225,270]);
    assert.equal(m.width,4*size);assert.equal(m.height,2*size);
    m.frames.forEach(f=>{assert.ok(f.x+f.width<=m.width);assert.ok(f.y+f.height<=m.height);});
    assert.equal(new Set(m.frames.map(f=>`${f.x},${f.y}`)).size,8);
  }
});
test('empty geometry is rejected',()=>assert.throws(()=>fitViews(new THREE.Box3()),/no visible geometry/));
test('elevation presets give their stated diamond-tile ratios and match nearby angles',()=>{
  const ratio=angle=>{const box=new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,0.0001,1));const fit=fitViews(box,0,angle);
    const camera=new THREE.OrthographicCamera(fit.left,fit.right,fit.top,fit.bottom,fit.distance/1000,fit.distance*3);
    camera.position.copy(fit.ground).addScaledVector(cameraDirection(1,0,angle),fit.distance);camera.lookAt(fit.ground);camera.updateMatrixWorld();
    const p=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>new THREE.Vector3(x,0,z).project(camera));
    const w=Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x)),h=Math.max(...p.map(v=>v.y))-Math.min(...p.map(v=>v.y));return w/h;};
  assert.ok(Math.abs(ratio(ELEVATION_PRESETS.find(p=>p.id==='pixel-art').angle)-2)<1e-9);
  assert.ok(Math.abs(ratio(ELEVATION_PRESETS.find(p=>p.id==='true-isometric').angle)-Math.sqrt(3))<1e-6);
  assert.equal(matchElevationPreset(35.3)?.id,'true-isometric');assert.equal(matchElevationPreset(30.02)?.id,'pixel-art');assert.equal(matchElevationPreset(33),null);
});
test('locked world scale gives every model the same pixels per metre and ground pixel',()=>{
  const size=512,ppu=64,anchors=[];
  for(const [min,max] of [[[-.5,0,-.5],[.5,1,.5]],[[3,2,-7],[4.5,4,-5]]]){
    const box=new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max));
    const fit=fitViews(box,0,30,false,{pixelsPerUnit:ppu,size});
    assert.ok(Math.abs(fit.span-size/ppu)<1e-12);assert.equal(fit.locked,true);assert.equal(fit.clipped,false);
    const camera=new THREE.OrthographicCamera(fit.left,fit.right,fit.top,fit.bottom,fit.distance/1000,fit.distance*3);
    camera.position.copy(fit.ground).addScaledVector(cameraDirection(3,0,30),fit.distance);camera.lookAt(fit.ground);camera.updateMatrixWorld();
    const p=fit.ground.clone().project(camera);anchors.push([(p.x+1)/2*size,(1-p.y)/2*size]);
    // A 1 m edge seen straight on is ppu pixels wide.
    const a=new THREE.Vector3(box.min.x,box.min.y,box.min.z).project(camera),b=new THREE.Vector3(box.min.x,box.min.y+1,box.min.z).project(camera);
    assert.ok(Math.abs((b.y-a.y)/2*size-ppu*Math.cos(Math.PI/6))<1e-9);
  }
  assert.ok(Math.abs(anchors[0][0]-anchors[1][0])<1e-9&&Math.abs(anchors[0][1]-anchors[1][1])<1e-9&&Math.abs(anchors[0][1]-size*.75)<1e-9);
});
test('locked scale reports clipping exactly at the largest scale that fits',()=>{
  const box=new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,6,1));
  const {maxPixelsPerUnit}=fitViews(box,0,35.26438968,false,{pixelsPerUnit:1,size:512});
  assert.equal(fitViews(box,0,35.26438968,false,{pixelsPerUnit:maxPixelsPerUnit*.999,size:512}).clipped,false);
  assert.equal(fitViews(box,0,35.26438968,false,{pixelsPerUnit:maxPixelsPerUnit*1.01,size:512}).clipped,true);
});
test('animated metadata lays out one row per direction and one column per frame',()=>{
  const fit=fitViews(new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2,1)));
  const m=makeMetadata('hero',128,{front:0,elevation:30},fit,{name:'Walk',duration:1,times:[0,.25,.5,.75],inPlace:true});
  assert.equal(m.width,512);assert.equal(m.height,1024);assert.equal(m.frames.length,32);assert.equal(m.animation.fps,4);
  assert.deepEqual(m.frames[5],{direction:'NE',angle:45,frame:1,time:.25,file:'hero-NE-01.png',x:128,y:128,width:128,height:128});
  assert.equal(new Set(m.frames.map(f=>`${f.x},${f.y}`)).size,32);
});
