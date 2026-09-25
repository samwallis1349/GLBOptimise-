import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const r = doc.getRoot();
  console.log('==', f);
  console.log('ext', r.listExtensionsUsed().map(e=>e.extensionName));
  console.log('scene nodes', r.getDefaultScene()?.listChildren().map(n=>`${n.getName()} t=${n.getTranslation()} s=${n.getScale()} r=${n.getRotation()} kids=${n.listChildren().length} mesh=${n.getMesh()?.getName()}`));
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) console.log(' mesh', m.getName(), 'tris', p.getIndices()? p.getIndices().getCount()/3 : p.getAttribute('POSITION').getCount()/3, 'verts', p.getAttribute('POSITION').getCount(), 'attrs', p.listSemantics().join(','), 'mat', p.getMaterial()?.getName(), 'type', p.getAttribute('POSITION').getComponentType());
  for (const t of r.listTextures()) console.log(' tex', t.getName(), t.getMimeType(), t.getSize(), t.getImage()?.byteLength);
  for (const m of r.listMaterials()) console.log(' mat', m.getName(), m.getBaseColorFactor(), m.getMetallicFactor(), m.getRoughnessFactor(), !!m.getBaseColorTexture(), !!m.getNormalTexture(), !!m.getMetallicRoughnessTexture(), m.getDoubleSided(), m.getAlphaMode());
}
