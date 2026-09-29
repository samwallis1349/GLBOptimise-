import {LoadingManager,Box3} from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {loadThumbnailModel,disposeThumbnailModel} from './modelResources.js';
export async function loadModel(file) {
  const extension=file.name.split('.').pop().toLowerCase();
  if(!['glb','fbx'].includes(extension)) throw Error('Choose a GLB or a self-contained FBX.');
  if(file.size>200*1024*1024) throw Error('Choose a model smaller than 200 MB.');
  let model;
  if(extension==='glb') model=await loadThumbnailModel(file,{selfContained:true});
  else {
    let external=false;
    const manager=new LoadingManager();
    manager.setURLModifier(url=>{
      if(url.startsWith('blob:')||url.startsWith('data:')) return url;
      external=true;
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    });
    let finish;
    const loaded=new Promise(resolve=>finish=resolve);
    manager.onLoad=finish;
    let pending=false; manager.onStart=()=>{pending=true;};
    model=new FBXLoader(manager).parse(await file.arrayBuffer(),'');
    if(pending) await loaded;
    if(external){disposeThumbnailModel(model);throw Error('This FBX references external textures. Embed its textures or export a self-contained GLB.');}
  }
  model.traverse(node=>{if(node.isSkinnedMesh)node.pose();});
  model.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(model,true);
  if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)){disposeThumbnailModel(model);throw Error('This model has no valid visible geometry.');}
  return model;
}
