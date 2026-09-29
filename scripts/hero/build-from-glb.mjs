// Builds the homepage hero's production assets from a single textured GLB
// (e.g. a Meshy export). Run whenever the hero model changes:
//
//   node scripts/hero/build-from-glb.mjs <model.glb>
//
// Output (public/hero/):
//   hero-lod{0..5}.glb           geometry only, simplified, Meshopt + quantised
//   tex-{1k,2k}-*.jpg            one shared texture set per resolution
//   downloads/assetbench-colossus-*.glb   the free downloads / compare presets
//
// and src/pages/home/wizard-hero/hero-manifest.json: measured triangle
// counts, byte sizes (including standalone export sizes per texture × LOD)
// and bounds, bundled into the hero's JS. background.webp and poster.webp
// are left alone.
//
// Unlike build-assets.mjs (the original multi-LOD wizard handoff), the LODs
// here are generated with meshoptimizer's simplifier.
import { mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, compactPrimitive, dequantize, getBounds, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const src = resolve(process.argv[2] ?? '');
const out = resolve('public/hero');
const PREFIX = 'hero';
const DOWNLOAD_PREFIX = 'assetbench-colossus';
/**
 * Hero triangle targets, full detail first. The lowest level is sized so no
 * texture choice takes the export under MIN_EXPORT_BYTES — below that the
 * Colossus loses too much detail to show off.
 */
const LOD_TARGETS = [1000000, 560000, 340000, 210000, 140000, 92000];
const MIN_EXPORT_BYTES = 4.2 * 1048576;
/** Lighter meshes for the free downloads and compare-page presets only. */
const PRESET_TARGETS = [25000, 10000];
/** Texture sets offered in the hero (key = K resolution). */
const TEXTURE_SIZES = { 1: 1024, 2: 2048 };

await mkdir(join(out, 'downloads'), { recursive: true });
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const size = async (p) => (await stat(p)).size;
const primOf = (doc) => doc.getRoot().listMeshes()[0].listPrimitives()[0];
const trianglesOf = (doc) => primOf(doc).getIndices().getCount() / 3;

/** Source, dequantised and welded, ready to simplify. */
async function readSource() {
  const doc = await io.read(src);
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (['EXT_meshopt_compression', 'KHR_mesh_quantization'].includes(ext.extensionName)) ext.dispose();
  }
  await doc.transform(dequantize(), weld());
  return doc;
}

// --- Source textures ---------------------------------------------------------
const probe = await readSource();
const sourceTriangles = trianglesOf(probe);
const sourceMaterial = probe.getRoot().listMaterials()[0];
const colourSource = Buffer.from(sourceMaterial.getBaseColorTexture().getImage());
const materialSource = Buffer.from(sourceMaterial.getMetallicRoughnessTexture().getImage());
const normalSource = sourceMaterial.getNormalTexture() && Buffer.from(sourceMaterial.getNormalTexture().getImage());
console.log(`source: ${sourceTriangles.toLocaleString()} triangles, normal map: ${!!normalSource}`);

async function resized(image, px, format) {
  const pipeline = sharp(image).resize(px, px, { fit: 'fill' });
  return format === 'png' ? pipeline.png({ compressionLevel: 9 }).toBuffer() : pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

const textures = {};
const textureBuffers = {};
for (const [k, px] of Object.entries(TEXTURE_SIZES)) {
  textures[k] = {};
  textureBuffers[k] = {};
  const slots = [['map', colourSource, 'jpg'], ['roughnessMap', materialSource, 'jpg']];
  if (normalSource) slots.push(['normalMap', normalSource, 'png']);
  for (const [slot, image, e] of slots) {
    const file = `tex-${k}k-${slot}.${e}`;
    const buffer = await resized(image, px, e === 'png' ? 'png' : 'jpg');
    await writeFile(join(out, file), buffer);
    textures[k][slot] = file;
    textureBuffers[k][slot] = { buffer, mime: e === 'png' ? 'image/png' : 'image/jpeg' };
  }
}

// --- LOD geometry ------------------------------------------------------------
// Each level is simplified from the previous one: faster, and every level
// stays a subset-shaped reduction of the one above it.
function simplifyPermissive(prim, targetTriangles) {
  const indices = Uint32Array.from(prim.getIndices().getArray());
  const positions = Float32Array.from(prim.getAttribute('POSITION').getArray());
  const uvs = Float32Array.from(prim.getAttribute('TEXCOORD_0').getArray());
  // Permissive lets edges collapse across UV seams; the UV attribute weight
  // keeps those collapses where they distort the texture least. Prune drops
  // tiny disconnected islands that would otherwise pin the count.
  const [result] = MeshoptSimplifier.simplifyWithAttributes(
    indices, positions, 3, uvs, 2, [1, 1], null, targetTriangles * 3, 1, ['Permissive', 'Prune'],
  );
  prim.getIndices().setArray(result);
  compactPrimitive(prim);
}

const lodDocs = [];
const presetDocs = {};
let current = probe;
for (const target of [...LOD_TARGETS, ...PRESET_TARGETS]) {
  const doc = cloneDocument(current);
  const ratio = Math.min(1, target / trianglesOf(doc));
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 1 }));
  // Meshy meshes are full of UV seams that the regular simplifier won't
  // collapse; if it stalls well above the target, allow collapses across them.
  if (trianglesOf(doc) > target * 1.1) simplifyPermissive(primOf(doc), target);
  if (lodDocs.length < LOD_TARGETS.length) lodDocs.push(doc);
  else presetDocs[target] = doc;
  current = doc;
}

const lod0Node = lodDocs[0].getRoot().getDefaultScene().listChildren()[0];
const { min, max } = getBounds(lod0Node);

/** Swap the material's textures for a given set (or strip them). */
function setTextures(doc, set) {
  const root = doc.getRoot();
  const material = root.listMaterials()[0];
  for (const t of root.listTextures()) t.dispose();
  if (!set) return;
  const make = (slot) => set[slot] && doc.createTexture(slot).setImage(set[slot].buffer).setMimeType(set[slot].mime);
  material.setBaseColorTexture(make('map'));
  material.setMetallicRoughnessTexture(make('roughnessMap'));
  if (set.normalMap) material.setNormalTexture(make('normalMap'));
}

const lods = [];
for (const [i, base] of lodDocs.entries()) {
  const doc = cloneDocument(base);
  setTextures(doc, null);
  await doc.transform(prune({ keepAttributes: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = `${PREFIX}-lod${i}.glb`;
  await io.write(join(out, file), doc);
  lods.push({ file, triangles: trianglesOf(base), bytes: await size(join(out, file)) });
  console.log(`${file}: ${lods.at(-1).triangles.toLocaleString()} triangles, ${(lods.at(-1).bytes / 1048576).toFixed(2)} MiB`);
}

// Standalone export size for every texture set × LOD (standard GLB, textures
// embedded) — what the hero's "GLB export" readout quotes.
const exportBytes = {};
for (const k of Object.keys(TEXTURE_SIZES)) {
  exportBytes[k] = [];
  for (const base of lodDocs) {
    const doc = cloneDocument(base);
    setTextures(doc, textureBuffers[k]);
    exportBytes[k].push((await io.writeBinary(doc)).byteLength);
  }
}
const floor = Math.min(...Object.values(exportBytes).map((sizes) => sizes.at(-1)));
if (floor < MIN_EXPORT_BYTES) {
  console.warn(`WARNING: lowest level exports at ${(floor / 1048576).toFixed(2)} MB, under the ${(MIN_EXPORT_BYTES / 1048576).toFixed(1)} MB floor — raise LOD_TARGETS.at(-1).`);
}

// --- Downloads + comparison presets -------------------------------------------
async function textureSet(colourPx, materialPx, normalPx) {
  const set = {
    map: { buffer: await resized(colourSource, colourPx, 'jpg'), mime: 'image/jpeg' },
    roughnessMap: { buffer: await resized(materialSource, materialPx, 'jpg'), mime: 'image/jpeg' },
  };
  if (normalSource) set.normalMap = { buffer: await resized(normalSource, normalPx, 'png'), mime: 'image/png' };
  return set;
}

const presets = {
  'before-25k': { mesh: 25000, textures: { map: { buffer: colourSource, mime: sourceMaterial.getBaseColorTexture().getMimeType() }, roughnessMap: { buffer: materialSource, mime: sourceMaterial.getMetallicRoughnessTexture().getMimeType() } }, meshopt: false },
  balanced: { mesh: 25000, textures: await textureSet(2048, 1024, 1024), meshopt: false },
  optimised: { mesh: 25000, textures: await textureSet(2048, 512, 1024), meshopt: true },
  small: { mesh: 10000, textures: await textureSet(1024, 512, 1024), meshopt: true },
};
const downloads = {};
for (const [name, preset] of Object.entries(presets)) {
  const doc = cloneDocument(presetDocs[preset.mesh]);
  setTextures(doc, preset.textures);
  const transforms = [prune({ keepAttributes: true })];
  if (preset.meshopt) transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...transforms);
  const file = `downloads/${DOWNLOAD_PREFIX}-${name}.glb`;
  await io.write(join(out, file), doc);
  downloads[name] = { file, bytes: await size(join(out, file)), triangles: trianglesOf(presetDocs[preset.mesh]) };
}

// --- Retire the previous model's files ------------------------------------------
for (let i = 0; i < 6; i++) await rm(join(out, `wizard-lod${i}.glb`), { force: true });
for (const f of ['balanced', 'optimised', 'small', 'before-25k']) await rm(join(out, `downloads/assetbench-wizard-${f}.glb`), { force: true });
for (const f of ['tex-4k-map.jpg', 'tex-4k-normalMap.png', 'tex-4k-roughnessMap.jpg', 'tex-1k-normalMap.png', 'tex-2k-normalMap.png']) {
  if (!Object.values(textures).some((set) => Object.values(set).includes(f))) await rm(join(out, f), { force: true });
}

const textureBytes = {};
for (const [k, set] of Object.entries(textures)) {
  textureBytes[k] = 0;
  for (const f of Object.values(set)) textureBytes[k] += await size(join(out, f));
}

const manifest = {
  source: { triangles: sourceTriangles, bytes: await size(src) },
  bounds: { min, max },
  lods,
  textures,
  textureBytes,
  exportBytes,
  downloads,
  backgroundBytes: await size(join(out, 'background.webp')),
};
await writeFile(resolve('src/pages/home/wizard-hero/hero-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ textureBytes, exportBytes, downloads }, null, 2));
