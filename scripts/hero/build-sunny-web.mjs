// Builds the web copy of Sunny the Gecko for the homepage hero from the
// source GLB. Run whenever the source model changes:
//
//   node scripts/hero/build-sunny-web.mjs [scripts/hero/source/sunny-gecko.glb]
//
// Output: public/hero/sunny-gecko-web.glb. The source stores its colour map as
// WebP without EXT_texture_webp (only three.js tolerates that, and Safari
// before 14 cannot decode WebP at all) and carries 4K data maps plus clips the
// hero never plays. The web copy is a standards-valid glTF any browser and
// loader reads:
//   - only the Walking clip
//   - geometry halved with the site's Reduce Polys engine
//   - textures at 1024px, all JPEG: the hero shows Sunny at ~600px, where
//     high-quality JPEG data maps look identical and cost a fifth of PNG
//   - Meshopt compression (the hero already loads MeshoptDecoder)
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { reducePolys } from '../../src/tools/reduce-polys/ReducePolysEngine.js';

const src = resolve(process.argv[2] ?? 'scripts/hero/source/sunny-gecko.glb');
const out = resolve('public/hero/sunny-gecko-web.glb');
const KEEP_CLIP = /walk/i;
const TEXTURE_SIZE = 1024;
const GEOMETRY_KEEP = 0.5;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(src);
const root = document.getRoot();

for (const clip of root.listAnimations()) if (!KEEP_CLIP.test(clip.getName())) clip.dispose();
if (!root.listAnimations().length) throw new Error('No Walking clip found; the hero needs one.');

const { warnings } = await reducePolys({ document, ratio: GEOMETRY_KEEP, options: { lockBorder: true, error: 0.01, cleanup: true } });
for (const w of warnings) console.warn('reduce:', w);

// Data maps (normals, metal/roughness) get a higher JPEG quality than colour,
// and no chroma subsampling, so their channels don't bleed into each other.
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

await document.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, document);

const textures = root.listTextures().map((t) => `${t.getName()} ${t.getMimeType()} ${t.getSize()?.join('x')}`);
const triangles = root.listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
console.log(`wrote ${out}: ${((await stat(out)).size / 1048576).toFixed(2)} MB, ${triangles} triangles, clips ${root.listAnimations().map((a) => a.getName())}`);
console.log(textures.join('\n'));
