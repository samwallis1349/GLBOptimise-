import {catalogueHTML} from './exports.js';
export function openCataloguePreview(items,title,onExport){
  const dialog=document.createElement('dialog');dialog.className='tm-catalogue-preview';
  dialog.innerHTML=`<header><div><p class="tm-eyebrow">Catalogue preview</p><h2></h2><p data-summary></p></div><button class="tm-btn tm-btn--secondary" data-close>Back ×</button></header><div class="tm-book-controls"><label>Style <select data-mode><option value="gallery">Gallery</option><option value="portfolio">Portfolio</option><option value="technical">Technical</option></select></label><label>Choose cover hero <select data-hero></select></label><label>View <select data-zoom><option value="100">Fit</option><option value="75">75%</option><option value="125">125%</option></select></label></div><p class="tm-preview-note">Watermarked preview · Full-resolution images in your download.</p><iframe title="Finished catalogue preview" sandbox="allow-same-origin"></iframe><footer><div class="tm-book-controls"><button class="tm-btn tm-btn--secondary" data-prev>← Previous</button><span data-count aria-live="polite"></span><button class="tm-btn tm-btn--secondary" data-next>Next →</button></div><button class="tm-btn tm-btn--primary" data-export>Prepare catalogue download →</button></footer>`;
  const q=s=>dialog.querySelector(s),frame=q('iframe');q('h2').textContent=title;q('[data-summary]').textContent=`${items.length} assets · Editorial collection`;
  const records=items.map(item=>({category:item.category,tags:item.tags,description:item.description,polygonCount:item.polygonCount,dimensions:item.dimensions,textureInfo:item.textureInfo,name:item.file.name,label:item.label||item.file.name,bytes:item.file.size,thumbnail:item.url,asset:null,error:null}));
  items.forEach((item,i)=>{const option=document.createElement('option');option.value=i;option.textContent=item.label||item.file.name;q('[data-hero]').append(option);});
  let current=0,pages=[],step=2;
  const presentation=()=>({mode:q('[data-mode]').value,heroIndex:Number(q('[data-hero]').value)});
  function display(){
    step=frame.clientWidth>1000?2:1;current=Math.max(0,Math.min(current,pages.length-1));
    pages.forEach((page,i)=>page.hidden=i<current||i>=current+step);
    q('[data-count]').textContent=`${current+1}${step===2&&current+1<pages.length?'–'+(current+2):''} / ${pages.length}`;
    q('[data-prev]').disabled=current===0;q('[data-next]').disabled=current+step>=pages.length;
  }
  function rebuild(){frame.srcdoc=catalogueHTML(records,title,1,1,{...presentation(),watermark:true}).replace(/<script>[\s\S]*?<\/script>/g,'').replace(/<a download[\s\S]*?<\/a>/g,'');}
  frame.onload=()=>{
    const doc=frame.contentDocument;if(!doc)return;pages=[...doc.querySelectorAll('.page')];
    doc.querySelectorAll('.toolbar').forEach(el=>el.remove());
    doc.querySelectorAll('a[href^="#"]').forEach(a=>a.onclick=event=>{event.preventDefault();const index=pages.findIndex(p=>'#'+p.id===a.getAttribute('href'));if(index>=0){current=index;display();}});
    doc.querySelector('main').style.zoom=Number(q('[data-zoom]').value)/100;display();
  };
  q('[data-mode]').onchange=()=>{current=0;rebuild();};q('[data-hero]').onchange=()=>{current=0;rebuild();};
  q('[data-zoom]').onchange=()=>{const main=frame.contentDocument?.querySelector('main');if(main)main.style.zoom=Number(q('[data-zoom]').value)/100;};
  q('[data-prev]').onclick=()=>{current=Math.max(0,current-step);display();frame.contentWindow.scrollTo(0,0);};q('[data-next]').onclick=()=>{current+=step;display();frame.contentWindow.scrollTo(0,0);};
  const observer=new ResizeObserver(()=>{if(pages.length)display();});observer.observe(frame);
  const previous=document.activeElement;const close=()=>dialog.close();q('[data-close]').onclick=close;
  q('[data-export]').onclick=()=>{const settings=presentation();close();onExport(settings);};
  dialog.addEventListener('close',()=>{observer.disconnect();frame.onload=null;frame.srcdoc='';dialog.remove();previous?.focus();},{once:true});
  document.body.append(dialog);dialog.showModal();rebuild();return ()=>{if(dialog.isConnected)close();};
}

