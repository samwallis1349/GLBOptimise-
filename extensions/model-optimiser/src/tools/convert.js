/**
 * 3D Converter & Splitter edition: what a file is (free), convert between
 * GLB / glTF / OBJ / FBX, split a model into parts, merge models into one GLB,
 * and build a LOD chain. Inputs other than GLB arrive here already converted
 * (engine.js); `source` says what they were.
 */
import JSZip from 'jszip';
import { getBounds } from '@gltf-transform/core';
import { mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { analyseGlb, readDocument, writeDocument } from '../../../../worker/api/glb.js';
import { convert } from '../../../../worker/api/convert.js';
import { generateLodChain } from '../../../../worker/api/mesh.js';
import { documentToFbx } from '../../../../src/shared/fbx/glbToFbx.js';
import { stem } from '../inputs.js';

const FORMAT_NAMES = { glb: 'GLB (binary glTF)', gltf: 'glTF', fbx: 'FBX', obj: 'OBJ' };
const TARGETS = ['glb', 'gltf', 'obj', 'fbx'];

const summary = (glb) => {
  const s = analyseGlb(glb);
  return { triangles: s.triangles, meshes: s.meshCount, materials: s.materials, textures: s.textures.length, animations: s.animations, skins: s.skins, fileBytes: s.fileBytes };
};

const zipOf = async (files, extra = {}) => {
  const zip = new JSZip();
  for (const [path, data] of Object.entries(files)) zip.file(path, data);
  for (const [path, data] of Object.entries(extra)) zip.file(path, data);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
};

/** What the file is, what's in it and what it can become. */
export async function formats(bytes, _params, _name, source = 'glb') {
  return {
    report: {
      format: FORMAT_NAMES[source] || source,
      inputBytes: _params?.inputBytes ?? bytes.byteLength,
      ...summary(bytes),
      canBecome: TARGETS.filter((t) => t !== source).map((t) => FORMAT_NAMES[t]),
      warnings: [],
    },
  };
}

/** GLB → glTF (ZIP), OBJ (ZIP), FBX or GLB. */
export async function convertTo(bytes, { to = 'glb', scale = 1 }, name, source = 'glb') {
  to = String(to).toLowerCase();
  if (!TARGETS.includes(to)) throw new Error(`Can't convert to ${to}. Choose GLB, glTF, OBJ or FBX.`);
  const base = stem(name);
  const warnings = [];
  if (to === source && Number(scale) === 1) warnings.push(`The file is already ${FORMAT_NAMES[to]}; it was re-saved.`);
  let glb = bytes;
  if (Number(scale) && Number(scale) !== 1) glb = await scaleGlb(bytes, Number(scale));
  if (to === 'glb') return { output: glb, name: `${base}.glb`, report: { from: source, to, bytesOut: glb.byteLength, ...summary(glb), warnings } };
  if (to === 'fbx') {
    const r = await documentToFbx(await readDocument(glb));
    return { output: r.bytes, name: `${base}.fbx`, report: { from: source, to, bytesOut: r.bytes.byteLength, ...r.stats, warnings: [...warnings, ...r.notes] } };
  }
  const r = await convert(glb, { to }, `${base}.glb`);
  return { output: r.output, name: `${base}.${to}.zip`, report: { from: source, to, bytesOut: r.output.byteLength, ...summary(glb), warnings: [...warnings, ...(r.warnings || [])] } };
}

async function scaleGlb(bytes, scale) {
  if (!(scale > 0 && scale <= 1000)) throw new Error('Scale must be between 0 and 1000.');
  const document = await readDocument(bytes);
  for (const scene of document.getRoot().listScenes()) {
    for (const node of scene.listChildren()) {
      node.setScale(node.getScale().map((v) => v * scale));
      node.setTranslation(node.getTranslation().map((v) => v * scale));
    }
  }
  return writeDocument(document);
}

const sceneOf = (document) => document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];

/**
 * Drops everything the scene no longer reaches: nodes outside it (keeping
 * joints its skins still use), skins nobody uses, and animation channels
 * that pointed at removed nodes. prune() then sweeps the data they held.
 */
function isolate(document) {
  const root = document.getRoot();
  const keep = new Set();
  const walk = (node) => { if (keep.has(node)) return; keep.add(node); node.listChildren().forEach(walk); };
  for (const scene of root.listScenes()) scene.listChildren().forEach(walk);
  const usedSkins = new Set([...keep].map((n) => n.getSkin()).filter(Boolean));
  for (const skin of usedSkins) { skin.listJoints().forEach(walk); if (skin.getSkeleton()) walk(skin.getSkeleton()); }
  for (const skin of root.listSkins()) if (!usedSkins.has(skin)) skin.dispose();
  for (const node of root.listNodes()) if (!keep.has(node)) node.dispose();
  for (const anim of root.listAnimations()) {
    for (const channel of anim.listChannels()) if (!channel.getTargetNode()) { channel.getSampler()?.dispose(); channel.dispose(); }
    if (!anim.listChannels().length) anim.dispose();
  }
}
const safeName = (s, i) => `${String(i + 1).padStart(2, '0')}_${String(s || 'part').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'part'}`;

/** World matrix of a node (glTF-Transform keeps local ones). */
const worldMatrix = (node) => node.getWorldMatrix();

/**
 * Splits into separate GLBs: `by` = 'objects' (each top-level object),
 * 'meshes' (each mesh, placed where it was) or 'materials' (one file per
 * material). Each part is cut from a fresh read of the original.
 */
export async function split(bytes, { by = 'objects' }, name) {
  const base = stem(name);
  const probe = await readDocument(bytes);
  const files = {};
  const parts = [];
  const write = async (doc, label, i) => {
    isolate(doc);
    await doc.transform(prune({ keepLeaves: false }));
    const out = await writeDocument(doc);
    const file = `${safeName(label, i)}.glb`;
    files[file] = out;
    const s = analyseGlb(out);
    parts.push({ file, name: label, triangles: s.triangles, fileBytes: out.byteLength });
  };

  if (by === 'objects') {
    // The objects are the first level with more than one child, so a model
    // wrapped in one root (most exporters add one) still splits.
    const path = [];
    let level = sceneOf(probe)?.listChildren() || [];
    while (level.length === 1 && level[0].listChildren().length) { path.push(0); level = level[0].listChildren(); }
    if (level.length < 2) throw new Error('This model is one object; try splitting by mesh or by material instead.');
    if (level.length > 200) throw new Error(`This model has ${level.length} objects; up to 200 parts at a time.`);
    // Skeleton roots and empty groups have nothing to draw on their own; skinned meshes keep their bones.
    const hasMesh = (node) => Boolean(node.getMesh()) || node.listChildren().some(hasMesh);
    const parts = level.map((n, i) => (hasMesh(n) ? i : -1)).filter((i) => i >= 0);
    if (parts.length < 2) throw new Error('This model is one object; try splitting by mesh or by material instead.');
    for (const i of parts) {
      const doc = await readDocument(bytes);
      let siblings = sceneOf(doc).listChildren();
      let parent = sceneOf(doc);
      for (const step of path) { parent = siblings[step]; siblings = parent.listChildren(); }
      const keep = siblings[i];
      for (const node of siblings) if (node !== keep) parent.removeChild(node);
      await write(doc, keep.getName() || `object ${i + 1}`, parts.indexOf(i));
    }
  } else if (by === 'meshes') {
    const nodeIdx = probe.getRoot().listNodes().map((n, i) => (n.getMesh() && !n.getSkin() ? i : -1)).filter((i) => i >= 0);
    if (nodeIdx.length < 2) throw new Error(`This model has ${nodeIdx.length} mesh${nodeIdx.length === 1 ? '' : 'es'} that can be split out${probe.getRoot().listSkins().length ? ' (skinned meshes stay with their rig)' : ''}.`);
    if (nodeIdx.length > 200) throw new Error(`This model has ${nodeIdx.length} meshes; split by object or material instead (up to 200 parts).`);
    for (let k = 0; k < nodeIdx.length; k += 1) {
      const doc = await readDocument(bytes);
      const root = doc.getRoot();
      const node = root.listNodes()[nodeIdx[k]];
      const matrix = worldMatrix(node);
      for (const scene of root.listScenes()) for (const child of scene.listChildren()) scene.removeChild(child);
      for (const parent of node.listParents()) if (parent.propertyType === 'Node') parent.removeChild(node);
      for (const child of node.listChildren()) node.removeChild(child);
      node.setMatrix(matrix);
      sceneOf(doc).addChild(node);
      for (const anim of root.listAnimations()) anim.dispose();
      await write(doc, node.getName() || node.getMesh().getName() || `mesh ${k + 1}`, k);
    }
  } else if (by === 'materials') {
    const materials = probe.getRoot().listMaterials();
    if (materials.length < 2) throw new Error(`This model has ${materials.length} material${materials.length === 1 ? '' : 's'}; try splitting by object or mesh instead.`);
    for (let i = 0; i < materials.length; i += 1) {
      const doc = await readDocument(bytes);
      const root = doc.getRoot();
      const keep = root.listMaterials()[i];
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) if (prim.getMaterial() !== keep) prim.dispose();
      }
      for (const node of root.listNodes()) if (node.getMesh() && !node.getMesh().listPrimitives().length) node.setMesh(null);
      await write(doc, keep.getName() || `material ${i + 1}`, i);
    }
  } else {
    throw new Error("Split by 'objects', 'meshes' or 'materials'.");
  }
  const report = { by, parts, warnings: parts.filter((p) => !p.triangles).length ? ['Some parts have no triangles (lines, points or empty groups).'] : [] };
  return { output: await zipOf(files, { 'parts.json': JSON.stringify(report, null, 2) }), name: `${base}-parts.zip`, report };
}

/**
 * Merges several models into one GLB. `layout` = 'row' places them side by
 * side along X (1 unit-wide gaps scaled to their size), 'stack' keeps every
 * model where it was.
 */
export async function merge(bytes, { others = [], layout = 'row' }, name) {
  if (!others.length) throw new Error('Add at least one more model to merge with.');
  const target = await readDocument(bytes);
  const scene = sceneOf(target);
  const placed = [{ name, ...summary(bytes) }];
  let cursor = null;
  const boundsOf = (nodes) => {
    const tmp = target.createScene('tmp');
    for (const n of nodes) tmp.addChild(n);
    const b = getBounds(tmp);
    for (const n of nodes) { tmp.removeChild(n); scene.addChild(n); }
    tmp.dispose();
    return b;
  };
  if (layout === 'row') {
    const b = getBounds(scene);
    cursor = { x: Number.isFinite(b.max[0]) ? b.max[0] : 0, gap: Math.max(0.1, (b.max[0] - b.min[0]) * 0.25 || 0.5) };
  }
  for (const other of others) {
    const source = await readDocument(other.bytes);
    const map = mergeDocuments(target, source);
    const srcScene = sceneOf(source);
    const newRoots = srcScene.listChildren().map((n) => map.get(n)).filter(Boolean);
    // mergeDocuments copies the source's scenes too: move their roots into ours and drop the copies.
    for (const s of target.getRoot().listScenes()) if (s !== scene) { for (const n of s.listChildren()) s.removeChild(n); s.dispose(); }
    for (const n of newRoots) scene.addChild(n);
    if (layout === 'row' && newRoots.length) {
      const b = boundsOf(newRoots);
      const width = b.max[0] - b.min[0];
      const shift = cursor.x + cursor.gap - b.min[0];
      for (const n of newRoots) { const t = n.getTranslation(); n.setTranslation([t[0] + shift, t[1], t[2]]); }
      cursor = { x: cursor.x + cursor.gap + width, gap: Math.max(cursor.gap, width * 0.25) };
    }
    placed.push({ name: other.name, ...summary(other.bytes) });
  }
  await target.transform(unpartition(), prune({ keepLeaves: true }));
  const output = await writeDocument(target);
  return {
    output,
    name: `${stem(name)}-merged.glb`,
    report: { layout, models: placed, merged: summary(output), warnings: [] },
  };
}

/** A LOD chain: LOD0 plus each level at a share of the triangles, in a ZIP. */
export async function lods(bytes, { levels = '1,0.5,0.25,0.1' }, name) {
  const { levels: out, report } = await generateLodChain(bytes, { levels: String(levels), lockBorder: 'true', compress: 'false' });
  const files = Object.fromEntries(out.map((l) => [`${stem(name)}_${l.file}`, l.output]));
  return {
    output: await zipOf(files, { 'lods.json': JSON.stringify(report, null, 2) }),
    name: `${stem(name)}-lods.zip`,
    report: { levels: report.levels.map((l) => ({ file: `${stem(name)}_${l.file}`, keep: l.keep, triangles: l.triangles, fileBytes: l.fileBytes })), warnings: report.warnings },
  };
}
