import * as THREE from 'three';
export function createDemoBuilding(){
  const model=new THREE.Group();model.name='Sample workshop';
  const wall=new THREE.MeshStandardMaterial({color:0x8ac7e8,roughness:.8});
  const roof=new THREE.MeshStandardMaterial({color:0x174781,roughness:.7});
  const trim=new THREE.MeshStandardMaterial({color:0xe3f2fc,roughness:.6});
  const dark=new THREE.MeshStandardMaterial({color:0x123452,roughness:.7});
  function block(w,h,d,x,y,z,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);model.add(mesh);return mesh;}
  block(2.8,.18,2.2,0,.09,0,trim);block(2.5,2,1.9,0,1.18,0,wall);
  const top=new THREE.Mesh(new THREE.ConeGeometry(1.95,1.1,4),roof);top.rotation.y=Math.PI/4;top.scale.z=.8;top.position.y=2.73;model.add(top);
  block(.38,1,.38,.7,2.9,-.35,dark);block(.6,1.2,.08,-.4,.8,.99,dark);
  block(.65,.6,.06,.65,1.4,.99,trim);block(.5,.45,.07,.65,1.4,1.03,dark);
  block(.06,.55,.6,1.28,1.4,.25,trim);block(.07,.4,.45,1.32,1.4,.25,dark);
  block(.7,.25,.5,-.4,.2,1.2,trim);return model;
}
