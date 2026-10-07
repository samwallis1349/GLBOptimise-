import {mountRotation} from './rotation.js';
import {makeDownload,makeStrip,sheetTooLarge} from './downloads.js';
import {FRAME_COUNTS} from './animation.js';
import {createDemoBuilding} from './demo.js';
import {IsometricViewer} from './IsometricViewer.js';
import {loadModel} from './loadModel.js';
import {disposeThumbnailModel} from './modelResources.js';
import {DIRECTIONS,ELEVATION_PRESETS,makeMetadata,matchElevationPreset} from './framing.js';
import './isometric.css';

export function mount(container) {
  const page=document.createElement('main'); page.className='iso-page container section';
  page.innerHTML=`<header class="iso-heading"><div><p class="iso-eyebrow">MODEL IN / EIGHT VIEWS OUT</p><h1>Model to <span>Isometric</span></h1><p>One model. Every direction. Create consistent sprites for your next world.</p></div><span class="iso-local">● Local processing</span></header>
  <div class="iso-upload" tabindex="0" role="button" aria-label="Choose or drop a GLB or FBX"><span class="iso-upload-icon">◇</span><div><strong>Drop your model here</strong><p>GLB or self-contained FBX · up to 200 MB · animations supported</p></div><button class="iso-button" data-choose>Choose model</button><button class="iso-button" data-demo>Try sample building</button><input type="file" accept=".glb,.fbx" data-file hidden></div>
  <p class="iso-status" role="status" aria-live="polite">Choose a model to begin. Your files stay on this device.</p>
  <div class="iso-workspace"><section class="iso-panel"><div class="iso-panel-heading"><h2>01 / Compose</h2><span data-name>No model loaded</span></div><div class="iso-viewport"><div data-viewer></div><div class="iso-empty">◇<span>Your model, from every angle</span></div><span class="iso-view-label">N / Orthographic</span></div><div class="iso-directions" role="group" aria-label="Preview direction">${DIRECTIONS.map((d,i)=>`<button data-direction="${i}" aria-pressed="${i===0}">${d}</button>`).join('')}</div><p class="iso-tip">Drag left/right to rotate; drag up/down to change camera elevation. Eight views stay 45&deg; apart.</p></section>
  <aside class="iso-panel iso-controls"><h2>02 / Render settings</h2><fieldset disabled data-settings>
  <label>Resolution<select data-size><option>256</option><option>512</option><option selected>1024</option><option>2048</option></select></label>
  <div class="iso-elevation"><label>Camera elevation<select data-elevation>${ELEVATION_PRESETS.map(p=>`<option value="${p.angle}">${p.label} &middot; ${Math.round(p.angle*1000)/1000}&deg;</option>`).join('')}<option value="custom">Custom</option></select></label>
  <p class="iso-tip iso-elevation-note" data-elevation-note>${ELEVATION_PRESETS[0].note}</p>
  <label>Elevation angle <output data-elevation-value>35.3&deg;</output><input data-elevation-control type="range" min="10" max="80" step="any" value="35.26438968"></label>
  <div class="iso-rotation-row"><label>Degrees<input data-elevation-number type="number" min="10" max="80" step="0.1" value="35.264"></label><button type="button" class="iso-button" data-elevation-reset>Reset elevation</button></div></div>
  <div class="iso-rotation">
  <label>Starting rotation <output data-front-value>0&deg;</output><input data-front type="range" min="0" max="360" step="0.1" value="0"></label>
  <div class="iso-rotation-row"><label>Degrees<input data-front-number type="number" min="0" max="360" step="0.1" value="0"></label><button type="button" class="iso-button" data-front-reset>Reset rotation</button></div>
  <label class="iso-check"><input data-front-snap type="checkbox">Snap to 45&deg;</label>
  </div>
  <div class="iso-animation"><label>Animation<select data-animation disabled><option value="-1">No animations in this model</option></select></label>
  <div data-animation-options hidden><label>Frames per direction<select data-frames>${FRAME_COUNTS.map(n=>`<option${n===8?' selected':''}>${n}</option>`).join('')}</select></label>
  <label class="iso-check"><input data-in-place type="checkbox" checked>Keep in place (remove walking travel)</label></div>
  <p class="iso-tip iso-elevation-note" data-animation-note>Static rest pose. Load a model with animation clips to render animated sprites.</p></div>
  <div class="iso-scale"><label>Scale<select data-scale><option value="fit">Fit each model to its frame</option><option value="locked">Lock world scale (keep models in proportion)</option></select></label>
  <label data-ppu-field hidden>Pixels per metre<input data-ppu type="number" min="1" max="4096" step="1" value="128"></label>
  <p class="iso-tip iso-elevation-note" data-scale-note>Each model fills its frame.</p></div>
  <label>Background<select data-background><option value="transparent">Transparent</option><option value="colour">Solid colour</option></select></label>
  <label data-colour-field hidden>Background colour<input data-colour type="color" value="#111827"></label>
  <label>Lighting<select data-lighting><option value="studio">Studio</option><option value="bright">Bright</option><option value="dramatic">Dramatic</option></select></label>
  <label class="iso-check"><input data-shadow type="checkbox">Soft ground shadow</label>
  </fieldset><button class="iso-button iso-primary" data-generate disabled>Generate 8 Views</button><progress max="8" value="0" hidden></progress><p class="iso-tip">Fixed scale and ground anchor across all eight views. Lighting stays fixed around the model.</p></aside></div>
  <section class="iso-results" hidden><div class="iso-results-heading"><div><p class="iso-eyebrow">03 / YOUR SPRITE COLLECTION</p><h2>Eight views. One consistent scale.</h2><p data-result-note></p></div><div class="iso-downloads"><button class="iso-button iso-primary" data-zip>Download All ZIP</button><button class="iso-button" data-sheet>Download Sprite Sheet ZIP</button></div></div><div class="iso-grid"></div><p class="iso-tip" data-sheet-note></p></section>`;
  container.replaceChildren(page);
  const q=s=>page.querySelector(s);
  let viewer=null,busy=false,dead=false,baseName='model',results=[],metadata=null,direction=0,cycle=null;
  const SCALE_KEY='assetbench.isometric.scale';
  try{const saved=JSON.parse(localStorage.getItem(SCALE_KEY)||'null');if(saved){q('[data-scale]').value=saved.mode==='locked'?'locked':'fit';if(saved.pixelsPerUnit>0)q('[data-ppu]').value=String(saved.pixelsPerUnit);}}catch{}
  q('[data-ppu-field]').hidden=q('[data-scale]').value!=='locked';
  const settings=()=>({scaleMode:q('[data-scale]').value,pixelsPerUnit:Math.min(4096,Math.max(1,Number(q('[data-ppu]').value)||128)),size:Number(q('[data-size]').value),elevation:Number(q('[data-elevation-control]').value),front:Number(q('[data-front]').value),background:q('[data-background]').value,colour:q('[data-colour]').value,lighting:q('[data-lighting]').value,shadow:q('[data-shadow]').checked});
  function notice(text,error=false){q('.iso-status').textContent=text;q('.iso-status').classList.toggle('is-error',error);}
  function lock(value){busy=value;q('[data-settings]').disabled=value||!viewer?.model;q('[data-generate]').disabled=value||!viewer?.model;q('[data-choose]').disabled=value;q('[data-demo]').disabled=value;page.querySelectorAll('[data-direction],.iso-results button').forEach(b=>b.disabled=value||!viewer?.model);q('[data-animation]').disabled=value||q('[data-animation]').dataset.available!=='true';q('[data-generate]').textContent=value?'Working…':viewer?.animation?`Generate ${8*viewer.animation.times.length} Sprites`:'Generate 8 Views';}
  function clearResults(){clearInterval(cycle);cycle=null;results.forEach(r=>URL.revokeObjectURL(r.url));results=[];metadata=null;q('.iso-grid').replaceChildren();q('.iso-results').hidden=true;}
  function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function ensureViewer(){if(!viewer){viewer=new IsometricViewer(q('[data-viewer]'));viewer.onFit=updateScaleNote;}return viewer;}
  function updateScaleNote(fit){
    const note=q('[data-scale-note]');
    if(!fit?.locked){note.textContent='Each model fills its frame. Lock the scale to keep a set of models in proportion.';note.classList.remove('is-error');return;}
    const ppu=settings().pixelsPerUnit,max=Math.floor(fit.maxPixelsPerUnit);
    note.textContent=fit.clipped?`Too big for the frame at ${ppu} px per metre. This model fits up to ${max} px per metre.`:`1 m = ${ppu} px. The ground point sits 75% down every frame. This model fits up to ${max} px per metre.`;
    note.classList.toggle('is-error',fit.clipped);
  }
  function populateAnimations(){
    const clips=viewer?.model?.animations||[],select=q('[data-animation]');
    select.replaceChildren(...[clips.length?'Rest pose (no animation)':'No animations in this model',...clips.map((clip,i)=>clip.name||`Animation ${i+1}`)].map((text,i)=>{const option=document.createElement('option');option.value=String(i-1);option.textContent=text;return option;}));
    select.dataset.available=String(clips.length>0);select.disabled=!clips.length||busy;syncAnimation();
  }
  function applyAnimation(){
    if(!viewer?.model)return;
    viewer.setAnimation(Number(q('[data-animation]').value),{frames:Number(q('[data-frames]').value),inPlace:q('[data-in-place]').checked});
    syncAnimation();lock(busy);
    if(results.length)q('[data-result-note]').textContent='Animation changed. Generate again to update these downloads.';
  }
  function syncAnimation(){
    const a=viewer?.animation,clips=viewer?.model?.animations?.length||0;
    q('[data-animation-options]').hidden=!a;
    // 2048 px × up to 128 sprites is too much memory for most browsers.
    const big=[...q('[data-size]').options].find(o=>o.textContent==='2048');big.disabled=!!a;if(a&&q('[data-size]').value==='2048'){q('[data-size]').value='1024';viewer.configure(settings());}
    q('[data-animation-note]').textContent=a?`${a.times.length} frames over ${a.duration.toFixed(2)} s per direction · ${8*a.times.length} sprites. Rows are directions, columns are frames.`:clips?`${clips} animation${clips===1?'':'s'} found. Choose one to render animated sprites.`:'Static rest pose. Load a model with animation clips to render animated sprites.';
  }
  function apply(){q('[data-ppu-field]').hidden=q('[data-scale]').value!=='locked';try{localStorage.setItem(SCALE_KEY,JSON.stringify({mode:q('[data-scale]').value,pixelsPerUnit:settings().pixelsPerUnit}));}catch{}q('[data-front-value]').textContent=q('[data-front]').value+'°';q('[data-colour-field]').hidden=q('[data-background]').value!=='colour';viewer?.configure(settings());if(results.length)q('[data-result-note]').textContent='Settings changed. Generate again to update these downloads.';}
  function showDirection(i){direction=i;viewer?.setDirection(i);q('.iso-view-label').textContent=DIRECTIONS[i]+' / Orthographic';page.querySelectorAll('[data-direction]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.direction)===i)));}
  async function select(file){
    if(!file||busy||dead)return;
    lock(true);notice('Loading model and embedded textures…');
    let model;
    try {
      model=await loadModel(file);
      if(dead){disposeThumbnailModel(model);return;}
      ensureViewer();
      viewer.setModel(model);model=null;viewer.configure(settings());populateAnimations();showDirection(0);
      baseName=file.name.replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,80)||'model';
      clearResults();q('[data-name]').textContent=file.name;q('.iso-empty').hidden=true;notice('Ready. Choose your settings, then generate eight views.');
    }catch(error){if(model&&model!==viewer?.model)disposeThumbnailModel(model);notice(error.message||'Could not load this model.',true);}
    finally{if(!dead)lock(false);}
  }
  q('[data-demo]').onclick=e=>{
    e.stopPropagation();if(busy)return;
    try{ensureViewer();viewer.setModel(createDemoBuilding());viewer.configure(settings());populateAnimations();showDirection(0);baseName='sample-workshop';clearResults();q('[data-name]').textContent='Sample workshop';q('.iso-empty').hidden=true;notice('Sample loaded. Try the Weathervane spin animation, generate eight views, or choose your own model.');}
    catch(error){notice(error.message,true);}finally{lock(false);}
  };
  q('[data-choose]').onclick=e=>{e.stopPropagation();if(!busy)q('[data-file]').click();};
  q('.iso-upload').onclick=e=>{if(e.target!==q('[data-file]')&&!busy)q('[data-file]').click();};
  q('.iso-upload').onkeydown=e=>{if(e.target===q('.iso-upload')&&['Enter',' '].includes(e.key)){e.preventDefault();if(!busy)q('[data-file]').click();}};
  q('[data-file]').onchange=e=>{select(e.target.files[0]);e.target.value='';};
  q('.iso-upload').ondragover=e=>{e.preventDefault();};q('.iso-upload').ondrop=e=>{e.preventDefault();select(e.dataTransfer.files[0]);};
  const disposeRotation=mountRotation(page,{
    enabled:()=>!dead&&!busy&&!!viewer?.model,
    changed:(front,elevation)=>{syncPreset(elevation);viewer?.setOrientation(front,elevation);if(results.length)q('[data-result-note]').textContent='View angle changed. Generate again to update these downloads.';},
  });
  q('[data-elevation]').onchange=()=>{const preset=q('[data-elevation]').value;if(preset!=='custom')q('[data-elevation-control]').value=preset;syncElevation();viewer?.setElevation(Number(q('[data-elevation-control]').value));};
  function syncElevation(){const value=Number(q('[data-elevation-control]').value);q('[data-elevation-number]').value=String(Math.round(value*1000)/1000);q('[data-elevation-value]').textContent=value.toFixed(1)+'\u00b0';syncPreset(value);}
  function syncPreset(value){const preset=matchElevationPreset(value);q('[data-elevation]').value=preset?String(preset.angle):'custom';q('[data-elevation-note]').textContent=preset?preset.note:'Custom angle. Drag up/down on the preview or type a value.';}
  q('[data-elevation-control]').addEventListener('input',()=>{if(!busy){syncElevation();viewer?.setElevation(Number(q('[data-elevation-control]').value));}});
  q('[data-elevation-number]').addEventListener('input',()=>{if(!busy&&q('[data-elevation-number]').value!==''){q('[data-elevation-control]').value=q('[data-elevation-number]').value;syncElevation();viewer?.setElevation(Number(q('[data-elevation-control]').value));}});
  q('[data-elevation-reset]').onclick=()=>{if(!busy){q('[data-elevation-control]').value='35.26438968';syncElevation();viewer?.setElevation(35.26438968);}};
  q('[data-settings]').oninput=event=>{if(!busy&&!event.target.closest('.iso-rotation')&&!event.target.closest('.iso-elevation')&&!event.target.closest('.iso-animation'))apply();};
  page.querySelectorAll('[data-animation],[data-frames],[data-in-place]').forEach(input=>input.addEventListener('change',()=>{if(!busy)applyAnimation();}));
  page.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>{if(!busy)showDirection(Number(b.dataset.direction));});
  q('[data-generate]').onclick=async()=>{
    if(busy||!viewer?.model)return;clearResults();lock(true);const config=settings(),prior=direction;
    const anim=viewer.animation,times=anim?anim.times:[null],count=times.length,total=8*count;
    const progress=q('progress');progress.hidden=false;progress.value=0;progress.max=total;viewer.playing=false;
    try{
      viewer.configure(config);
      if(viewer.fit.clipped)throw Error(`the model is too big for the frame at ${config.pixelsPerUnit} px per metre. Lower it to ${Math.floor(viewer.fit.maxPixelsPerUnit)} or less, or switch Scale to "Fit each model".`);
      metadata=makeMetadata(baseName,config.size,config,viewer.fit,anim&&{name:anim.name,duration:anim.duration,times,inPlace:anim.inPlace});
      for(let i=0;i<8;i++){
        if(dead)return;showDirection(i);
        for(let f=0;f<count;f++){
          notice(anim?`Rendering ${DIRECTIONS[i]} frame ${f+1} of ${count} · ${i*count+f+1} of ${total}`:`Rendering ${DIRECTIONS[i]} · ${i+1} of 8`);
          if(anim)viewer.showFrame(times[f]);
          await new Promise(resolve=>requestAnimationFrame(resolve));if(dead)return;
          const blob=await viewer.capture(config.size);if(dead)return;
          results.push({blob,url:URL.createObjectURL(blob),direction:DIRECTIONS[i],frame:f});progress.value=results.length;
        }
      }
      const grid=q('.iso-grid'),images=[];
      DIRECTIONS.forEach((name,i)=>{
        const own=results.slice(i*count,(i+1)*count),card=document.createElement('article');card.className='iso-result';
        const img=document.createElement('img');img.src=own[0].url;img.alt=`${baseName}, ${name} view${anim?' (animated)':''}`;img.width=img.height=config.size;images.push([img,own]);
        const label=document.createElement('h3');label.textContent=name;
        const button=document.createElement('button');button.className='iso-button';button.textContent=anim?'Download strip PNG':'Download PNG';
        button.onclick=async()=>{if(busy)return;try{save(anim?await makeStrip(own.map(r=>r.blob),config.size):own[0].blob,anim?`${baseName}-${name}-strip.png`:metadata.frames[i].file);}catch(error){notice('Export failed: '+error.message,true);}};
        card.append(img,label,button);grid.append(card);
      });
      if(anim&&!matchMedia('(prefers-reduced-motion: reduce)').matches){let f=0;cycle=setInterval(()=>{f=(f+1)%count;images.forEach(([img,own])=>{img.src=own[f].url;});},1000*anim.duration/count);}
      const sheetOk=!sheetTooLarge(metadata.width,metadata.height);q('[data-sheet]').hidden=!sheetOk;
      q('[data-result-note]').textContent=`${config.size} × ${config.size} px per view · ${anim?`${count} frames × 8 directions · `:''}${config.background==='transparent'?'Transparent':'Solid colour'} background${viewer.fit.locked?` · 1 m = ${config.pixelsPerUnit} px`:''}`;
      q('[data-sheet-note]').textContent=anim?(sheetOk?`Both ZIPs include JSON metadata. Sprite sheet: ${count} columns (frames) × 8 rows (N → NE → E → SE → S → SW → W → NW), ${metadata.width} × ${metadata.height} px.`:`The full sprite sheet (${metadata.width} × ${metadata.height} px) is too large for the browser. Use Download All ZIP or the strip for each direction.`):'Both ZIPs include JSON metadata. Sprite sheet: 4 columns × 2 rows, N → NE → E → SE → S → SW → W → NW.';
      q('.iso-results').hidden=false;notice(anim?`${total} sprites ready. Download each direction as a strip, or the complete collection.`:'Eight views ready. Download individual PNGs or a complete collection.');
    }catch(error){clearResults();if(!dead)notice('Render failed: '+error.message,true);}
    finally{if(!dead){viewer.playing=true;showDirection(prior);progress.hidden=true;lock(false);}}
  };
  async function archive(sheet){
    if(busy||!metadata||results.length!==metadata.frames.length)return;lock(true);notice(sheet?'Building the sprite sheet…':'Preparing your PNG collection…');
    try{
      const blob=await makeDownload(results,metadata,sheet);if(!dead){save(blob,`${baseName}-${sheet?'sprite-sheet':metadata.animation?'animated-sprites':'eight-views'}.zip`);notice('Download ready.');}
    }catch(error){if(!dead)notice('Export failed: '+error.message,true);}
    finally{if(!dead)lock(false);}
  }
  q('[data-zip]').onclick=()=>archive(false);q('[data-sheet]').onclick=()=>archive(true);
  lock(false);
  if(new URLSearchParams(window.location.search).get('sample')==='1')q('[data-demo]').click();
  return()=>{dead=true;disposeRotation();clearResults();viewer?.dispose();};
}
