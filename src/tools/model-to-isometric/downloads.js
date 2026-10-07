import JSZip from 'jszip';
// Browsers refuse or crash on canvases much past these sizes.
const MAX_SIDE=16384,MAX_PIXELS=8192*8192;
export function sheetTooLarge(width,height){return width>MAX_SIDE||height>MAX_SIDE||width*height>MAX_PIXELS;}
async function compose(width,height,draws){
  if(sheetTooLarge(width,height))throw Error(`The sprite sheet would be ${width} × ${height} px, too large for the browser. Lower the resolution or frame count, or use Download All ZIP.`);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  try{
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('This browser cannot create the sprite sheet.');
    for(const [blob,x,y] of draws){const bitmap=await createImageBitmap(blob);try{ctx.drawImage(bitmap,x,y);}finally{bitmap.close();}}
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not encode sheet.')),'image/png'));
  }finally{canvas.width=canvas.height=1;}
}
export async function makeDownload(results,metadata,sheet=false){
  const zip=new JSZip();
  zip.file(`${metadata.name}-isometric.json`,JSON.stringify(metadata,null,2));
  if(sheet)zip.file(metadata.image,await (await compose(metadata.width,metadata.height,metadata.frames.map((frame,i)=>[results[i].blob,frame.x,frame.y]))).arrayBuffer());
  else for(let i=0;i<metadata.frames.length;i++)zip.file(metadata.frames[i].file,await results[i].blob.arrayBuffer());
  return zip.generateAsync({type:'blob',compression:'STORE'});
}
/** One direction's animation frames side by side, left to right. */
export function makeStrip(blobs,size){return compose(size*blobs.length,size,blobs.map((blob,i)=>[blob,i*size,0]));}
