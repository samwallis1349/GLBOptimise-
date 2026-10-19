import { Logger, WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { ApiError } from './http.js';
import { sniffImage } from './images.js';

/**
 * Server-side glTF helpers: one shared IO with Meshopt and Draco codecs, and a
 * raw-JSON analysis ported from the Mobile Ready Checker
 * (public/tools/mobile-ready-checker/index.html) so the API and the site
 * judge models against the same budgets.
 *
 * Draco-compressed inputs are decoded via the Worker-compatible Draco Wasm
 * build (see scripts/vendor-draco.mjs) and stripped of the Draco extension
 * on read so output models can be written uncompressed or with Meshopt.
 */

let ioPromise = null;
export function getIO() {
  if (!ioPromise) {
    ioPromise = (async () => {
      await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
      return new WebIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
      });
    })();
  }
  return ioPromise;
}

// Draco (draco_decoder wasm, ./draco.js) is plugged in by the Worker entry
// point, worker/api/index.js. The browser Asset Pipeline shares this module,
// and importing draco.js here would pull the wasm into the site bundle.
let dracoDecoderLoader = null;
export function registerDracoDecoder(loader) { dracoDecoderLoader = loader; }

export async function readDocument(bytes) {
  const { json } = splitGlb(bytes);
  const io = await getIO();
  if ((json.extensionsUsed || []).includes('KHR_draco_mesh_compression')) {
    if (!dracoDecoderLoader) {
      throw new ApiError(415, 'draco_compressed', 'This GLB uses Draco compression (KHR_draco_mesh_compression), which is not available in this context.');
    }
    io.registerDependencies({ 'draco3d.decoder': await dracoDecoderLoader() });
  }
  try {
    const document = await io.readBinary(bytes);
    document.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_draco_mesh_compression')?.dispose();
    return document;
  } catch (err) {
    throw new ApiError(422, 'unreadable_model', `The model could not be read (${err?.message || 'invalid GLB'}).`);
  }
}

export async function writeDocument(document) {
  const io = await getIO();
  return io.writeBinary(document);
}

/** Guideline budgets per target, identical to the Mobile Ready Checker. */
export const TARGETS = {
  prop: { name: 'Mobile game prop', tris: 10000, draws: 3, mats: 2, texMB: 8, texMax: 1024, fileMB: 2, bones: 32, transp: 1, animMB: 1 },
  character: { name: 'Mobile game character', tris: 25000, draws: 4, mats: 3, texMB: 16, texMax: 2048, fileMB: 6, bones: 75, transp: 1, animMB: 4 },
  scene: { name: 'Whole mobile scene', tris: 200000, draws: 100, mats: 24, texMB: 128, texMax: 2048, fileMB: 30, bones: 100, transp: 6, animMB: 10 },
  quest: { name: 'Standalone VR scene', tris: 300000, draws: 120, mats: 24, texMB: 160, texMax: 2048, fileMB: 40, bones: 75, transp: 4, animMB: 10 },
  web: { name: 'Web 3D viewer', tris: 150000, draws: 40, mats: 12, texMB: 96, texMax: 2048, fileMB: 10, bones: 100, transp: 4, animMB: 8 },
};

const COMP_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export function splitGlb(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) {
    throw new ApiError(415, 'not_glb', 'Send a binary glTF (.glb) file.');
  }
  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= bytes.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const chunk = bytes.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) {
      try { json = JSON.parse(new TextDecoder().decode(chunk)); } catch { throw new ApiError(422, 'unreadable_model', 'The GLB JSON chunk is corrupt.'); }
    } else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (!json) throw new ApiError(422, 'unreadable_model', 'This GLB has no glTF data inside.');
  return { json, bin };
}

function dataUri(uri) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
  if (!m) return null;
  if (!m[2]) return new TextEncoder().encode(decodeURIComponent(m[3]));
  const s = atob(m[3]);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) u[i] = s.charCodeAt(i);
  return u;
}

/** Raw statistics straight from the glTF JSON: works on compressed files without decoding them. */
export function analyseGlb(bytes) {
  const { json, bin } = splitGlb(bytes);
  const acc = json.accessors || [];
  const bvs = json.bufferViews || [];
  const meshes = json.meshes || [];
  const nodes = json.nodes || [];
  const mats = json.materials || [];
  const texs = json.textures || [];
  const imgs = json.images || [];
  const buffers = (json.buffers || []).map((b, i) => (b.uri ? (b.uri.startsWith('data:') ? dataUri(b.uri) : null) : i === 0 ? bin : null));
  const bvBytes = (i) => {
    const bv = bvs[i];
    const B = bv && buffers[bv.buffer];
    return B ? B.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength) : null;
  };
  const used = new Set(json.extensionsUsed || []);

  const perMesh = new Map();
  let tris = 0;
  let draws = 0;
  let nonTri = 0;
  const usedMats = new Set();
  const primTris = (p) => {
    const mode = p.mode ?? 4;
    const idx = p.indices != null ? acc[p.indices] : null;
    const pos = p.attributes && acc[p.attributes.POSITION];
    const n = idx ? idx.count : pos ? pos.count : 0;
    if (mode === 4) return n / 3;
    if (mode === 5 || mode === 6) return Math.max(0, n - 2);
    nonTri += 1;
    return 0;
  };
  const addMesh = (mi, count, nodeName) => {
    const m = meshes[mi];
    const rec = perMesh.get(mi) || { name: m.name || nodeName || `Mesh ${mi}`, triangles: 0, drawCalls: 0 };
    for (const p of m.primitives || []) {
      const t = primTris(p) * count;
      tris += t; rec.triangles += t; draws += 1; rec.drawCalls += 1;
      if (p.material != null) usedMats.add(p.material);
    }
    perMesh.set(mi, rec);
  };
  const visit = (ni, depth) => {
    const n = nodes[ni];
    if (!n || depth > 64) return;
    if (n.mesh != null && meshes[n.mesh]) {
      const inst = n.extensions?.EXT_mesh_gpu_instancing;
      let count = 1;
      if (inst?.attributes) {
        const a = Object.values(inst.attributes)[0];
        count = acc[a] ? acc[a].count : 1;
      }
      addMesh(n.mesh, count, n.name);
    }
    for (const c of n.children || []) visit(c, depth + 1);
  };
  const sc = json.scenes?.[json.scene || 0];
  if (sc?.nodes) sc.nodes.forEach((n) => visit(n, 0));
  else meshes.forEach((_, i) => addMesh(i, 1));

  let verts = 0;
  const seenPos = new Set();
  meshes.forEach((m) => (m.primitives || []).forEach((p) => {
    const a = p.attributes?.POSITION;
    if (a != null && !seenPos.has(a)) { seenPos.add(a); verts += acc[a] ? acc[a].count : 0; }
  }));

  const texSource = (t) => {
    if (!t) return null;
    const e = t.extensions || {};
    return e.KHR_texture_basisu ? e.KHR_texture_basisu.source : e.EXT_texture_webp ? e.EXT_texture_webp.source : e.EXT_texture_avif ? e.EXT_texture_avif.source : t.source;
  };
  const imgUse = new Map();
  const noteTex = (info, slot) => {
    if (!info || info.index == null) return;
    const src = texSource(texs[info.index]);
    if (src == null) return;
    const u = imgUse.get(src) || new Set();
    u.add(slot);
    imgUse.set(src, u);
  };
  mats.forEach((m) => {
    const pbr = m.pbrMetallicRoughness || {};
    noteTex(pbr.baseColorTexture, 'baseColor');
    noteTex(pbr.metallicRoughnessTexture, 'metallicRoughness');
    noteTex(m.normalTexture, 'normal');
    noteTex(m.occlusionTexture, 'occlusion');
    noteTex(m.emissiveTexture, 'emissive');
    for (const ext of Object.values(m.extensions || {})) for (const v of Object.values(ext || {})) if (v && typeof v === 'object' && v.index != null) noteTex(v, 'extension');
  });
  const textures = [];
  let texMem = 0;
  let texMax = 0;
  let npot = 0;
  let unknownTex = 0;
  for (const [src, slots] of imgUse) {
    const im = imgs[src];
    if (!im) continue;
    let bytesOf = null;
    if (im.bufferView != null) bytesOf = bvBytes(im.bufferView);
    else if (im.uri?.startsWith('data:')) bytesOf = dataUri(im.uri);
    const info = bytesOf ? sniffImage(bytesOf) : null;
    const w = info?.width || 0;
    const h = info?.height || 0;
    if (!w || !h) unknownTex += 1;
    const gpu = info?.mime === 'image/ktx2';
    const mem = (w * h * (gpu ? 1 : 4) * 4) / 3;
    texMem += mem;
    texMax = Math.max(texMax, w, h);
    if (w && h && ((w & (w - 1)) || (h & (h - 1)))) npot += 1;
    textures.push({ name: im.name || `Image ${src}`, width: w, height: h, mimeType: info?.mime || im.mimeType || null, gpuMemoryBytes: Math.round(mem), slots: [...slots] });
  }

  const bones = Math.max(0, ...(json.skins || []).map((s) => (s.joints || []).length));
  let animBytes = 0;
  const animAcc = new Set();
  for (const a of json.animations || []) for (const s of a.samplers || []) for (const ai of [s.input, s.output]) {
    if (ai != null && !animAcc.has(ai)) {
      animAcc.add(ai);
      const A = acc[ai];
      if (A) animBytes += A.count * (COMP_SIZE[A.componentType] || 4) * (TYPE_N[A.type] || 1);
    }
  }
  const transparent = [...usedMats].filter((i) => mats[i]?.alphaMode === 'BLEND').length;

  return {
    fileBytes: bytes.byteLength,
    triangles: Math.round(tris),
    vertices: verts,
    drawCalls: draws,
    materials: usedMats.size || mats.length,
    transparentMaterials: transparent,
    meshCount: meshes.length,
    meshes: [...perMesh.values()].map((m) => ({ ...m, triangles: Math.round(m.triangles) })).sort((a, b) => b.triangles - a.triangles).slice(0, 50),
    textures,
    textureMemoryBytes: Math.round(texMem),
    largestTexture: texMax,
    nonPowerOfTwoTextures: npot,
    unmeasuredTextures: unknownTex,
    skins: (json.skins || []).length,
    maxBonesPerSkin: bones,
    animations: (json.animations || []).length,
    animationBytes: animBytes,
    nonTrianglePrimitives: nonTri,
    compression: {
      draco: used.has('KHR_draco_mesh_compression'),
      meshopt: used.has('EXT_meshopt_compression') || used.has('KHR_meshopt_compression'),
      ktx2: used.has('KHR_texture_basisu'),
      webp: used.has('EXT_texture_webp'),
    },
  };
}

const MB = 1048576;
const judge = (value, budget) => {
  const r = budget ? value / budget : 0;
  return { ratio: Number(r.toFixed(3)), status: r <= 1 ? 'pass' : r <= 1.5 ? 'close' : 'fail' };
};

/** Scores stats against a target budget, same weighting as the site's checker. */
/** `target` is a TARGETS id or a budget object with the same fields plus `name`. */
export function evaluate(stats, target) {
  const targetId = typeof target === 'string' ? target : target.id;
  const T = typeof target === 'string' ? TARGETS[target] : target;
  if (!T) throw new ApiError(400, 'unknown_target', `Unknown target '${targetId}'.`, { targets: Object.keys(TARGETS) });
  const checks = [];
  const add = (key, name, value, budget, fix, forced) => checks.push({ key, name, value, budget, fix, ...(forced || judge(value, budget)) });
  add('triangles', 'Triangles', stats.triangles, T.tris, ['3d/optimize', '3d/lods']);
  add('drawCalls', 'Draw calls', stats.drawCalls, T.draws, ['merge meshes in your DCC tool']);
  add('materials', 'Materials', stats.materials, T.mats, ['merge materials / atlas textures']);
  add('textureMemory', 'Texture memory (bytes)', stats.textureMemoryBytes, T.texMB * MB, ['3d/optimize maxTextureSize']);
  add('largestTexture', 'Largest texture (px)', stats.largestTexture, T.texMax, ['3d/optimize maxTextureSize']);
  add('fileSize', 'File size (bytes)', stats.fileBytes, T.fileMB * MB, ['3d/optimize']);
  if (stats.skins) add('bones', 'Bones per skeleton', stats.maxBonesPerSkin, T.bones, ['reduce the rig in your DCC tool']);
  if (stats.animations) add('animation', 'Animation data (bytes)', stats.animationBytes, T.animMB * MB, ['strip unused clips']);
  add('transparency', 'Blended materials', stats.transparentMaterials, T.transp, ['use alpha cutout (MASK) where possible']);
  const geoBig = stats.fileBytes > 1.5 * MB;
  const meshComp = stats.compression.draco || stats.compression.meshopt;
  add('meshCompression', 'Mesh compression', meshComp ? 1 : 0, 1, ['3d/optimize compress=true'], { ratio: 0, status: meshComp || !geoBig ? 'pass' : 'close' });
  add('powerOfTwo', 'Power-of-two textures', stats.nonPowerOfTwoTextures, 0, ['3d/optimize maxTextureSize'], { ratio: 0, status: stats.nonPowerOfTwoTextures ? 'close' : 'pass' });

  const W = (k) => (['triangles', 'drawCalls', 'textureMemory', 'fileSize'].includes(k) ? 2 : 1);
  const pts = checks.reduce((a, c) => a + W(c.key) * (c.status === 'pass' ? 1 : c.status === 'close' ? 0.5 : 0), 0);
  // A failed check caps the score, so the number always agrees with the
  // verdict bands: 90+ mobile-ready, 60-89 needs work, under 60 not ready.
  // Any fail keeps it under 90; a fail over twice the budget, under 60.
  let score = Math.round((100 * pts) / checks.reduce((a, c) => a + W(c.key), 0));
  const fails = checks.filter((c) => c.status === 'fail');
  if (fails.some((c) => c.ratio > 2)) score = Math.min(score, 59);
  else if (fails.length) score = Math.min(score, 89);
  const verdict = score >= 90 ? 'mobile-ready' : score >= 60 ? 'needs-work' : 'not-ready';
  return { target: targetId, targetName: T.name, score, verdict, checks };
}
