// Builds the web copy of the Rusted Colossus for the homepage hero, and copies
// the source as the free download. Run whenever the source model changes:
//
//   node scripts/hero/remove-logo.mjs   (writes the badge-free source)
//   node scripts/hero/build-colossus-web.mjs [scripts/hero/source/rusted-colossus-lod1-clean.glb]
//
// Outputs:
//   public/hero/colossus-web.glb                 what the hero loads (~1/3 the triangles,
//                                                1024px JPEG textures, Meshopt)
//   public/hero/downloads/rusted-colossus.glb    the source, unchanged, for visitors to keep
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { reducePolys } from '../../src/tools/reduce-polys/ReducePolysEngine.js';

const src = resolve(process.argv[2] ?? 'scripts/hero/source/rusted-colossus-lod1-clean.glb');
const out = resolve('public/hero/colossus-web.glb');
const download = resolve('public/hero/downloads/rusted-colossus.glb');
const TEXTURE_SIZE = 1024;
const GEOMETRY_KEEP = 0.35;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(src);
const root = document.getRoot();

const { warnings } = await reducePolys({ document, ratio: GEOMETRY_KEEP, options: { lockBorder: true, error: 0.01, cleanup: true } });
for (const w of warnings) console.warn('reduce:', w);

// Data maps get a higher JPEG quality than colour, and no chroma subsampling,
// so their channels don't bleed into each other.
const colourTextures = new Set(root.listMaterials().flatMap((m) => [m.getBaseColorTexture(), m.getEmissiveTexture()]).filter(Boolean));
for (const texture of root.listTextures()) {
  const colour = colourTextures.has(texture);
  const bytes = await sharp(Buffer.from(texture.getImage()))
    .resize(TEXTURE_SIZE, TEXTURE_SIZE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: colour ? '#ffffff' : '#8080ff' })
    .jpeg(colour ? { quality: 86, mozjpeg: true } : { quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
  texture.setImage(new Uint8Array(bytes)).setMimeType('image/jpeg');
  if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.\w+$/, '.jpg'));
}
root.listExtensionsUsed().find((e) => e.extensionName === 'EXT_texture_webp')?.dispose();

await document.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, document);
await mkdir(resolve('public/hero/downloads'), { recursive: true });
await copyFile(src, download);

const triangles = root.listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
console.log(`wrote ${out}: ${((await stat(out)).size / 1048576).toFixed(2)} MB, ${triangles} triangles`);
console.log(`wrote ${download}: ${((await stat(download)).size / 1048576).toFixed(2)} MB`);
