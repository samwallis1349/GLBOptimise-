// Builds the homepage wizard hero's production assets from the handoff
// prototype (Rota.zip → preview/assets). Run once, whenever the source model
// changes:
//
//   node scripts/hero/build-assets.mjs <path-to-extracted-preview/assets>
//
// Output (public/hero/):
//   wizard-lod{0..5}.glb   geometry only (no textures), Meshopt + quantised
//   tex-{1k,2k,4k}-*.{jpg,png}  one shared texture set per resolution
//   background.webp        illustrated backdrop
//   downloads/             the free-download GLBs, byte-for-byte from the handoff
//
// and src/pages/home/wizard-hero/hero-manifest.json: measured triangle
// counts, byte sizes and bounds, bundled into the hero's JS.
//
// The multi-LOD prototype (~62 MB, textures embedded) is never published:
// every visitor would otherwise pay for all six levels up front.
import { mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const src = resolve(process.argv[2] ?? '');
const out = resolve('public/hero');
await mkdir(join(out, 'downloads'), { recursive: true });

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const size = async (p) => (await stat(p)).size;

// --- Per-LOD geometry ------------------------------------------------------
const lodSource = join(src, 'wizard-lods-v2.glb');
const probe = await io.read(lodSource);
const lodNames = probe.getRoot().getDefaultScene().listChildren().map((n) => n.getName()).filter((n) => n.startsWith('LOD_')).sort();
if (lodNames.length !== 6) throw new Error(`Expected six LOD_ nodes, found ${lodNames.length}`);

// Shared framing: every level (and the balanced preset) is placed using the
// full-detail mesh's bounds, so switching levels never shifts the model.
const lod0Node = probe.getRoot().getDefaultScene().listChildren().find((n) => n.getName() === 'LOD_0');
const { min, max } = getBounds(lod0Node);

// 4K textures, extracted in their source encoding (colour JPEG, normal PNG,
// roughness/metalness JPEG) so they can be shared across every LOD.
const material = probe.getRoot().listMaterials()[0];
const tex4k = {
  map: material.getBaseColorTexture(),
  normalMap: material.getNormalTexture(),
  roughnessMap: material.getMetallicRoughnessTexture(),
};
const ext = (t) => (t.getMimeType() === 'image/png' ? 'png' : 'jpg');
const textures = { 4: {} };
for (const [slot, t] of Object.entries(tex4k)) {
  const file = `tex-4k-${slot}.${ext(t)}`;
  await writeFile(join(out, file), t.getImage());
  textures[4][slot] = file;
}
for (const k of [1, 2]) {
  textures[k] = {};
  for (const [slot, e] of [['map', 'jpg'], ['normalMap', 'png'], ['roughnessMap', 'jpg']]) {
    const file = `tex-${k}k-${slot}.${e}`;
    await copyFile(join(src, `texture-${k}k-${slot}.${e}`), join(out, file));
    textures[k][slot] = file;
  }
}

const lods = [];
for (const [i, name] of lodNames.entries()) {
  const doc = await io.read(lodSource);
  const root = doc.getRoot();
  const scene = root.getDefaultScene();
  for (const node of scene.listChildren()) if (node.getName() !== name) node.dispose();
  // Keep the material (factors, double-sidedness) but drop its images — the
  // runtime binds the shared texture set instead.
  for (const t of root.listTextures()) t.dispose();
  // keepAttributes: UVs look unused once textures are detached, but the shared
  // texture set needs them.
  await doc.transform(prune({ keepAttributes: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = `wizard-lod${i}.glb`;
  await io.write(join(out, file), doc);
  const prim = root.listMeshes()[0].listPrimitives()[0];
  const triangles = prim.getIndices().getCount() / 3;
  lods.push({ file, triangles, bytes: await size(join(out, file)) });
  console.log(`${file}: ${triangles.toLocaleString()} triangles, ${(lods.at(-1).bytes / 1048576).toFixed(2)} MiB`);
}

// --- Downloads + comparison models (copied unchanged) ----------------------
const copies = {
  'downloads/assetbench-wizard-balanced.glb': 'wizard-balanced.glb',
  'downloads/assetbench-wizard-optimised.glb': 'wizard-balanced-meshopt.glb',
  'downloads/assetbench-wizard-small.glb': 'wizard-mobile-meshopt.glb',
  'downloads/assetbench-wizard-before-25k.glb': 'wizard-before-25k.glb',
};
const downloads = {};
for (const [to, from] of Object.entries(copies)) {
  await copyFile(join(src, from), join(out, to));
  downloads[to.replace(/^downloads\/assetbench-wizard-|\.glb$/g, '')] = { file: to, bytes: await size(join(out, to)) };
}

// --- Background --------------------------------------------------------------
await sharp(join(src, 'background.png')).webp({ quality: 82 }).toFile(join(out, 'background.webp'));

const textureBytes = {};
for (const [k, set] of Object.entries(textures)) {
  textureBytes[k] = 0;
  for (const f of Object.values(set)) textureBytes[k] += await size(join(out, f));
}

const manifest = {
  bounds: { min, max },
  lods,
  textures,
  textureBytes,
  downloads,
  backgroundBytes: await size(join(out, 'background.webp')),
};
await writeFile(resolve('src/pages/home/wizard-hero/hero-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ textureBytes, downloads, backgroundBytes: manifest.backgroundBytes }, null, 2));
