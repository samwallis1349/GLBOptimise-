import JSZip from 'jszip';
import { Document, Logger } from '@gltf-transform/core';
import { ApiError } from './http.js';
import { getIO, readDocument, splitGlb } from './glb.js';
import { sniffImage } from './images.js';

/**
 * Format conversion, DOM-free:
 *   glb  -> gltf (ZIP: .gltf + .bin + textures), obj (ZIP: .obj + .mtl + textures)
 *   gltf -> glb   (a .gltf with embedded data, or a ZIP with .gltf/.bin/textures)
 *   obj  -> glb   (a .obj, or a ZIP with .obj/.mtl/textures)
 *   fbx  -> glb   (three.js FBXLoader + GLTFExporter, embedded textures carried over)
 * FBX output is not offered: there is no JavaScript FBX writer.
 */

export const CONVERSIONS = { glb: ['gltf', 'obj'], gltf: ['glb'], obj: ['glb'], fbx: ['glb'] };

export function detectFormat(bytes, filename) {
  const head = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 32)));
  if (head.startsWith('glTF')) return 'glb';
  if (head.startsWith('Kaydara FBX Binary')) return 'fbx';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
  const ext = String(filename || '').split('.').pop().toLowerCase();
  if (['gltf', 'obj', 'fbx'].includes(ext)) return ext;
  const text = new TextDecoder().decode(bytes.subarray(0, 2048));
  if (/^\s*\{/.test(text) && text.includes('"asset"')) return 'gltf';
  if (/^\s*;\s*FBX/m.test(text) || text.includes('FBXHeaderExtension')) return 'fbx';
  if (/^\s*(v|vn|vt|f|o|g|mtllib)\s/m.test(text)) return 'obj';
  return null;
}

const decoder = new TextDecoder();
const baseOf = (path) => path.split(/[\\/]/).pop();

async function unzipEntries(bytes) {
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new ApiError(422, 'unreadable_zip', 'The ZIP could not be opened.'); }
  const entries = new Map();
  for (const file of Object.values(zip.files)) {
    if (file.dir || file.name.startsWith('__MACOSX/')) continue;
    entries.set(file.name, await file.async('uint8array'));
  }
  return entries;
}

/** Finds a referenced file in a ZIP by exact path, then by basename (exporters disagree on folders). */
function findEntry(entries, ref, fromPath = '') {
  const clean = decodeURIComponent(String(ref).replace(/\\/g, '/'));
  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : '';
  if (entries.has(dir + clean)) return entries.get(dir + clean);
  if (entries.has(clean)) return entries.get(clean);
  const want = baseOf(clean).toLowerCase();
  for (const [name, data] of entries) if (baseOf(name).toLowerCase() === want) return data;
  return null;
}

// ---------- glTF <-> GLB ----------

async function gltfToGlb(bytes, entries) {
  const io = await getIO();
  let gltfPath = null;
  let json;
  if (entries) {
    gltfPath = [...entries.keys()].find((n) => n.toLowerCase().endsWith('.gltf'));
    if (!gltfPath) throw new ApiError(422, 'no_gltf_in_zip', 'The ZIP has no .gltf file.');
    bytes = entries.get(gltfPath);
  }
  try { json = JSON.parse(decoder.decode(bytes)); } catch { throw new ApiError(422, 'unreadable_model', 'The .gltf file is not valid JSON.'); }
  const resources = {};
  const missing = [];
  for (const item of [...(json.buffers || []), ...(json.images || [])]) {
    if (!item.uri || item.uri.startsWith('data:')) continue;
    const data = entries ? findEntry(entries, item.uri, gltfPath) : null;
    if (data) resources[item.uri] = data;
    else missing.push(item.uri);
  }
  if (missing.length) throw new ApiError(422, 'missing_resources', `These files referenced by the .gltf are missing: ${missing.join(', ')}. Upload a ZIP with the .gltf and its files.`);
  try {
    const document = await io.readJSON({ json, resources });
    return io.writeBinary(document);
  } catch (err) {
    throw new ApiError(422, 'unreadable_model', `The glTF could not be read (${err?.message || 'invalid'}).`);
  }
}

async function glbToGltf(bytes, name) {
  const io = await getIO();
  const document = await readDocument(bytes);
  // Give textures file names that survive in a ZIP.
  document.getRoot().listTextures().forEach((t, i) => {
    const ext = t.getMimeType() === 'image/jpeg' ? 'jpg' : t.getMimeType() === 'image/ktx2' ? 'ktx2' : t.getMimeType() === 'image/webp' ? 'webp' : 'png';
    t.setURI(`textures/${(t.getName() || `texture_${i}`).replace(/[^\w-]+/g, '_')}_${i}.${ext}`);
  });
  document.getRoot().listBuffers().forEach((b, i) => b.setURI(i ? `${name}_${i}.bin` : `${name}.bin`));
  const { json, resources } = await io.writeJSON(document);
  const zip = new JSZip();
  zip.file(`${name}.gltf`, JSON.stringify(json, null, 2));
  for (const [uri, data] of Object.entries(resources)) zip.file(uri, data);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ---------- GLB -> OBJ ----------

function multiply(a, b) {
  const o = new Array(16);
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
    o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  }
  return o;
}

function normalMatrix(m) {
  // Inverse-transpose of the upper 3x3, good enough for uniform and non-uniform scale.
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A = e * i - f * h; const B = -(d * i - f * g); const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  return [A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
}

async function glbToObj(bytes, name) {
  const document = await readDocument(bytes);
  const root = document.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const lines = [`# Converted by AssetBench Cloud`, `mtllib ${name}.mtl`];
  const mtl = ['# Converted by AssetBench Cloud'];
  const zip = new JSZip();
  const matNames = new Map();
  const texFiles = new Map();
  const warnings = [];
  const texFile = (texture) => {
    if (!texture) return null;
    if (!texFiles.has(texture)) {
      const mime = texture.getMimeType();
      if (mime !== 'image/png' && mime !== 'image/jpeg') { warnings.push(`A ${mime} texture cannot be referenced from OBJ and was left out.`); texFiles.set(texture, null); return null; }
      const file = `textures/${(texture.getName() || `texture_${texFiles.size}`).replace(/[^\w-]+/g, '_')}_${texFiles.size}.${mime === 'image/jpeg' ? 'jpg' : 'png'}`;
      zip.file(file, texture.getImage());
      texFiles.set(texture, file);
    }
    return texFiles.get(texture);
  };
  const materialName = (material) => {
    if (!material) return 'default';
    if (!matNames.has(material)) {
      const id = `${(material.getName() || 'material').replace(/[^\w-]+/g, '_')}_${matNames.size}`;
      matNames.set(material, id);
      const [r, g, b, a] = material.getBaseColorFactor();
      mtl.push('', `newmtl ${id}`, `Kd ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`, `d ${a.toFixed(4)}`, 'illum 2');
      const kd = texFile(material.getBaseColorTexture());
      if (kd) mtl.push(`map_Kd ${kd}`);
      const bump = texFile(material.getNormalTexture());
      if (bump) mtl.push(`norm ${bump}`, `map_Bump ${bump}`);
      const ke = texFile(material.getEmissiveTexture());
      if (ke) mtl.push(`map_Ke ${ke}`);
    }
    return matNames.get(material);
  };

  let vBase = 1; let vtBase = 1; let vnBase = 1;
  let skinned = false;
  const visit = (node, parent) => {
    const world = multiply(parent, node.getMatrix());
    const mesh = node.getMesh();
    if (mesh) {
      if (node.getSkin()) skinned = true;
      lines.push(`o ${(node.getName() || mesh.getName() || 'mesh').replace(/\s+/g, '_')}`);
      const nm = normalMatrix(world);
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== 4) continue;
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const nor = prim.getAttribute('NORMAL');
        const uv = prim.getAttribute('TEXCOORD_0');
        const count = pos.getCount();
        const p = [0, 0, 0]; const n = [0, 0, 0]; const t = [0, 0];
        for (let i = 0; i < count; i += 1) {
          pos.getElement(i, p);
          lines.push(`v ${(world[0] * p[0] + world[4] * p[1] + world[8] * p[2] + world[12]).toFixed(6)} ${(world[1] * p[0] + world[5] * p[1] + world[9] * p[2] + world[13]).toFixed(6)} ${(world[2] * p[0] + world[6] * p[1] + world[10] * p[2] + world[14]).toFixed(6)}`);
        }
        if (uv) for (let i = 0; i < count; i += 1) { uv.getElement(i, t); lines.push(`vt ${t[0].toFixed(6)} ${(1 - t[1]).toFixed(6)}`); }
        if (nor) {
          for (let i = 0; i < count; i += 1) {
            nor.getElement(i, n);
            const x = nm[0] * n[0] + nm[3] * n[1] + nm[6] * n[2]; const y = nm[1] * n[0] + nm[4] * n[1] + nm[7] * n[2]; const z = nm[2] * n[0] + nm[5] * n[1] + nm[8] * n[2];
            const len = Math.hypot(x, y, z) || 1;
            lines.push(`vn ${(x / len).toFixed(5)} ${(y / len).toFixed(5)} ${(z / len).toFixed(5)}`);
          }
        }
        lines.push(`usemtl ${materialName(prim.getMaterial())}`);
        const idx = prim.getIndices();
        const tri = idx ? idx.getArray() : Uint32Array.from({ length: count }, (_, i) => i);
        const ref = (i) => `${vBase + i}${uv || nor ? `/${uv ? vtBase + i : ''}` : ''}${nor ? `/${vnBase + i}` : ''}`;
        for (let i = 0; i + 2 < tri.length; i += 3) lines.push(`f ${ref(tri[i])} ${ref(tri[i + 1])} ${ref(tri[i + 2])}`);
        vBase += count; if (uv) vtBase += count; if (nor) vnBase += count;
      }
    }
    for (const child of node.listChildren()) visit(child, world);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const node of scene?.listChildren() || []) visit(node, identity);
  if (skinned) warnings.push('OBJ has no skeletons or animation; the mesh was exported in its bind pose.');
  if (root.listAnimations().length) warnings.push(`${root.listAnimations().length} animation clip(s) were dropped (OBJ cannot store animation).`);
  if (!matNames.size) mtl.push('', 'newmtl default', 'Kd 0.8 0.8 0.8');
  zip.file(`${name}.obj`, lines.join('\n') + '\n');
  zip.file(`${name}.mtl`, mtl.join('\n') + '\n');
  return { output: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), warnings };
}

// ---------- OBJ -> GLB ----------

function parseMtl(text) {
  const mats = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(/\s+/);
    const value = rest.join(' ');
    if (key === 'newmtl') { cur = { name: value, kd: [0.8, 0.8, 0.8], d: 1 }; mats.set(value, cur); continue; }
    if (!cur) continue;
    if (key === 'Kd') cur.kd = rest.slice(0, 3).map(Number);
    else if (key === 'd') cur.d = Number(rest[0]);
    else if (key === 'Tr') cur.d = 1 - Number(rest[0]);
    else if (key === 'map_Kd') cur.mapKd = rest[rest.length - 1];
    else if (key === 'map_Bump' || key === 'bump' || key === 'norm') cur.mapBump = rest[rest.length - 1];
    else if (key === 'map_Ke') cur.mapKe = rest[rest.length - 1];
  }
  return mats;
}

async function objToGlb(bytes, entries, name) {
  let objPath = null;
  if (entries) {
    objPath = [...entries.keys()].find((n) => n.toLowerCase().endsWith('.obj'));
    if (!objPath) throw new ApiError(422, 'no_obj_in_zip', 'The ZIP has no .obj file.');
    bytes = entries.get(objPath);
  }
  const text = decoder.decode(bytes);
  const warnings = [];
  const V = []; const VT = []; const VN = [];
  const groups = new Map(); // material -> { positions, uvs, normals }
  let material = 'default';
  let mtlText = null;
  const group = () => {
    if (!groups.has(material)) groups.set(material, { p: [], t: [], n: [], hasT: false, hasN: false });
    return groups.get(material);
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const parts = line.split(/\s+/);
    const key = parts[0];
    if (key === 'v') V.push(+parts[1], +parts[2], +parts[3]);
    else if (key === 'vt') VT.push(+parts[1], +(parts[2] ?? 0));
    else if (key === 'vn') VN.push(+parts[1], +parts[2], +parts[3]);
    else if (key === 'usemtl') material = parts.slice(1).join(' ') || 'default';
    else if (key === 'mtllib' && entries) {
      const data = findEntry(entries, parts.slice(1).join(' '), objPath);
      if (data) mtlText = decoder.decode(data);
      else warnings.push(`Material library ${parts.slice(1).join(' ')} was not in the upload; default materials used.`);
    } else if (key === 'f') {
      const verts = parts.slice(1).map((token) => {
        const [vi, ti, ni] = token.split('/');
        const fix = (i, len) => (i ? (Number(i) < 0 ? len + Number(i) : Number(i) - 1) : -1);
        return [fix(vi, V.length / 3), fix(ti, VT.length / 2), fix(ni, VN.length / 3)];
      });
      const g = group();
      for (let i = 1; i + 1 < verts.length; i += 1) {
        for (const [vi, ti, ni] of [verts[0], verts[i], verts[i + 1]]) {
          g.p.push(V[vi * 3], V[vi * 3 + 1], V[vi * 3 + 2]);
          if (ti >= 0) { g.t.push(VT[ti * 2], 1 - VT[ti * 2 + 1]); g.hasT = true; } else g.t.push(0, 0);
          if (ni >= 0) { g.n.push(VN[ni * 3], VN[ni * 3 + 1], VN[ni * 3 + 2]); g.hasN = true; } else g.n.push(0, 0, 0);
        }
      }
    }
  }
  if (!groups.size) throw new ApiError(422, 'no_geometry', 'The OBJ contains no faces.');
  if (!mtlText && !entries && /^\s*mtllib\s/m.test(text)) warnings.push('The OBJ references a .mtl file; upload a ZIP with the .obj, .mtl and textures to keep materials.');

  const mtls = mtlText ? parseMtl(mtlText) : new Map();
  const document = new Document();
  document.setLogger(new Logger(Logger.Verbosity.WARN));
  const buffer = document.createBuffer();
  const mesh = document.createMesh(name);
  const textures = new Map();
  const texture = (ref) => {
    if (!ref || !entries) return null;
    if (!textures.has(ref)) {
      const data = findEntry(entries, ref, objPath);
      const info = data && sniffImage(data);
      if (!info || !['image/png', 'image/jpeg'].includes(info.mime)) { warnings.push(`Texture ${ref} is missing or not PNG/JPEG; skipped.`); textures.set(ref, null); }
      else textures.set(ref, document.createTexture(baseOf(ref)).setImage(data).setMimeType(info.mime));
    }
    return textures.get(ref);
  };
  for (const [matName, g] of groups) {
    const m = mtls.get(matName);
    const mat = document.createMaterial(matName).setBaseColorFactor([...(m?.kd ?? [0.8, 0.8, 0.8]), m?.d ?? 1]).setMetallicFactor(0).setRoughnessFactor(0.8);
    if (m && m.d < 1) mat.setAlphaMode('BLEND');
    const kd = texture(m?.mapKd); if (kd) mat.setBaseColorTexture(kd);
    const nb = texture(m?.mapBump); if (nb) mat.setNormalTexture(nb);
    const ke = texture(m?.mapKe); if (ke) mat.setEmissiveTexture(ke).setEmissiveFactor([1, 1, 1]);
    const prim = document.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(new Float32Array(g.p)).setBuffer(buffer));
    if (g.hasN) prim.setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(new Float32Array(g.n)).setBuffer(buffer));
    if (g.hasT) prim.setAttribute('TEXCOORD_0', document.createAccessor().setType('VEC2').setArray(new Float32Array(g.t)).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  document.createScene(name).addChild(document.createNode(name).setMesh(mesh));
  const { weld } = await import('@gltf-transform/functions');
  await document.transform(weld());
  return { output: await (await getIO()).writeBinary(document), warnings };
}

// ---------- FBX -> GLB ----------

/** Minimal FileReader for three's GLTFExporter, which reads its output Blob with one. */
class BlobReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.({ target: this }); }); }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((r) => {
      let s = ''; const u = new Uint8Array(r);
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${btoa(s)}`; this.onloadend?.(); this.onload?.({ target: this });
    });
  }
}

async function fbxToGlb(bytes, entries) {
  let fbxBytes = bytes;
  if (entries) {
    const path = [...entries.keys()].find((n) => n.toLowerCase().endsWith('.fbx'));
    if (!path) throw new ApiError(422, 'no_fbx_in_zip', 'The ZIP has no .fbx file.');
    fbxBytes = entries.get(path);
  }
  const THREE = await import('three');
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const warnings = [];

  // FBXLoader turns embedded images into object URLs and loads them with
  // TextureLoader (which needs a DOM). Capture the bytes instead and put them
  // back as glTF textures after export.
  const blobs = new Map();
  const origCreate = URL.createObjectURL;
  const origLoad = THREE.TextureLoader.prototype.load;
  let counter = 0;
  URL.createObjectURL = (blob) => { const id = `abk-blob:${counter += 1}`; blobs.set(id, blob); return id; };
  THREE.TextureLoader.prototype.load = function load(url) { const t = new THREE.Texture(); t.userData.abkSource = url; return t; };
  let group;
  try {
    group = new FBXLoader().parse(fbxBytes.buffer.slice(fbxBytes.byteOffset, fbxBytes.byteOffset + fbxBytes.byteLength), '');
  } catch (err) {
    throw new ApiError(422, 'unreadable_model', `The FBX could not be read (${err?.message || 'invalid'}). ASCII FBX older than 7.0 is not supported.`);
  } finally {
    URL.createObjectURL = origCreate;
    THREE.TextureLoader.prototype.load = origLoad;
  }

  const SLOTS = { map: 'baseColor', normalMap: 'normal', emissiveMap: 'emissive' };
  const pending = new Map(); // material uuid -> { slot: source }
  const seen = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      for (const [prop, slot] of Object.entries(SLOTS)) {
        const tex = m[prop];
        if (!tex) continue;
        const src = tex.userData?.abkSource;
        if (src) { const p = pending.get(m.uuid) || {}; p[slot] = src; pending.set(m.uuid, p); }
        m[prop] = null;
      }
      for (const prop of ['specularMap', 'bumpMap', 'alphaMap', 'aoMap', 'lightMap', 'displacementMap']) if (m[prop]) m[prop] = null;
      m.userData = { ...m.userData, abkMaterial: m.uuid };
    }
  });

  if (typeof globalThis.FileReader === 'undefined') globalThis.FileReader = BlobReader;
  let glb;
  try {
    glb = new Uint8Array(await new GLTFExporter().parseAsync(group, { binary: true, animations: group.animations, onlyVisible: false }));
  } catch (err) {
    throw new ApiError(422, 'conversion_failed', `The FBX was read but could not be written as glTF (${err?.message || 'unknown error'}).`);
  }

  // Re-attach embedded textures by the material id carried in extras.
  const document = await readDocument(glb);
  const byKey = new Map();
  let attached = 0;
  for (const material of document.getRoot().listMaterials()) {
    const key = material.getExtras()?.abkMaterial;
    const slots = key && pending.get(key);
    if (!slots) continue;
    for (const [slot, src] of Object.entries(slots)) {
      let tex = byKey.get(src);
      if (tex === undefined) {
        let data = null;
        if (blobs.has(src)) data = new Uint8Array(await blobs.get(src).arrayBuffer());
        else if (entries) data = findEntry(entries, src);
        const info = data && sniffImage(data);
        tex = info && ['image/png', 'image/jpeg'].includes(info.mime) ? document.createTexture(baseOf(src)).setImage(data).setMimeType(info.mime) : null;
        if (!tex) warnings.push(`Texture ${baseOf(src)} was ${data ? 'not PNG/JPEG' : 'not embedded in the FBX or included in the ZIP'}; skipped.`);
        byKey.set(src, tex);
      }
      if (!tex) continue;
      attached += 1;
      if (slot === 'baseColor') material.setBaseColorTexture(tex);
      else if (slot === 'normal') material.setNormalTexture(tex);
      else material.setEmissiveTexture(tex).setEmissiveFactor([1, 1, 1]);
    }
    const { abkMaterial, ...rest } = material.getExtras();
    material.setExtras(rest);
  }
  const { json } = splitGlb(glb);
  const { min, max } = (await import('@gltf-transform/core')).getBounds(document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0]);
  const largest = Math.max(...max.map((v, i) => v - min[i]));
  if (largest > 50) warnings.push(`The model is ${largest.toFixed(0)} units across; FBX files are often in centimetres. Pass scale=0.01 to convert to metres.`);
  return { output: await (await getIO()).writeBinary(document), warnings, info: { meshes: json.meshes?.length || 0, animations: group.animations.length, texturesAttached: attached } };
}

export async function convert(bytes, params, filename) {
  const name = String(filename || 'model').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 60) || 'model';
  let from = detectFormat(bytes, filename);
  let entries = null;
  if (from === 'zip') {
    entries = await unzipEntries(bytes);
    const names = [...entries.keys()].map((n) => n.toLowerCase());
    from = names.some((n) => n.endsWith('.gltf')) ? 'gltf' : names.some((n) => n.endsWith('.fbx')) ? 'fbx' : names.some((n) => n.endsWith('.obj')) ? 'obj' : names.some((n) => n.endsWith('.glb')) ? 'glb' : null;
    if (from === 'glb') { bytes = entries.get([...entries.keys()].find((n) => n.toLowerCase().endsWith('.glb'))); entries = null; }
  }
  if (!from) throw new ApiError(415, 'unknown_format', 'Could not tell the input format. Send .glb, .gltf, .obj, .fbx, or a ZIP containing one with its files.');
  const to = String(params.to || (from === 'glb' ? 'gltf' : 'glb')).toLowerCase();
  if (to === 'fbx') throw new ApiError(400, 'fbx_output_unsupported', 'FBX output is not available: there is no JavaScript FBX writer. Convert to GLB, which Unity (glTFast), Unreal 5, Godot and Blender all import.');
  if (!CONVERSIONS[from]?.includes(to)) throw new ApiError(400, 'unsupported_conversion', `Cannot convert ${from} to ${to}. Supported: ${Object.entries(CONVERSIONS).map(([f, t]) => `${f}→${t.join('/')}`).join(', ')}.`);

  let result;
  if (from === 'glb' && to === 'gltf') result = { output: await glbToGltf(bytes, name), warnings: [], ext: 'zip', type: 'application/zip' };
  else if (from === 'glb' && to === 'obj') result = { ...(await glbToObj(bytes, name)), ext: 'zip', type: 'application/zip' };
  else if (from === 'gltf') result = { output: await gltfToGlb(bytes, entries), warnings: [], ext: 'glb', type: 'model/gltf-binary' };
  else if (from === 'obj') result = { ...(await objToGlb(bytes, entries, name)), ext: 'glb', type: 'model/gltf-binary' };
  else result = { ...(await fbxToGlb(bytes, entries)), ext: 'glb', type: 'model/gltf-binary' };

  const scale = Number(params.scale || 1);
  if (result.ext === 'glb' && scale !== 1) {
    if (!(scale > 0 && scale <= 1000)) throw new ApiError(400, 'invalid_scale', 'scale must be a number between 0 and 1000.');
    const document = await readDocument(result.output);
    for (const node of (document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0]).listChildren()) {
      const s = node.getScale();
      node.setScale([s[0] * scale, s[1] * scale, s[2] * scale]);
      node.setTranslation(node.getTranslation().map((v) => v * scale));
    }
    result.output = await (await getIO()).writeBinary(document);
    result.warnings = result.warnings.filter((w) => !w.includes('scale=0.01'));
  }
  return { ...result, from, to, name, filename: `${name}.${result.ext === 'zip' ? `${to}.zip` : 'glb'}` };
}
