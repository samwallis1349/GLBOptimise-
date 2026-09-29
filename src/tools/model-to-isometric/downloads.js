import JSZip from 'jszip';
export async function makeDownload(results,metadata,sheet=false){
  const zip=new JSZip();
  zip.file(`${metadata.name}-isometric.json`,JSON.stringify(metadata,null,2));
  if(sheet){
    const canvas=document.createElement('canvas');canvas.width=metadata.width;canvas.height=metadata.height;
    try{
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('This browser cannot create the sprite sheet.');
      for(let i=0;i<8;i++){const bitmap=await createImageBitmap(results[i].blob);try{const frame=metadata.frames[i];ctx.drawImage(bitmap,frame.x,frame.y);}finally{bitmap.close();}}
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not encode sheet.')),'image/png'));
      zip.file(metadata.image,await blob.arrayBuffer());
    }finally{canvas.width=canvas.height=1;}
  }else for(let i=0;i<8;i++)zip.file(metadata.frames[i].file,await results[i].blob.arrayBuffer());
  return zip.generateAsync({type:'blob',compression:'STORE'});
}
