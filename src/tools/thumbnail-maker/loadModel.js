import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

async function createGltfLoader() {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${import.meta.env?.BASE_URL || '/'}draco/`);
  loader.setDRACOLoader(draco);
  try {
    const { MeshoptDecoder } = await import('meshoptimizer');
    await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
  } catch (error) {
    console.warn('[AssetBench] Meshopt decoder unavailable.', error);
  }
  return loader;
}

export async function loadThumbnailModel(file, { selfContained = false } = {}) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  if(selfContained){
    const view=new DataView(buffer);
    if(buffer.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(16,true)!==0x4e4f534a)throw new Error('Invalid GLB file.');
    const length=view.getUint32(12,true);
    if(20+length>buffer.byteLength)throw new Error('Truncated GLB file.');
    const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
    if([...(json.buffers||[]),...(json.images||[])].some(x=>x.uri&&!x.uri.startsWith('data:')))throw new Error('Batch GLBs must embed their textures and buffers.');
  }
  if (extension === 'fbx') return new FBXLoader().parse(buffer, '');
  const loader = await createGltfLoader();
  const payload = extension === 'gltf' ? new TextDecoder().decode(buffer) : buffer;
  try { return await new Promise((resolve, reject) => {
    loader.parse(payload, '', (gltf) => resolve(gltf.scene), (error) => reject(error));
  }); } finally { loader.dracoLoader?.dispose(); }
}
