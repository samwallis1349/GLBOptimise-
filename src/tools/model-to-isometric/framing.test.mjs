import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {fitViews,cameraDirection,makeMetadata,DIRECTIONS} from './framing.js';

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
