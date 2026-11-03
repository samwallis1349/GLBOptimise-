// Builds the web copy of the Neon Cube Companion for the homepage hero, and
// writes the clean game-ready download copy to public/hero/downloads/.
//
//   node scripts/hero/build-neon-cube-web.mjs [path/to/source.glb]
//
// Outputs:
//   public/hero/neon-cube-web.glb                       hero viewer model (~2.3 MB, 59k tris, 3 Mixamo clips)
//   public/hero/downloads/neon-cube-companion.glb       free download copy (~4.8 MB, 2K textures, all 3 clips)
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const src = resolve(
  process.argv[2] ??
    'C:/Users/samwa/Downloads/Meshy_AI_Neon_Cube_Companion_20261102_animated_mixamo_All_animation.glb',
);
const outWeb = resolve('public/hero/neon-cube-web.glb');
const outDownload = resolve('public/hero/downloads/neon-cube-companion.glb');

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

async function buildVariant(targetPath, { ratio, texSize, qualityColour, qualityData }) {
  const document = await io.read(src);
  const root = document.getRoot();

  for (const m of root.listMeshes()) {
    for (const prim of m.listPrimitives()) {
      const idxAcc = prim.getIndices();
      const posAcc = prim.getAttribute('POSITION');
      if (!idxAcc || !posAcc) continue;
      const count = posAcc.getCount();
      const indices = new Uint32Array(idxAcc.getArray());
      const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
      if (target < indices.length) {
        const positions = new Float32Array(count * 3);
        const el = [];
        for (let i = 0; i < count; i += 1) positions.set(posAcc.getElement(i, el), i * 3);
        const [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.05, ['Permissive', 'LockBorder']);
        if (out.length < indices.length) {
          idxAcc.setArray(count > 65535 ? out : new Uint16Array(out));
          compactPrimitive(prim);
        }
      }
    }
  }

  const colourTextures = new Set(
    root
      .listMaterials()
      .flatMap((m) => [m.getBaseColorTexture(), m.getEmissiveTexture()])
      .filter(Boolean),
  );
  for (const texture of root.listTextures()) {
    const colour = colourTextures.has(texture);
    const bytes = await sharp(Buffer.from(texture.getImage()))
      .resize(texSize, texSize, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: colour ? '#ffffff' : '#8080ff' })
      .jpeg(
        colour
          ? { quality: qualityColour, mozjpeg: true }
          : { quality: qualityData, mozjpeg: true, chromaSubsampling: '4:4:4' },
      )
      .toBuffer();
    texture.setImage(new Uint8Array(bytes)).setMimeType('image/jpeg');
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.\w+$/, '.jpg'));
  }
  root.listExtensionsUsed().find((e) => e.extensionName === 'EXT_texture_webp')?.dispose();

  await document.transform(resample(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(targetPath, document);

  const triangles = root
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  const mb = ((await stat(targetPath)).size / 1048576).toFixed(2);
  const clips = root.listAnimations().map((a) => a.getName());
  console.log(`wrote ${targetPath}: ${mb} MB, ${Math.round(triangles)} triangles, clips: ${clips.join(', ')}`);
}

await mkdir(resolve('public/hero/downloads'), { recursive: true });
await buildVariant(outWeb, { ratio: 0.3, texSize: 1024, qualityColour: 84, qualityData: 90 });
await buildVariant(outDownload, { ratio: 0.55, texSize: 2048, qualityColour: 88, qualityData: 92 });
