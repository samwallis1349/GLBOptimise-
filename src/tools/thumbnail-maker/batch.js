import {openCataloguePreview} from './cataloguePreview.js';
import {loadThumbnailModel} from './loadModel.js';
import {disposeThumbnailModel} from './ThumbnailViewer.js';
import {validateBatch,runQueue} from './batchQueue.js';
import {readSettings} from './settings.js';
import {OutputStore} from './outputStore.js';
import {smallPreview,partition,sheetLayout,makeSheet,makeArchive} from './exports.js';

export function mountBatch(page,getViewer,showNotice,showWorkspace,singleBusy){
  const section=document.createElement('section');section.className='tm-batch';
  section.innerHTML=`<div class="tm-batch-head"><div><div class="tm-eyebrow">03 / Batch studio</div><h2>One look. A whole collection.</h2><p>Up to 200 self-contained GLBs · 200 MB per file · 1 GB per batch</p></div><button class="tm-btn tm-btn--primary" data-action="choose">Add models</button><input data-files type="file" accept=".glb" multiple hidden></div><div class="tm-batch-body" hidden><p>Shared render settings above. Results are stored temporarily in this browser. Download your work before leaving this page.</p><div class="tm-batch-actions"><button class="tm-btn tm-btn--primary" data-action="run">Generate thumbnails</button><button class="tm-btn tm-btn--secondary" data-action="cancel" disabled>Cancel</button><button class="tm-btn tm-btn--secondary" data-action="retry" disabled>Retry failed</button><button class="tm-btn tm-btn--secondary" data-action="regenerate" disabled>Regenerate all</button></div><p role="status" aria-live="polite" data-progress></p><progress value="0" max="200"></progress><div class="tm-export-grid"><section><h3>PNG collection</h3><p>Individual labelled files, bundled into manageable ZIP parts.</p><button class="tm-btn tm-btn--secondary" data-action="zip" disabled>Prepare PNG ZIP</button></section><section class="tm-feature tm-feature--sheet"><div class="tm-feature-mark" aria-hidden="true">▦</div><span class="tm-feature-kicker">ASSEMBLE / 01</span><h3>Sprite Sheet Studio</h3><p class="tm-feature-intro">One collection. Perfectly packed.</p><p>Turn your renders into labelled sheets, with precise frame coordinates ready to use.</p><div class="tm-field-pair"><label>Columns<select data-columns><option>2</option><option selected>4</option><option>6</option><option>8</option></select></label><label>Tile size<select data-tile><option value="128">128 px</option><option value="256" selected>256 px</option><option value="512">512 px</option></select></label></div><label class="tm-check"><input type="checkbox" data-sheet-transparent>Transparent sheet</label><button class="tm-btn tm-btn--secondary" data-action="sheet" disabled>Build sprite sheets ↗</button><div class="tm-feature-foot">PNG SHEETS <span>+</span> JSON FRAMES</div></section><section class="tm-feature tm-feature--catalogue"><div class="tm-feature-mark" aria-hidden="true">▤</div><span class="tm-feature-kicker">SHOWCASE / 02</span><h3>Asset Catalogue</h3><p class="tm-feature-intro">Give your assets a showcase.</p><label class="tm-field">Catalogue title<input data-title maxlength="80" value="My asset collection"></label><label class="tm-check"><input type="checkbox" data-originals checked>Include original GLBs</label><p>Searchable offline HTML, labelled PNGs and a manifest. Originals stay unchanged.</p><button class="tm-btn tm-btn--secondary" data-action="catalogue" disabled>Build Catalogue →</button><div class="tm-feature-foot">LIVE PREVIEW <span>+</span> OFFLINE COLLECTION</div></section></div><div class="tm-export-parts" aria-live="polite"></div><div class="tm-results"></div></div>`;
  page.append(section);
  const find=s=>section.querySelector(s),button=name=>find(`[data-action="${name}"]`),input=find('[data-files]'),body=find('.tm-batch-body');
  let previewBusy=false,activePreview=null;let closePreview=()=>{};let items=[],running=false,cancel=false,dead=false,zipping=false,store=new OutputStore();
  function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function render(){
    if(dead)return;
    const done=items.filter(i=>i.status==='done').length,failed=items.filter(i=>i.status==='failed').length;
    find('[data-progress]').textContent=`${done} of ${items.length} ready${failed?` · ${failed} failed`:''}${zipping?' · Preparing download…':running?(cancel?' · Stopping after current model…':' · Rendering…'):cancel?' · Paused — generate to resume':''}`;
    find('progress').max=items.length||1;find('progress').value=done+failed;
    const busy=running||zipping||previewBusy;
    button('choose').disabled=busy;button('run').disabled=busy||!items.some(i=>i.status!=='done');button('cancel').disabled=!running||cancel;
    button('retry').disabled=busy||!failed;button('regenerate').disabled=busy||!done;
    for(const action of ['zip','sheet'])button(action).disabled=busy||!done;
    button('catalogue').disabled=busy||!done;
    section.querySelectorAll('.tm-export-grid input,.tm-export-grid select,.tm-export-parts button').forEach(el=>el.disabled=busy);
    const results=find('.tm-results');results.replaceChildren();
    for(const item of items){
      const card=document.createElement('article');card.className='tm-result';
      if(item.url){const image=document.createElement('img');image.src=item.url;image.alt=`Thumbnail of ${item.file.name}`;image.loading='lazy';card.append(image);}else{const placeholder=document.createElement('div');placeholder.className='tm-result-placeholder';placeholder.textContent=item.status==='working'?'Rendering…':item.status==='failed'?'Unable to render':'Queued';card.append(placeholder);}
      const label=document.createElement('input');label.type='text';label.value=item.label;label.maxLength=100;label.setAttribute('aria-label',`Label for ${item.file.name}`);label.disabled=busy;label.onchange=()=>{item.label=label.value.trim()||item.file.name;showViewportResults();};card.append(label);
      const name=document.createElement('small');name.textContent=item.file.name;card.append(name);
      const detail=document.createElement('span');detail.textContent=item.status==='failed'?`Failed: ${item.error}`:item.status;card.append(detail);
      if(item.status==='done'){const download=document.createElement('button');download.className='tm-btn tm-btn--secondary';download.textContent='Download PNG';download.disabled=busy;download.onclick=async()=>{try{const blob=await store.get(item.index);if(blob)save(blob,item.outputName);else throw Error('Result unavailable. Regenerate this batch.');}catch(e){showNotice(e.message,true);}};card.append(download);}
      results.append(card);
    }
  }
  function clear(){closePreview();page.querySelector('.tm-viewport-results')?.remove();items.forEach(i=>{if(i.url)URL.revokeObjectURL(i.url);});store.close();store=new OutputStore();items=[];find('.tm-export-parts').replaceChildren();}
  function select(files){
    if(running||zipping||previewBusy||singleBusy())return showNotice('Wait for the current operation to finish.',true);
    try{validateBatch(files);}catch(error){showNotice(error.message,true);return;}
    clear();items=files.map((file,index)=>({file,index,label:file.name.replace(/\.glb$/i,''),status:'queued'}));cancel=false;body.hidden=false;showWorkspace();render();showNotice('Batch queued. Choose a preset or shared settings, then generate.');
  }
  button('choose').onclick=()=>input.click();input.onchange=()=>{select([...input.files]);input.value='';};
  section.addEventListener('dragover',e=>e.preventDefault());section.addEventListener('drop',e=>{e.preventDefault();select([...e.dataTransfer.files]);});
  function lock(value){page.querySelectorAll('.tm-controls input,.tm-controls select,.tm-controls button,#tm-choose,#tm-replace').forEach(e=>{if(value){e.dataset.batchDisabled=String(e.disabled);e.disabled=true;}else{e.disabled=e.dataset.batchDisabled==='true';delete e.dataset.batchDisabled;}});}
  async function run(mode='pending'){
    if(running||zipping||previewBusy||singleBusy())return;
    if(mode==='all'){items.forEach(i=>{if(i.url)URL.revokeObjectURL(i.url);delete i.url;delete i.outputBytes;delete i.settings;delete i.error;i.status='queued';});store.close();store=new OutputStore();}
    closePreview();page.querySelector('.tm-viewport-results')?.remove();const settings=readSettings(page);running=true;cancel=false;lock(true);find('.tm-export-parts').replaceChildren();render();let viewer;
    try{
      viewer=getViewer();viewer.controls.enabled=false;
      await runQueue(mode==='failed'?items.filter(i=>i.status==='failed'):items,async item=>{
        const model=await loadThumbnailModel(item.file,{selfContained:true});
        if(dead){disposeThumbnailModel(model);throw Error('Closed');}
        try{
          viewer.setModel(model);activePreview=item.index;viewer.setBackground(settings.colour,settings.mode==='transparent');viewer.setLighting(settings.lighting);viewer.renderer.toneMappingExposure=settings.exposure;viewer.setShadow(settings.shadow,settings.shadowStrength);viewer.frame(settings.angle);
          page.querySelector('#tm-file-name').textContent=item.file.name;page.querySelector('#tm-loading').hidden=true;
          await new Promise(resolve=>requestAnimationFrame(resolve));if(dead)throw Error('Closed');
          const blob=await viewer.capture(settings.size);await store.put(item.index,blob);const preview=await smallPreview(blob);if(dead)return;
          if(item.url)URL.revokeObjectURL(item.url);item.url=URL.createObjectURL(preview);item.outputBytes=blob.size;item.settings={...settings};
          item.outputName=`${String(item.index+1).padStart(3,'0')}-${item.file.name.replace(/\.glb$/i,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,100)||'model'}-${settings.size}.png`;
          return undefined;
        }catch(error){if(/storage|memory limit/i.test(error.message))cancel=true;throw error;}
        finally{/* Keep the current model visible until its replacement is ready. */}
      },()=>cancel||dead,render);
    }finally{running=false;if(!dead){if(viewer)viewer.controls.enabled=true;lock(false);page.querySelector('#tm-download').disabled=true;page.querySelector('#tm-loading').hidden=!!viewer?.model;page.querySelector('#tm-loading').textContent='Your collection is ready below';render();showViewportResults();}}
  }
  button('run').onclick=()=>run().catch(e=>showNotice(e.message,true));button('retry').onclick=()=>run('failed').catch(e=>showNotice(e.message,true));button('regenerate').onclick=()=>run('all').catch(e=>showNotice(e.message,true));button('cancel').onclick=()=>{cancel=true;render();};
  function plans(jobs){const box=find('.tm-export-parts');box.replaceChildren();const help=document.createElement('p');help.textContent=`${jobs.length} download${jobs.length===1?'':'s'} ready to prepare. Generate one part at a time to keep memory use lower.`;box.append(help);for(const job of jobs){const b=document.createElement('button');b.className='tm-btn tm-btn--secondary';b.textContent=job.label;b.onclick=async()=>{if(running||zipping||previewBusy)return;zipping=true;render();try{const blob=await job.make();if(!dead){save(blob,job.name);showNotice(`${job.name} prepared. Your download is ready.`);}}catch(e){showNotice(`Export failed: ${e.message}`,true);}finally{zipping=false;render();}};box.append(b);}}
  button('zip').onclick=()=>{const parts=partition(items.filter(i=>i.status==='done'),i=>i.outputBytes||0);plans(parts.map((part,i)=>({label:`PNG ZIP ${i+1} / ${parts.length}`,name:`assetbench-thumbnails-${i+1}.zip`,make:()=>makeArchive(part,store)})));};
  button('sheet').onclick=()=>{const layouts=sheetLayout(items.filter(i=>i.status==='done'),Number(find('[data-columns]').value),Number(find('[data-tile]').value)),transparent=find('[data-sheet-transparent]').checked;plans(layouts.map((layout,i)=>({label:`Sheet ${i+1} · ${layout.width} × ${layout.height} · PNG + JSON`,name:`assetbench-sprite-sheet-${i+1}.zip`,make:()=>makeSheet(layout,store,transparent)})));};
  button('catalogue').onclick=()=>{
    const ready=items.filter(i=>i.status==='done'),title=find('[data-title]').value.trim()||'Asset catalogue';
    closePreview=openCataloguePreview(ready,title,(presentation)=>{
      const originals=find('[data-originals]').checked,parts=partition(ready,i=>(originals?i.file.size:0)+(i.outputBytes||0));
      plans(parts.map((part,i)=>({label:`Catalogue ${i+1} / ${parts.length}`,name:`assetbench-catalogue-${i+1}.zip`,make:()=>makeArchive(part,store,{catalogue:true,originals,title,part:i+1,total:parts.length,presentation})})));
      find('.tm-export-parts').scrollIntoView({block:'nearest'});
    });
  };
  async function selectPreview(item){
    if(dead||running||zipping||previewBusy||singleBusy())return;
    previewBusy=true;lock(true);render();
    const header=page.querySelector('.tm-viewport-heading');
    if(header)header.textContent=`Loading ${item.label}…`;
    try{
      const model=await loadThumbnailModel(item.file,{selfContained:true});
      if(dead){disposeThumbnailModel(model);return;}
      const viewer=getViewer(),settings=item.settings||readSettings(page);
      viewer.setModel(model);activePreview=item.index;
      viewer.setBackground(settings.colour,settings.mode==='transparent');viewer.setLighting(settings.lighting);
      viewer.renderer.toneMappingExposure=settings.exposure;viewer.setShadow(settings.shadow,settings.shadowStrength);viewer.frame(settings.angle);
      page.querySelector('#tm-file-name').textContent=item.file.name;page.querySelector('#tm-loading').hidden=true;
      page.querySelectorAll('[data-preview-index]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.previewIndex)===activePreview)));
    }catch(error){showNotice(`Could not preview ${item.label}: ${error.message}`,true);}
    finally{previewBusy=false;if(!dead){lock(false);render();if(header)header.textContent=`${items.filter(i=>i.url).length} thumbnails · click to view · scroll to browse`;}}
  }
  function showViewportResults(){
    page.querySelector('.tm-viewport-results')?.remove();
    const ready=items.filter(i=>i.url);if(!ready.length)return;
    const gallery=document.createElement('section');gallery.className='tm-viewport-results tm-viewport-strip';gallery.tabIndex=0;gallery.setAttribute('aria-label','Generated thumbnails scroll view');
    const header=document.createElement('div');header.className='tm-viewport-heading';header.textContent=`${ready.length} thumbnails · click to view · scroll to browse`;gallery.append(header);
    const grid=document.createElement('div');grid.className='tm-viewport-grid';
    for(const item of ready){const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=item.url;img.alt=item.label;img.loading='lazy';img.decoding='async';img.width=img.height=192;caption.textContent=item.label;figure.tabIndex=0;figure.setAttribute('role','button');figure.setAttribute('aria-label','View '+item.label);figure.setAttribute('aria-pressed',String(activePreview===item.index));figure.dataset.previewIndex=item.index;figure.onclick=()=>selectPreview(item);figure.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectPreview(item);}};figure.append(img,caption);grid.append(figure);}
    gallery.append(grid);page.querySelector('#tm-viewer').append(gallery);
  }
  const unload=()=>store.close();window.addEventListener('pagehide',unload);
  return {select,isBusy:()=>running||zipping||previewBusy,dispose(){closePreview();page.querySelector('.tm-viewport-results')?.remove();dead=true;cancel=true;items.forEach(i=>{if(i.url)URL.revokeObjectURL(i.url);});store.close();window.removeEventListener('pagehide',unload);}};
}




