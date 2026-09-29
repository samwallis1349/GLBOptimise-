import * as THREE from 'three';
export const DIRECTIONS = ['N','NE','E','SE','S','SW','W','NW'];
export function directionAngle(index, front = 0) { return ((front + index * 45) % 360 + 360) % 360; }
export function cameraDirection(index, front, elevation) {
  const az = THREE.MathUtils.degToRad(directionAngle(index, front));
  const el = THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(Math.sin(az)*Math.cos(el), Math.sin(el), Math.cos(az)*Math.cos(el));
}
// Project the same world bounds into all eight cameras, then use ONE square frustum.
export function fitViews(box, front = 0, elevation = 35.26438968, shadow = false) {
  if (box.isEmpty()) throw Error('This model has no visible geometry.');
  const ground = box.getCenter(new THREE.Vector3()); ground.y = box.min.y;
  let minY = Infinity, maxY = -Infinity, halfX = 0;
  for (let i=0;i<8;i++) {
    const direction=cameraDirection(i,front,elevation);
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
    const up=new THREE.Vector3().crossVectors(direction,right).normalize();
    for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
      const point=new THREE.Vector3(x,y,z).sub(ground);
      halfX=Math.max(halfX,Math.abs(point.dot(right)));
      minY=Math.min(minY,point.dot(up)); maxY=Math.max(maxY,point.dot(up));
    }
  }
  const span=Math.max(halfX*2,maxY-minY,0.001)*(shadow?1.5:1.16);
  const middle=(minY+maxY)/2;
  return {ground,span,left:-span/2,right:span/2,top:middle+span/2,bottom:middle-span/2,
    distance:Math.max(box.getSize(new THREE.Vector3()).length()*3,0.1),
    anchor:{x:0.5,y:(middle+span/2)/span}};
}
export function makeMetadata(name, size, settings, fit) {
  return {version:1,name,image:`${name}-isometric-sheet.png`,width:size*4,height:size*2,
    projection:'orthographic',elevation:settings.elevation,frontDegrees:settings.front,
    directionConvention:'N views from +Z at front=0; E views from +X; angles are camera azimuths around +Y.',
    groundAnchor:{normalized:fit.anchor,pixels:{x:fit.anchor.x*size,y:fit.anchor.y*size}},
    worldUnitsPerFrame:fit.span,frames:DIRECTIONS.map((direction,i)=>({direction,angle:directionAngle(i,settings.front),
      file:`${name}-${direction}.png`,x:(i%4)*size,y:Math.floor(i/4)*size,width:size,height:size}))};
}
