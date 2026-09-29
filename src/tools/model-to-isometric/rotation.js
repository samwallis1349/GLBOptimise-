// Drag on the preview to orbit horizontally and vertically. Exports inherit both angles.
export function mountRotation(page,{enabled,changed}) {
  const q=s=>page.querySelector(s),slider=q('[data-front]'),number=q('[data-front-number]'),snap=q('[data-front-snap]'),surface=q('[data-viewer]');
  const elevation=q('[data-elevation-control]'),elevationNumber=q('[data-elevation-number]');let drag=null;
  function setFront(value,{wrap=false,syncNumber=true}={}) {
    if(!Number.isFinite(value))return;
    value=wrap?((value%360)+360)%360:Math.max(0,Math.min(360,value));if(snap.checked)value=Math.round(value/45)*45;value=Math.round(value*10)/10;
    slider.value=String(value);if(syncNumber)number.value=String(value);q('[data-front-value]').textContent=value+'°';
    changed(value,Number(elevation.value));
  }
  function setElevation(value,{syncNumber=true}={}) {
    if(!Number.isFinite(value))return;
    value=Math.max(10,Math.min(80,value));value=Math.round(value*10)/10;elevation.value=String(value);if(syncNumber)elevationNumber.value=String(value);
    const output=q('[data-elevation-value]');if(output)output.textContent=value.toFixed(1)+'°';
    changed(Number(slider.value),value);
  }
  slider.addEventListener('input',()=>{if(enabled())setFront(Number(slider.value));});
  number.addEventListener('input',()=>{if(enabled()&&number.value!=='')setFront(Number(number.value),{syncNumber:false});});
  number.addEventListener('change',()=>{if(enabled())setFront(number.value===''?Number(slider.value):Number(number.value));});
  snap.addEventListener('change',()=>{slider.step=snap.checked?'45':'0.1';if(enabled())setFront(Number(slider.value));});
  q('[data-front-reset]').addEventListener('click',()=>{if(enabled())setFront(0);});
  elevation.addEventListener('input',()=>{if(enabled())setElevation(Number(elevation.value));});
  elevationNumber.addEventListener('input',()=>{if(enabled()&&elevationNumber.value!=='')setElevation(Number(elevationNumber.value),{syncNumber:false});});
  elevationNumber.addEventListener('change',()=>{if(enabled())setElevation(elevationNumber.value===''?Number(elevation.value):Number(elevationNumber.value));});
  q('[data-elevation-reset]').addEventListener('click',()=>{if(enabled())setElevation(35.26438968);});
  function end(event){if(!drag||event.pointerId!==drag.id)return;drag=null;surface.classList.remove('is-rotating');if(surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId);}
  surface.addEventListener('pointerdown',event=>{
    if(!enabled()||!event.isPrimary||event.button!==0||drag)return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,front:Number(slider.value),elevation:Number(elevation.value),width:Math.max(surface.clientWidth,1),height:Math.max(surface.clientHeight,1)};
    surface.setPointerCapture(event.pointerId);surface.classList.add('is-rotating');
  });
  surface.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;if(!enabled()){end(event);return;}
    setFront(drag.front-(event.clientX-drag.x)*360/drag.width,{wrap:true});
    setElevation(drag.elevation-(event.clientY-drag.y)*70/drag.height);
  });
  surface.addEventListener('pointerup',end);surface.addEventListener('pointercancel',end);surface.addEventListener('lostpointercapture',end);
  return()=>{if(drag)end({pointerId:drag.id});};
}
