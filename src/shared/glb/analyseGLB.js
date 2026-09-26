import { Primitive } from '@gltf-transform/core';
import { getBounds, getGLPrimitiveCount, listTextureSlots } from '@gltf-transform/functions';
import { readGlb, readGltf } from './createIO.js';
import { runChecks } from './checks.js';
import { scoreIssues, evaluateBudgets } from './statistics.js';

/**
 * Deep, read-only analysis of a GLB / glTF asset, shared by Inspect GLB,
 * Asset Report and Asset Compare. Every number is measured from the file:
 *
 *   - `bytes` is ON-DISK accounting, attributed from the raw glTF JSON
 *     (bufferViews → accessors/images/Draco/Meshopt), so it adds up to the
 *     real file size.
 *   - everything else comes from glTF-Transform's decoded Document, i.e.
 *     what an engine actually loads (after Draco / Meshopt decode).
 *   - `gpu` figures are clearly-labelled estimates (uncompressed vertex
 *     buffers + RGBA8 textures with mip chain).
 *
 * The result is plain JSON-serialisable data — no Document references — so
 * it can be exported, diffed and stored directly.
 */

const TRIANGLE_MODES = new Set([Primitive.Mode.TRIANGLES, Primitive.Mode.TRIANGLE_STRIP, Primitive.Mode.TRIANGLE_FAN]);
const MODE_NAMES = { 0: 'POINTS', 1: 'LINES', 2: 'LINE_LOOP', 3: 'LINE_STRIP', 4: 'TRIANGLES', 5: 'TRIANGLE_STRIP', 6: 'TRIANGLE_FAN' };
const COMPONENT_NAMES = { 5120: 'int8', 5121: 'uint8', 5122: 'int16', 5123: 'uint16', 5125: 'uint32', 5126: 'float32' };
const MIME_LABEL = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/ktx2': 'KTX2', 'image/avif': 'AVIF' };
const GLB_MAGIC = 0x46546c67;

/**
 * Groups a dropped set of files into assets: every .glb is one asset, every
 * .gltf is one asset with all non-model files as possible siblings.
 * .zip files are expanded first.
 * @param {File[]} fileList
 * @returns {Promise<{ name: string, kind: 'glb'|'gltf', main: File, siblings: File[] }[]>}
 */
export async function collectAssets(fileList) {
  const files = [];
  for (const file of fileList) {
    if (/\.zip$/i.test(file.name)) {
      const { unzipSync } = await import('three/examples/jsm/libs/fflate.module.js');
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      for (const [path, data] of Object.entries(entries)) {
        if (path.endsWith('/') || path.startsWith('__MACOSX') || !data.length) continue;
        files.push(new File([data], path.split('/').pop()));
      }
    } else {
      files.push(file);
    }
  }
  const siblings = files.filter((f) => !/\.(glb|gltf)$/i.test(f.name));
  return files
    .filter((f) => /\.(glb|gltf)$/i.test(f.name))
    .map((f) => ({
      name: f.name,
      kind: /\.glb$/i.test(f.name) ? 'glb' : 'gltf',
      main: f,
      siblings: /\.gltf$/i.test(f.name) ? siblings : [],
    }));
}

/**
 * @param {{ name: string, kind: 'glb'|'gltf', main: File, siblings: File[] }} asset
 */
export async function analyseAsset(asset) {
  const started = performance.now();
  let document;
  let rawJson;
  let container;
  const missingResources = [];

  if (asset.kind === 'glb') {
    const buffer = await asset.main.arrayBuffer();
    container = parseGlbContainer(buffer);
    rawJson = container.json;
    document = await readGlb(buffer);
  } else {
    rawJson = JSON.parse(await asset.main.text());
    const read = await readGltf(asset.main, asset.siblings);
    document = read.document;
    missingResources.push(...read.missing);
    container = { version: 2, jsonBytes: asset.main.size, binBytes: 0 };
  }

  const fileBytes = asset.kind === 'glb' ? asset.main.size : asset.main.size + sumSiblingBytes(rawJson, asset.siblings);
  const bytes = attributeBytes(rawJson, container, asset);
  const analysis = analyseDocument(document, rawJson);

  const result = {
    file: {
      name: asset.name,
      kind: asset.kind,
      bytes: fileBytes,
      lastModified: asset.main.lastModified || null,
      glbVersion: container.version ?? null,
      generator: rawJson.asset?.generator || null,
      copyright: rawJson.asset?.copyright || null,
      gltfVersion: rawJson.asset?.version || null,
      missingResources,
    },
    bytes,
    ...analysis,
    rawJson,
  };

  result.issues = runChecks(result);
  result.budgets = evaluateBudgets(result);
  result.health = scoreIssues(result.issues, result.budgets);
  result.analysedInMs = Math.round(performance.now() - started);
  return result;
}

/** Convenience for a single standalone .glb / self-contained .gltf File. */
export async function analyseGLB(file) {
  const [asset] = await collectAssets([file]);
  if (!asset) throw new Error('Not a .glb or .gltf file.');
  return analyseAsset(asset);
}

// ---------------------------------------------------------------------------
// Container + on-disk byte attribution
// ---------------------------------------------------------------------------

function parseGlbContainer(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Not a valid GLB file (missing "glTF" header).');
  }
  const version = view.getUint32(4, true);
  let offset = 12;
  let json = null;
  let jsonBytes = 0;
  let binBytes = 0;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) {
      jsonBytes = length;
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length)));
    } else if (type === 0x004e4942) {
      binBytes = length;
    }
    offset += 8 + length;
  }
  if (!json) throw new Error('GLB has no JSON chunk.');
  return { version, json, jsonBytes, binBytes };
}

function dataUriBytes(uri) {
  const comma = uri.indexOf(',');
  const payload = uri.slice(comma + 1);
  return uri.slice(0, comma).includes(';base64') ? Math.floor((payload.length * 3) / 4) : payload.length;
}

function sumSiblingBytes(json, siblings) {
  const byName = new Map(siblings.map((f) => [f.name.toLowerCase(), f.size]));
  let total = 0;
  for (const r of [...(json.buffers || []), ...(json.images || [])]) {
    if (r.uri && !r.uri.startsWith('data:')) total += byName.get(decodeURIComponent(r.uri.split(/[\\/]/).pop()).toLowerCase()) || 0;
  }
  return total;
}

/**
 * Splits the stored bytes into geometry / textures / animation / skinning /
 * morph targets / JSON / other, by following which bufferView each accessor
 * or image lives in. Meshopt views count their compressed size; Draco
 * primitives count their compressed bufferView.
 */
function attributeBytes(json, container, asset) {
  const out = { json: 0, geometry: 0, morphTargets: 0, textures: 0, animation: 0, skinning: 0, other: 0 };
  const views = json.bufferViews || [];
  const accessors = json.accessors || [];
  const category = new Array(views.length).fill(null);
  const claim = (viewIndex, cat) => {
    if (viewIndex == null || viewIndex >= views.length) return;
    if (!category[viewIndex]) category[viewIndex] = cat;
  };
  const claimAccessor = (accIndex, cat) => claim(accessors[accIndex]?.bufferView, cat);

  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const draco = prim.extensions?.KHR_draco_mesh_compression;
      if (draco) claim(draco.bufferView, 'geometry');
      Object.values(prim.attributes || {}).forEach((a) => claimAccessor(a, 'geometry'));
      if (prim.indices != null) claimAccessor(prim.indices, 'geometry');
      for (const target of prim.targets || []) Object.values(target).forEach((a) => claimAccessor(a, 'morphTargets'));
    }
  }
  for (const anim of json.animations || []) {
    for (const s of anim.samplers || []) {
      claimAccessor(s.input, 'animation');
      claimAccessor(s.output, 'animation');
    }
  }
  for (const skin of json.skins || []) claimAccessor(skin.inverseBindMatrices, 'skinning');
  for (const img of json.images || []) claim(img.bufferView, 'textures');

  views.forEach((view, i) => {
    const meshopt = view.extensions?.EXT_meshopt_compression;
    const size = meshopt ? meshopt.byteLength : view.byteLength;
    // A meshopt fallback buffer (no uri, flagged fallback) stores nothing on disk.
    const buffer = json.buffers?.[view.buffer];
    if (!meshopt && buffer?.extensions?.EXT_meshopt_compression?.fallback) return;
    out[category[i] || 'other'] += size || 0;
  });

  // Images stored outside bufferViews (.gltf data URIs or sibling files).
  const siblingSizes = new Map(asset.siblings.map((f) => [f.name.toLowerCase(), f.size]));
  for (const img of json.images || []) {
    if (!img.uri) continue;
    if (img.uri.startsWith('data:')) out.textures += dataUriBytes(img.uri);
    else out.textures += siblingSizes.get(decodeURIComponent(img.uri.split(/[\\/]/).pop()).toLowerCase()) || 0;
  }

  if (asset.kind === 'glb') {
    out.json = container.jsonBytes;
    // Chunk headers, padding and any unreferenced tail.
    const accounted = Object.values(out).reduce((a, b) => a + b, 0);
    out.other += Math.max(0, asset.main.size - accounted);
  } else {
    out.json = asset.main.size;
    // .gltf with embedded buffers: attributed data came from base64, not raw bytes.
    for (const b of json.buffers || []) if (b.uri?.startsWith('data:')) out.json = Math.max(0, out.json - dataUriBytes(b.uri));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Document analysis
// ---------------------------------------------------------------------------

function analyseDocument(document, json) {
  const root = document.getRoot();
  const meshes = root.listMeshes();
  const materials = root.listMaterials();
  const textures = root.listTextures();
  const nodes = root.listNodes();
  const skins = root.listSkins();
  const animations = root.listAnimations();

  const meshIndex = new Map(meshes.map((m, i) => [m, i]));
  const materialIndex = new Map(materials.map((m, i) => [m, i]));
  const textureIndex = new Map(textures.map((t, i) => [t, i]));
  const nodeIndex = new Map(nodes.map((n, i) => [n, i]));

  // Instances: how many nodes place each mesh (draw calls scale with this).
  const meshInstances = new Array(meshes.length).fill(0);
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (mesh) meshInstances[meshIndex.get(mesh)]++;
  }
  const jointNodes = new Set(skins.flatMap((s) => s.listJoints()));

  // ---------- Meshes ----------
  const materialUsers = new Array(materials.length).fill(0);
  let gpuGeometryBytes = 0;
  const meshItems = meshes.map((mesh, mi) => {
    const rawPrims = json.meshes?.[mi]?.primitives || [];
    const primitives = mesh.listPrimitives().map((prim, pi) => {
      const raw = rawPrims[pi] || {};
      const attributes = prim.listSemantics().map((semantic) => {
        const acc = prim.getAttribute(semantic);
        const array = acc.getArray();
        const byteLength = array ? array.byteLength : 0;
        gpuGeometryBytes += byteLength;
        return {
          semantic,
          type: acc.getType(),
          componentType: COMPONENT_NAMES[acc.getComponentType()] || String(acc.getComponentType()),
          normalized: acc.getNormalized(),
          count: acc.getCount(),
          byteLength,
        };
      });
      const indices = prim.getIndices();
      const indexBytes = indices?.getArray()?.byteLength || 0;
      gpuGeometryBytes += indexBytes;
      const targets = prim.listTargets();
      let targetBytes = 0;
      for (const t of targets) for (const s of t.listSemantics()) targetBytes += t.getAttribute(s).getArray()?.byteLength || 0;
      gpuGeometryBytes += targetBytes;
      const material = prim.getMaterial();
      if (material) materialUsers[materialIndex.get(material)]++;
      const position = prim.getAttribute('POSITION');
      const mode = prim.getMode();
      return {
        mode: MODE_NAMES[mode] || String(mode),
        material: material ? materialIndex.get(material) : null,
        vertexCount: position ? position.getCount() : 0,
        triangleCount: TRIANGLE_MODES.has(mode) ? getGLPrimitiveCount(prim) : 0,
        indexed: Boolean(indices),
        indexType: indices ? COMPONENT_NAMES[indices.getComponentType()] : null,
        indexCount: indices ? indices.getCount() : 0,
        indexBytes,
        attributes,
        morphTargets: targets.length,
        morphTargetBytes: targetBytes,
        compression: raw.extensions?.KHR_draco_mesh_compression ? 'draco' : null,
      };
    });
    const vertexCount = primitives.reduce((a, p) => a + p.vertexCount, 0);
    const triangleCount = primitives.reduce((a, p) => a + p.triangleCount, 0);
    return {
      index: mi,
      // three.js exporters never name meshes; fall back to the node that places it.
      name: mesh.getName() || nodes.find((n) => n.getMesh() === mesh)?.getName() || `Mesh ${mi}`,
      instances: meshInstances[mi],
      primitives,
      vertexCount,
      triangleCount,
      morphTargets: Math.max(0, ...primitives.map((p) => p.morphTargets)),
      byteLength: primitives.reduce((a, p) => a + p.attributes.reduce((b, x) => b + x.byteLength, 0) + p.indexBytes + p.morphTargetBytes, 0),
    };
  });

  // Rendered totals count every instance; unique totals count each mesh once.
  const totals = {
    scenes: root.listScenes().length,
    nodes: nodes.length,
    meshes: meshes.length,
    primitives: meshItems.reduce((a, m) => a + m.primitives.length, 0),
    drawCalls: meshItems.reduce((a, m) => a + m.primitives.length * m.instances, 0),
    vertices: meshItems.reduce((a, m) => a + m.vertexCount * m.instances, 0),
    triangles: meshItems.reduce((a, m) => a + m.triangleCount * m.instances, 0),
    uniqueVertices: meshItems.reduce((a, m) => a + m.vertexCount, 0),
    uniqueTriangles: meshItems.reduce((a, m) => a + m.triangleCount, 0),
    materials: materials.length,
    textures: textures.length,
    animations: animations.length,
    skins: skins.length,
    joints: skins.reduce((a, s) => a + s.listJoints().length, 0),
    morphTargets: meshItems.reduce((a, m) => a + m.morphTargets, 0),
    cameras: root.listCameras().length,
    lights: nodes.filter((n) => n.getExtension('KHR_lights_punctual')).length,
  };

  // ---------- Materials ----------
  const materialItems = materials.map((mat, i) => {
    const slots = {};
    for (const [slot, getter] of [
      ['baseColor', 'getBaseColorTexture'],
      ['metallicRoughness', 'getMetallicRoughnessTexture'],
      ['normal', 'getNormalTexture'],
      ['occlusion', 'getOcclusionTexture'],
      ['emissive', 'getEmissiveTexture'],
    ]) {
      const tex = mat[getter]();
      if (tex) slots[slot] = textureIndex.get(tex);
    }
    return {
      index: i,
      name: mat.getName() || `Material ${i}`,
      users: materialUsers[i],
      alphaMode: mat.getAlphaMode(),
      alphaCutoff: mat.getAlphaCutoff(),
      doubleSided: mat.getDoubleSided(),
      baseColorFactor: mat.getBaseColorFactor(),
      metallicFactor: mat.getMetallicFactor(),
      roughnessFactor: mat.getRoughnessFactor(),
      emissiveFactor: mat.getEmissiveFactor(),
      textures: slots,
      extensions: mat.listExtensions().map((e) => e.extensionName),
    };
  });

  // ---------- Textures ----------
  const hashes = new Map();
  let gpuTextureBytes = 0;
  const textureItems = textures.map((tex, i) => {
    const image = tex.getImage();
    const size = safeSize(tex);
    const mimeType = tex.getMimeType();
    const w = size?.[0] || 0;
    const h = size?.[1] || 0;
    const pot = isPow2(w) && isPow2(h);
    const compressedGpu = mimeType === 'image/ktx2';
    // RGBA8 + full mip chain (×4/3); KTX2 transcodes to ~1 byte/px block formats.
    const gpuBytes = Math.round(w * h * (compressedGpu ? 1 : 4) * (4 / 3));
    gpuTextureBytes += gpuBytes;
    const hash = image?.byteLength ? fnv1a(image) : null;
    if (hash) hashes.set(hash, [...(hashes.get(hash) || []), i]);
    const materialsUsing = materialItems.filter((m) => Object.values(m.textures).includes(i)).map((m) => m.index);
    return {
      index: i,
      name: tex.getName() || tex.getURI() || `Texture ${i}`,
      uri: tex.getURI() || null,
      mimeType,
      format: MIME_LABEL[mimeType] || mimeType || 'unknown',
      width: w,
      height: h,
      pot,
      byteLength: image ? image.byteLength : 0,
      gpuBytes,
      slots: listTextureSlots(tex),
      materials: materialsUsing,
      hash,
      duplicateOf: null,
    };
  });
  for (const group of hashes.values()) {
    for (const i of group.slice(1)) textureItems[i].duplicateOf = group[0];
  }

  // ---------- Animations ----------
  const animationItems = animations.map((anim, i) => {
    let duration = 0;
    let keyframes = 0;
    let staticChannels = 0;
    const channels = anim.listChannels().map((ch) => {
      const sampler = ch.getSampler();
      const input = sampler?.getInput()?.getArray();
      const output = sampler?.getOutput();
      const count = input ? input.length : 0;
      keyframes += count;
      if (count) duration = Math.max(duration, input[count - 1]);
      const isStatic = output ? isConstantTrack(output.getArray(), output.getElementSize(), count) : false;
      if (isStatic) staticChannels++;
      const node = ch.getTargetNode();
      return {
        node: node ? node.getName() || `Node ${nodeIndex.get(node)}` : null,
        path: ch.getTargetPath(),
        interpolation: sampler?.getInterpolation() || 'LINEAR',
        keyframes: count,
        static: isStatic,
      };
    });
    const avgKeys = channels.length ? keyframes / channels.length : 0;
    return {
      index: i,
      name: anim.getName() || `Animation ${i}`,
      duration,
      channelCount: channels.length,
      keyframes,
      staticChannels,
      sampleRate: duration > 0 ? Math.round(avgKeys / duration) : 0,
      channels,
    };
  });

  // ---------- Skins ----------
  const skinItems = skins.map((skin, i) => {
    const joints = skin.listJoints();
    const skinnedPrims = meshes
      .filter((m) => nodes.some((n) => n.getMesh() === m && n.getSkin() === skin))
      .flatMap((m) => m.listPrimitives());
    const maxInfluences = skinnedPrims.reduce((a, p) => Math.max(a, p.getAttribute('JOINTS_1') ? 8 : p.getAttribute('JOINTS_0') ? 4 : 0), 0);
    return {
      index: i,
      name: skin.getName() || `Skin ${i}`,
      jointCount: joints.length,
      skeleton: skin.getSkeleton()?.getName() || null,
      maxInfluences,
      joints: joints.map((j) => j.getName() || `Joint ${nodeIndex.get(j)}`),
    };
  });

  // ---------- Scene tree ----------
  const buildNode = (node) => {
    const mesh = node.getMesh();
    const scale = node.getScale();
    return {
      index: nodeIndex.get(node),
      name: node.getName() || `Node ${nodeIndex.get(node)}`,
      mesh: mesh ? meshIndex.get(mesh) : null,
      skin: node.getSkin() ? skins.indexOf(node.getSkin()) : null,
      camera: Boolean(node.getCamera()),
      light: Boolean(node.getExtension('KHR_lights_punctual')),
      joint: jointNodes.has(node),
      translation: node.getTranslation(),
      rotation: node.getRotation(),
      scale,
      negativeScale: scale[0] * scale[1] * scale[2] < 0,
      children: node.listChildren().map(buildNode),
    };
  };
  const scenes = root.listScenes().map((scene, i) => ({
    name: scene.getName() || `Scene ${i}`,
    nodes: scene.listChildren().map(buildNode),
  }));

  // ---------- Bounds ----------
  let bounds = null;
  const scene = root.getDefaultScene() || root.listScenes()[0];
  if (scene && meshes.length) {
    try {
      const { min, max } = getBounds(scene);
      if (min.every(Number.isFinite) && max.every(Number.isFinite)) {
        bounds = { min, max, size: max.map((v, k) => v - min[k]) };
      }
    } catch {
      /* no positions */
    }
  }

  const unused = {
    materials: materialItems.filter((m) => m.users === 0).length,
    textures: textureItems.filter((t) => t.slots.length === 0).length,
    meshes: meshItems.filter((m) => m.instances === 0).length,
    emptyNodes: nodes.filter((n) => !n.getMesh() && !n.getCamera() && !n.getSkin() && !n.listChildren().length && !jointNodes.has(n) && !n.getExtension('KHR_lights_punctual')).length,
  };

  return {
    totals,
    bounds,
    gpu: { geometryBytes: gpuGeometryBytes, textureBytes: gpuTextureBytes, totalBytes: gpuGeometryBytes + gpuTextureBytes },
    meshes: meshItems,
    materials: materialItems,
    textures: textureItems,
    animations: animationItems,
    skins: skinItems,
    scenes,
    unused,
    extensions: {
      used: root.listExtensionsUsed().map((e) => e.extensionName),
      required: root.listExtensionsRequired().map((e) => e.extensionName),
      // Compression the file was stored with (the Document is already decoded).
      raw: [...new Set([...(json.extensionsUsed || [])])],
    },
  };
}

function safeSize(tex) {
  try {
    return tex.getSize();
  } catch {
    return null;
  }
}

function isPow2(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

function isConstantTrack(array, elementSize, count) {
  if (!array || count < 2) return false;
  for (let k = 1; k < count; k++) {
    for (let c = 0; c < elementSize; c++) {
      if (Math.abs(array[k * elementSize + c] - array[c]) > 1e-6) return false;
    }
  }
  return true;
}

/** Fast FNV-1a over the image bytes, for duplicate-texture detection. */
function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${bytes.length}`;
}
