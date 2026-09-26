import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { CONVERT_FILES_CONFIG } from '../config.js';

export const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'specularMap', 'bumpMap', 'alphaMap', 'lightMap'];

export const materialsOf = (mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean);

const safeName = (s) => (s || '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
const f6 = (n) => (Math.abs(n) < 1e-9 ? 0 : +n.toFixed(6)).toString();

function validTexture(tex) {
  const img = tex?.image;
  return Boolean(img) && (img.width || img.videoWidth || 0) > 0;
}

/** Converts Phong/Lambert/Basic materials to MeshStandardMaterial so every exporter sees PBR inputs. */
function toStandard(material, cache) {
  if (!material) return new THREE.MeshStandardMaterial();
  if (cache.has(material)) return cache.get(material);
  let out;
  if (material.isMeshStandardMaterial) {
    out = material.clone();
  } else {
    out = new THREE.MeshStandardMaterial({
      name: material.name,
      color: material.color ? material.color.clone() : new THREE.Color(1, 1, 1),
      map: material.map || null,
      normalMap: material.normalMap || null,
      alphaMap: material.alphaMap || null,
      aoMap: material.aoMap || null,
      emissive: material.emissive ? material.emissive.clone() : new THREE.Color(0),
      emissiveMap: material.emissiveMap || null,
      opacity: material.opacity,
      transparent: material.transparent,
      alphaTest: material.alphaTest,
      side: material.side,
      vertexColors: material.vertexColors,
      roughness: material.isMeshBasicMaterial ? 1 : material.shininess !== undefined ? Math.min(1, Math.sqrt(2 / (material.shininess + 2))) : 0.9,
      metalness: 0,
    });
  }
  out.wireframe = false;
  for (const key of TEX_KEYS) if (out[key] && !validTexture(out[key])) out[key] = null;
  cache.set(material, out);
  return out;
}

/** Prepares a cloned export root: standard materials, no wireframe, world matrices current. */
export function prepareExportRoot(root, name) {
  root.name = name || 'model';
  const cache = new Map();
  root.traverse((o) => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => toStandard(m, cache)) : toStandard(o.material, cache);
  });
  root.updateMatrixWorld(true);
  return root;
}

function textureToPng(tex) {
  return new Promise((resolve) => {
    const img = tex.image;
    const w = img.width || img.videoWidth;
    const h = img.height || img.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    try {
      if (img.data && !(img instanceof HTMLCanvasElement)) {
        // DataTexture (e.g. TGA): expand 1–4 channels to RGBA.
        const src = img.data;
        const px = new Uint8ClampedArray(w * h * 4);
        const ch = src.length / (w * h);
        for (let i = 0; i < w * h; i++) {
          px[i * 4] = src[i * ch];
          px[i * 4 + 1] = src[i * ch + (ch > 1 ? 1 : 0)];
          px[i * 4 + 2] = src[i * ch + (ch > 2 ? 2 : 0)];
          px[i * 4 + 3] = ch > 3 ? src[i * ch + 3] : 255;
        }
        ctx.putImageData(new ImageData(px, w, h), 0, 0);
      } else {
        ctx.drawImage(img, 0, 0);
      }
    } catch {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

async function exportObj(root, base) {
  const lines = ['# Exported by Asset Bench Model Forge', `mtllib ${base}.mtl`];
  const matNames = new Map();
  const texFiles = new Map();
  const used = new Set();
  const files = {};
  const nameMaterial = (m) => {
    if (matNames.has(m)) return matNames.get(m);
    const n = safeName(m.name) || 'material';
    let k = n;
    let i = 2;
    while (used.has(k)) k = `${n}_${i++}`;
    used.add(k);
    matNames.set(m, k);
    return k;
  };

  let vo = 1;
  let to = 1;
  let no = 1;
  let meshIndex = 0;
  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const mats = materialsOf(o);
    const flipV = mats.some((m) => m.map && m.map.flipY === false);
    lines.push(`o ${safeName(o.name) || `mesh_${meshIndex}`}`);
    meshIndex++;
    // Skinned meshes are written in their bind pose.
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      lines.push(`v ${f6(v.x)} ${f6(v.y)} ${f6(v.z)}`);
    }
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        const y = uv.getY(i);
        lines.push(`vt ${f6(uv.getX(i))} ${f6(flipV ? 1 - y : y)}`);
      }
    }
    if (nor) {
      normalMatrix.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < nor.count; i++) {
        v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        lines.push(`vn ${f6(v.x)} ${f6(v.y)} ${f6(v.z)}`);
      }
    }
    const idx = g.index;
    const count = idx ? idx.count : pos.count;
    const at = (i) => (idx ? idx.getX(i) : i);
    const flip = o.matrixWorld.determinant() < 0;
    const groups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    const ref = (a) => {
      const vi = a + vo;
      if (uv && nor) return `${vi}/${a + to}/${a + no}`;
      if (uv) return `${vi}/${a + to}`;
      if (nor) return `${vi}//${a + no}`;
      return `${vi}`;
    };
    for (const group of groups) {
      lines.push(`usemtl ${nameMaterial(mats[group.materialIndex] || mats[0])}`);
      const end = Math.min(group.start + group.count, count);
      for (let i = group.start; i + 2 < end; i += 3) {
        const a = at(i);
        const b = at(i + 1);
        const c = at(i + 2);
        lines.push(flip ? `f ${ref(a)} ${ref(c)} ${ref(b)}` : `f ${ref(a)} ${ref(b)} ${ref(c)}`);
      }
    }
    vo += pos.count;
    if (uv) to += uv.count;
    if (nor) no += nor.count;
  });

  const mtl = ['# Exported by Asset Bench Model Forge'];
  const srgb = (c) => {
    const t = {};
    c.getRGB(t, THREE.SRGBColorSpace);
    return `${f6(t.r)} ${f6(t.g)} ${f6(t.b)}`;
  };
  for (const [m, n] of matNames) {
    mtl.push('', `newmtl ${n}`, 'Ka 0 0 0', `Kd ${srgb(m.color || new THREE.Color(1, 1, 1))}`, 'Ks 0.2 0.2 0.2');
    const r = Math.max(0.05, m.roughness ?? 0.8);
    mtl.push(`Ns ${Math.min(1000, Math.max(1, 2 / (r * r) - 2)).toFixed(1)}`);
    if (m.emissive && m.emissive.getHex()) mtl.push(`Ke ${srgb(m.emissive)}`);
    mtl.push(`d ${f6(m.transparent ? m.opacity : 1)}`, 'illum 2');
    for (const [key, tag] of [['map', 'map_Kd'], ['normalMap', 'map_Bump'], ['emissiveMap', 'map_Ke'], ['alphaMap', 'map_d']]) {
      const tex = m[key];
      if (!tex) continue;
      if (!texFiles.has(tex)) {
        const blob = await textureToPng(tex);
        if (!blob) continue;
        let fn = `${safeName(tex.name) || `${n}_${key.replace('Map', '') || 'diffuse'}`}.png`;
        let i = 2;
        while (files[`textures/${fn}`]) fn = fn.replace(/(_\d+)?\.png$/, `_${i++}.png`);
        files[`textures/${fn}`] = new Uint8Array(await blob.arrayBuffer());
        texFiles.set(tex, `textures/${fn}`);
      }
      mtl.push(`${tag} ${texFiles.get(tex)}`);
    }
  }
  files[`${base}.obj`] = strToU8(`${lines.join('\n')}\n`);
  files[`${base}.mtl`] = strToU8(`${mtl.join('\n')}\n`);
  return files;
}

/**
 * Exports a prepared root to `format` and zips the result.
 * @returns {Promise<{ blob: Blob, filename: string, lost: string[] }>}
 */
export async function exportModel(root, { format, base, clips, textureCount }) {
  let files = {};
  if (format === 'glb' || format === 'gltf') {
    const out = await new GLTFExporter().parseAsync(root, {
      binary: format === 'glb',
      animations: clips,
      onlyVisible: true,
      embedImages: true,
      maxTextureSize: CONVERT_FILES_CONFIG.maxTextureSize,
    });
    files[`${base}.${format}`] = format === 'glb' ? new Uint8Array(out) : strToU8(JSON.stringify(out));
  } else if (format === 'obj') {
    files = await exportObj(root, base);
  } else if (format === 'stl') {
    const dv = new STLExporter().parse(root, { binary: true });
    files[`${base}.stl`] = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  } else if (format === 'ply') {
    const buf = await new Promise((resolve) => new PLYExporter().parse(root, resolve, { binary: true }));
    files[`${base}.ply`] = new Uint8Array(buf);
  } else if (format === 'usdz') {
    const out = await new USDZExporter().parseAsync(root, { quickLookCompatible: true });
    files[`${base}.usdz`] = new Uint8Array(out);
  } else {
    throw new Error(`Unknown format "${format}"`);
  }

  const lost = [];
  if (['stl', 'ply', 'obj', 'usdz'].includes(format) && clips.length) lost.push('animations');
  if (format === 'stl' && textureCount) lost.push('textures and colours');
  if (format === 'ply' && textureCount) lost.push('textures');

  const zip = zipSync(files, { level: 6 });
  return { blob: new Blob([zip], { type: 'application/zip' }), filename: `${base}-${format}.zip`, lost };
}
