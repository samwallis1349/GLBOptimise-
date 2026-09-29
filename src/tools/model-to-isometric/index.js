import {mountRotation} from './rotation.js';
import {makeDownload} from './downloads.js';
import {createDemoBuilding} from './demo.js';
import {IsometricViewer} from './IsometricViewer.js';
import {loadModel} from './loadModel.js';
import {disposeThumbnailModel} from './modelResources.js';
import {DIRECTIONS,makeMetadata} from './framing.js';
import './isometric.css';

export function mount(container) {
  const page=document.createElement('main'); page.className='iso-page container section';
  page.innerHTML=`<header class="iso-heading"><div><p class="iso-eyebrow">MODEL IN / EIGHT VIEWS OUT</p><h1>Model to <span>Isometric</span></h1><p>One model. Every direction. Create consistent sprites for your next world.</p></div><span class="iso-local">● Local processing</span></header>
  <div class="iso-upload" tabindex="0" role="button" aria-label="Choose or drop a GLB or FBX"><span class="iso-upload-icon">◇</span><div><strong>Drop your model here</strong><p>GLB or self-contained FBX · up to 200 MB · static rest pose</p></div><button class="iso-button" data-choose>Choose model</button><button class="iso-button" data-demo>Try sample building</button><input type="file" accept=".glb,.fbx" data-file hidden></div>
  <p class="iso-status" role="status" aria-live="polite">Choose a model to begin. Your files stay on this device.</p>
  <div class="iso-workspace"><section class="iso-panel"><div class="iso-panel-heading"><h2>01 / Compose</h2><span data-name>No model loaded</span></div><div class="iso-viewport"><div data-viewer></div><div class="iso-empty">◇<span>Your model, from every angle</span></div><span class="iso-view-label">N / Orthographic</span></div><div class="iso-directions" role="group" aria-label="Preview direction">${DIRECTIONS.map((d,i)=>`<button data-direction="${i}" aria-pressed="${i===0}">${d}</button>`).join('')}</div><p class="iso-tip">Drag left/right to rotate; drag up/down to change camera elevation. Eight views stay 45&deg; apart.</p></section>
  <aside class="iso-panel iso-controls"><h2>02 / Render settings</h2><fieldset disabled data-settings>
  <label>Resolution<select data-size><option>256</option><option>512</option><option selected>1024</option><option>2048</option></select></label>
  <div class="iso-elevation"><label>Camera elevation<select data-elevation><option value="35.26438968">True isometric &middot; 35.264&deg;</option><option value="30">Game art &middot; 30&deg;</option><option value="custom">Custom</option></select></label>
  <label>Elevation angle <output data-elevation-value>35.3&deg;</output><input data-elevation-control type="range" min="10" max="80" step="0.1" value="35.26438968"></label>
  <div class="iso-rotation-row"><label>Degrees<input data-elevation-number type="number" min="10" max="80" step="0.1" value="35.264"></label><button type="button" class="iso-button" data-elevation-reset>Reset elevation</button></div></div>
  <div class="iso-rotation">
  <label>Starting rotation <output data-front-value>0&deg;</output><input data-front type="range" min="0" max="360" step="0.1" value="0"></label>
  <div class="iso-rotation-row"><label>Degrees<input data-front-number type="number" min="0" max="360" step="0.1" value="0"></label><button type="button" class="iso-button" data-front-reset>Reset rotation</button></div>
  <label class="iso-check"><input data-front-snap type="checkbox">Snap to 45&deg;</label>
  </div>
  <label>Background<select data-background><option value="transparent">Transparent</option><option value="colour">Solid colour</option></select></label>
  <label data-colour-field hidden>Background colour<input data-colour type="color" value="#111827"></label>
  <label>Lighting<select data-lighting><option value="studio">Studio</option><option value="bright">Bright</option><option value="dramatic">Dramatic</option></select></label>
  <label class="iso-check"><input data-shadow type="checkbox">Soft ground shadow</label>
  </fieldset><button class="iso-button iso-primary" data-generate disabled>Generate 8 Views</button><progress max="8" value="0" hidden></progress><p class="iso-tip">Fixed scale and ground anchor across all eight views. Lighting stays fixed around the model.</p></aside></div>
  <section class="iso-results" hidden><div class="iso-results-heading"><div><p class="iso-eyebrow">03 / YOUR SPRITE COLLECTION</p><h2>Eight views. One consistent scale.</h2><p data-result-note></p></div><div class="iso-downloads"><button class="iso-button iso-primary" data-zip>Download All ZIP</button><button class="iso-button" data-sheet>Download Sprite Sheet ZIP</button></div></div><div class="iso-grid"></div><p class="iso-tip">Both ZIPs include JSON metadata. Sprite sheet: 4 columns × 2 rows, N → NE → E → SE → S → SW → W → NW.</p></section>`;
  container.replaceChildren(page);
  const q=s=>page.querySelector(s);
  let viewer=null,busy=false,dead=false,baseName='model',results=[],metadata=null,direction=0;
  const settings=()=>({size:Number(q('[data-size]').value),elevation:Number(q('[data-elevation-control]').value),front:Number(q('[data-front]').value),background:q('[data-background]').value,colour:q('[data-colour]').value,lighting:q('[data-lighting]').value,shadow:q('[data-shadow]').checked});
  function notice(text,error=false){q('.iso-status').textContent=text;q('.iso-status').classList.toggle('is-error',error);}
  function lock(value){busy=value;q('[data-settings]').disabled=value||!viewer?.model;q('[data-generate]').disabled=value||!viewer?.model;q('[data-choose]').disabled=value;q('[data-demo]').disabled=value;page.querySelectorAll('[data-direction],.iso-results button').forEach(b=>b.disabled=value||!viewer?.model);q('[data-generate]').textContent=value?'Working…':'Generate 8 Views';}
  function clearResults(){results.forEach(r=>URL.revokeObjectURL(r.url));results=[];metadata=null;q('.iso-grid').replaceChildren();q('.iso-results').hidden=true;}
  function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function apply(){q('[data-front-value]').textContent=q('[data-front]').value+'°';q('[data-colour-field]').hidden=q('[data-background]').value!=='colour';viewer?.configure(settings());if(results.length)q('[data-result-note]').textContent='Settings changed. Generate again to update these downloads.';}
  function showDirection(i){direction=i;viewer?.setDirection(i);q('.iso-view-label').textContent=DIRECTIONS[i]+' / Orthographic';page.querySelectorAll('[data-direction]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.direction)===i)));}
  async function select(file){
    if(!file||busy||dead)return;
    lock(true);notice('Loading model and embedded textures…');
    let model;
    try {
      model=await loadModel(file);
      if(dead){disposeThumbnailModel(model);return;}
      viewer ||= new IsometricViewer(q('[data-viewer]'));
      viewer.setModel(model);model=null;viewer.configure(settings());showDirection(0);
      baseName=file.name.replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,80)||'model';
      clearResults();q('[data-name]').textContent=file.name;q('.iso-empty').hidden=true;notice('Ready. Choose your settings, then generate eight views.');
    }catch(error){if(model&&model!==viewer?.model)disposeThumbnailModel(model);notice(error.message||'Could not load this model.',true);}
    finally{if(!dead)lock(false);}
  }
  q('[data-demo]').onclick=e=>{
    e.stopPropagation();if(busy)return;
    try{viewer ||= new IsometricViewer(q('[data-viewer]'));viewer.setModel(createDemoBuilding());viewer.configure(settings());showDirection(0);baseName='sample-workshop';clearResults();q('[data-name]').textContent='Sample workshop';q('.iso-empty').hidden=true;notice('Sample loaded. Generate eight views or choose your own model.');}
    catch(error){notice(error.message,true);}finally{lock(false);}
  };
  q('[data-choose]').onclick=e=>{e.stopPropagation();if(!busy)q('[data-file]').click();};
  q('.iso-upload').onclick=e=>{if(e.target!==q('[data-file]')&&!busy)q('[data-file]').click();};
  q('.iso-upload').onkeydown=e=>{if(e.target===q('.iso-upload')&&['Enter',' '].includes(e.key)){e.preventDefault();if(!busy)q('[data-file]').click();}};
  q('[data-file]').onchange=e=>{select(e.target.files[0]);e.target.value='';};
  q('.iso-upload').ondragover=e=>{e.preventDefault();};q('.iso-upload').ondrop=e=>{e.preventDefault();select(e.dataTransfer.files[0]);};
  const disposeRotation=mountRotation(page,{
    enabled:()=>!dead&&!busy&&!!viewer?.model,
    changed:(front,elevation)=>{viewer?.setOrientation(front,elevation);if(results.length)q('[data-result-note]').textContent='View angle changed. Generate again to update these downloads.';},
  });
  q('[data-elevation]').onchange=()=>{const preset=q('[data-elevation]').value;if(preset!=='custom')q('[data-elevation-control]').value=preset;syncElevation();viewer?.setElevation(Number(q('[data-elevation-control]').value));};
  function syncElevation(){const value=Number(q('[data-elevation-control]').value);q('[data-elevation-number]').value=String(Math.round(value*1000)/1000);q('[data-elevation-value]').textContent=value.toFixed(1)+'\u00b0';const sel=q('[data-elevation]');sel.value=Math.abs(value-35.26438968)<0.05?'35.26438968':Math.abs(value-30)<0.05?'30':'custom';}
  q('[data-elevation-control]').addEventListener('input',()=>{if(!busy){syncElevation();viewer?.setElevation(Number(q('[data-elevation-control]').value));}});
  q('[data-elevation-number]').addEventListener('input',()=>{if(!busy&&q('[data-elevation-number]').value!==''){q('[data-elevation-control]').value=q('[data-elevation-number]').value;syncElevation();viewer?.setElevation(Number(q('[data-elevation-control]').value));}});
  q('[data-elevation-reset]').onclick=()=>{if(!busy){q('[data-elevation-control]').value='35.26438968';syncElevation();viewer?.setElevation(35.26438968);}};
  q('[data-settings]').oninput=event=>{if(!busy&&!event.target.closest('.iso-rotation')&&!event.target.closest('.iso-elevation'))apply();};
  page.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>{if(!busy)showDirection(Number(b.dataset.direction));});
  q('[data-generate]').onclick=async()=>{
    if(busy||!viewer?.model)return;clearResults();lock(true);const config=settings(),prior=direction;
    const progress=q('progress');progress.hidden=false;progress.value=0;
    try{
      viewer.configure(config);metadata=makeMetadata(baseName,config.size,config,viewer.fit);
      for(let i=0;i<8;i++){
        if(dead)return;showDirection(i);notice(`Rendering ${DIRECTIONS[i]} · ${i+1} of 8`);
        await new Promise(resolve=>requestAnimationFrame(resolve));if(dead)return;
        const blob=await viewer.capture(config.size);if(dead)return;
        results.push({blob,url:URL.createObjectURL(blob),direction:DIRECTIONS[i]});progress.value=i+1;
      }
      const grid=q('.iso-grid');
      results.forEach((result,i)=>{const card=document.createElement('article');card.className='iso-result';const img=document.createElement('img');img.src=result.url;img.alt=`${baseName}, ${result.direction} view`;img.width=img.height=config.size;const label=document.createElement('h3');label.textContent=result.direction;const button=document.createElement('button');button.className='iso-button';button.textContent='Download PNG';button.onclick=()=>{if(!busy)save(result.blob,metadata.frames[i].file);};card.append(img,label,button);grid.append(card);});
      q('[data-result-note]').textContent=`${config.size} × ${config.size} px per view · ${config.background==='transparent'?'Transparent':'Solid colour'} background`;
      q('.iso-results').hidden=false;notice('Eight views ready. Download individual PNGs or a complete collection.');
    }catch(error){clearResults();if(!dead)notice('Render failed: '+error.message,true);}
    finally{if(!dead){showDirection(prior);progress.hidden=true;lock(false);}}
  };
  async function archive(sheet){
    if(busy||results.length!==8)return;lock(true);notice(sheet?'Building the 4 × 2 sprite sheet…':'Preparing your PNG collection…');
    try{
      const blob=await makeDownload(results,metadata,sheet);if(!dead){save(blob,`${baseName}-${sheet?'sprite-sheet':'eight-views'}.zip`);notice('Download ready.');}
    }catch(error){if(!dead)notice('Export failed: '+error.message,true);}
    finally{if(!dead)lock(false);}
  }
  q('[data-zip]').onclick=()=>archive(false);q('[data-sheet]').onclick=()=>archive(true);
  lock(false);
  if(new URLSearchParams(window.location.search).get('sample')==='1')q('[data-demo]').click();
  return()=>{dead=true;disposeRotation();clearResults();viewer?.dispose();};
}
