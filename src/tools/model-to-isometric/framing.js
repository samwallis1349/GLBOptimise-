import * as THREE from 'three';
export const DIRECTIONS = ['N','NE','E','SE','S','SW','W','NW'];
// Named camera elevations. A square floor tile seen corner-on projects to a diamond whose height:width is sin(elevation).
export const ELEVATION_PRESETS = [
  {id:'true-isometric',label:'True isometric',angle:35.26438968,note:'Equal 120° axes. Diamond tiles 1.73 : 1.'},
  {id:'pixel-art',label:'2:1 pixel-art isometric',angle:30,note:'The game standard: 2 : 1 diamond tiles, clean pixel lines. SimCity 2000, Age of Empires II, Diablo II.'},
  {id:'three-quarter',label:'Three-quarter overhead',angle:45,note:'Higher camera for tactics and strategy maps. Diamond tiles 1.41 : 1.'},
  {id:'top-down',label:'Steep top-down',angle:60,note:'Mostly overhead with some front visible. Diamond tiles 1.15 : 1.'},
];
export function matchElevationPreset(elevation) { return ELEVATION_PRESETS.find(p => Math.abs(p.angle - elevation) < 0.05) || null; }
export function directionAngle(index, front = 0) { return ((front + index * 45) % 360 + 360) % 360; }
export function cameraDirection(index, front, elevation) {
  const az = THREE.MathUtils.degToRad(directionAngle(index, front));
  const el = THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(Math.sin(az)*Math.cos(el), Math.sin(el), Math.cos(az)*Math.cos(el));
}
// With a locked world scale the ground point sits this far down every frame, so sprites from different models line up.
export const LOCKED_GROUND_Y = 0.75;
// Project the same world bounds into all eight cameras, then use ONE square frustum.
// lock = {pixelsPerUnit, size} swaps "fit this model" for a fixed world scale shared by every model.
export function fitViews(box, front = 0, elevation = 35.26438968, shadow = false, lock = null) {
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
  const distance=Math.max(box.getSize(new THREE.Vector3()).length()*3,0.1);
  if (lock?.pixelsPerUnit > 0 && lock.size > 0) {
    const span=lock.size/lock.pixelsPerUnit, top=span*LOCKED_GROUND_Y;
    const needed=Math.max(halfX*2,maxY/LOCKED_GROUND_Y,-minY/(1-LOCKED_GROUND_Y),0.001);
    return {ground,span,left:-span/2,right:span/2,top,bottom:top-span,distance,
      anchor:{x:0.5,y:LOCKED_GROUND_Y},locked:true,clipped:needed>span*(1+1e-9),maxPixelsPerUnit:lock.size/needed};
  }
  const span=Math.max(halfX*2,maxY-minY,0.001)*(shadow?1.5:1.16);
  const middle=(minY+maxY)/2;
  return {ground,span,left:-span/2,right:span/2,top:middle+span/2,bottom:middle-span/2,distance,
    anchor:{x:0.5,y:(middle+span/2)/span},locked:false,clipped:false};
}
// Static: a 4 × 2 sheet, one view per direction. Animated: one row per direction, one column per frame.
export function makeMetadata(name, size, settings, fit, animation = null) {
  const scale={mode:fit.locked?'locked':'fit',pixelsPerUnit:size/fit.span};
  const common={version:1,name,image:`${name}-isometric-sheet.png`,projection:'orthographic',elevation:settings.elevation,frontDegrees:settings.front,
    directionConvention:'N views from +Z at front=0; E views from +X; angles are camera azimuths around +Y.',
    groundAnchor:{normalized:fit.anchor,pixels:{x:fit.anchor.x*size,y:fit.anchor.y*size}},worldUnitsPerFrame:fit.span,scale};
  if (!animation) return {...common,width:size*4,height:size*2,frames:DIRECTIONS.map((direction,i)=>({direction,angle:directionAngle(i,settings.front),
    file:`${name}-${direction}.png`,x:(i%4)*size,y:Math.floor(i/4)*size,width:size,height:size}))};
  const count=animation.times.length,pad=n=>String(n).padStart(2,'0');
  return {...common,width:size*count,height:size*8,
    animation:{name:animation.name,frameCount:count,duration:animation.duration,fps:count/animation.duration,inPlace:animation.inPlace,layout:'rows are directions (N → NW), columns are frames'},
    frames:DIRECTIONS.flatMap((direction,d)=>animation.times.map((time,f)=>({direction,angle:directionAngle(d,settings.front),frame:f,time,
      file:`${name}-${direction}-${pad(f)}.png`,x:f*size,y:d*size,width:size,height:size})))};
}
