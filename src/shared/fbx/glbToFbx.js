import { writeFbx } from './writeFbx.js';

/**
 * glTF (a glTF-Transform Document) to binary FBX. Primitives become per-face
 * material slots, and PNG/JPEG base colour and normal textures are embedded.
 * FBX apps can't read WebP, so WebP textures are re-encoded as PNG by
 * `toPng` (the browser default draws them through a canvas); KTX2 ones are
 * left out.
 *
 * Two layouts:
 *  - static (no skins, no animation): each mesh's world transform is baked
 *    into its vertices, one Model per mesh at the root;
 *  - rigged or animated: the node tree is kept (bones become LimbNodes),
 *    skinned meshes get Skin/Cluster deformers and a bind pose, and every
 *    animation becomes an FBX take, resampled at 30 fps. Morph targets are
 *    not written.
 *
 * @param {import('@gltf-transform/core').Document} doc
 * @param {{ creator?: string, toPng?: (bytes: Uint8Array, mime: string) => Promise<Uint8Array|null> }} [options]
 * @returns {Promise<{ bytes: Uint8Array, notes: string[], stats: { meshes: number, triangles: number, materials: number, textures: number, bones: number, animations: number } }>}
 */
export async function documentToFbx(doc, { creator = 'Asset Bench (assetbench.co.uk)', toPng = canvasPng } = {}) {
  const root = doc.getRoot();
  const notes = new Set();
  const materials = [];
  const materialIndex = new Map();
  const textures = [];
  const textureIndex = new Map();
  const usedNames = new Set();
  const unique = (base, fallback = 'Mesh') => {
    const clean = String(base || fallback).replace(/[\u0000-\u001f]/g, '').slice(0, 60) || fallback;
    let name = clean;
    for (let i = 2; usedNames.has(name); i++) name = `${clean}_${i}`;
    usedNames.add(name);
    return name;
  };

  // PNG/JPEG go in as they are; WebP is re-encoded to PNG first (done up front, as it's async).
  const pngOf = new Map();
  for (const texture of root.listTextures()) {
    if (texture.getMimeType() !== 'image/webp' || !texture.getImage()) continue;
    try {
      const png = await toPng(texture.getImage(), 'image/webp');
      if (png) pngOf.set(texture, png);
    } catch {
      /* left out, with a note */
    }
  }

  const textureFor = (texture) => {
    if (!texture) return null;
    if (textureIndex.has(texture)) return textureIndex.get(texture);
    const converted = pngOf.get(texture);
    const mime = converted ? 'image/png' : texture.getMimeType();
    const image = converted || texture.getImage();
    if (converted) notes.add('WebP textures were converted to PNG, which FBX apps can read.');
    if (!image || !/image\/(png|jpeg)/.test(mime)) {
      notes.add(`${mime || 'Unknown'} textures can't go in an FBX, so they were left out. Convert them to PNG or JPEG first (Compress Textures can).`);
      textureIndex.set(texture, null);
      return null;
    }
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const name = (texture.getName() || texture.getURI()?.split(/[\\/]/).pop()?.replace(/\.\w+$/, '') || `texture_${textures.length}`).replace(/[^\w.-]+/g, '_');
    let fileName = `${name}.${ext}`;
    for (let i = 2; textures.some((t) => t.fileName === fileName); i++) fileName = `${name}_${i}.${ext}`;
    textures.push({ name, fileName, bytes: image });
    textureIndex.set(texture, textures.length - 1);
    return textures.length - 1;
  };

  const materialFor = (material) => {
    const key = material || 'default';
    if (materialIndex.has(key)) return materialIndex.get(key);
    const base = material?.getBaseColorFactor() ?? [0.8, 0.8, 0.8, 1];
    const blended = material && material.getAlphaMode() !== 'OPAQUE';
    materials.push({
      name: material?.getName() || `Material_${materials.length}`,
      color: base.slice(0, 3),
      opacity: blended ? base[3] : 1,
      emissive: material?.getEmissiveFactor() ?? [0, 0, 0],
      diffuseTexture: textureFor(material?.getBaseColorTexture()),
      normalTexture: textureFor(material?.getNormalTexture()),
    });
    materialIndex.set(key, materials.length - 1);
    return materials.length - 1;
  };

  /**
   * One FBX mesh from a glTF mesh; `world` (column-major) is baked in when
   * given. Also returns the skin influences per vertex when asked.
   */
  const buildMesh = (gltfMesh, name, world = null, withSkin = false) => {
    if (gltfMesh.listPrimitives().some((p) => p.listTargets().length)) notes.add('Morph targets (blend shapes) aren’t in the FBX yet.');
    const normalMatrix = world && normalMatrixOf(world);
    const flip = world && det3(world) < 0;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const materialIndices = [];
    const slots = [];
    const influences = []; // per vertex: [[joint, weight], ...]
    let hasNormals = true;
    let hasUvs = true;
    for (const prim of gltfMesh.listPrimitives()) {
      if (prim.getMode() !== 4) { notes.add('Lines and points were skipped: FBX meshes here are triangles only.'); continue; }
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const nor = prim.getAttribute('NORMAL');
      const uv = prim.getAttribute('TEXCOORD_0');
      hasNormals &&= Boolean(nor);
      hasUvs &&= Boolean(uv);
      const offset = positions.length / 3;
      const v = [0, 0, 0, 0];
      const w = [0, 0, 0, 0];
      const jointSets = withSkin ? [0, 1].map((k) => [prim.getAttribute(`JOINTS_${k}`), prim.getAttribute(`WEIGHTS_${k}`)]).filter(([j, wt]) => j && wt) : [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        positions.push(...(world ? apply(world, v) : v.slice(0, 3)));
        if (nor) { nor.getElement(i, v); normals.push(...normalize(world ? apply3(normalMatrix, v) : v.slice(0, 3))); } else normals.push(0, 1, 0);
        if (uv) { uv.getElement(i, v); uvs.push(v[0], v[1]); } else uvs.push(0, 0);
        if (withSkin) {
          const list = [];
          for (const [joints, weights] of jointSets) {
            joints.getElement(i, v); weights.getElement(i, w);
            for (let k = 0; k < 4; k++) if (w[k] > 0) list.push([v[k], w[k]]);
          }
          influences.push(list);
        }
      }
      const idx = prim.getIndices();
      const list = idx ? Array.from(idx.getArray()) : Array.from({ length: pos.getCount() }, (_, i) => i);
      const material = materialFor(prim.getMaterial());
      let slot = slots.indexOf(material);
      if (slot === -1) { slots.push(material); slot = slots.length - 1; }
      for (let t = 0; t + 2 < list.length; t += 3) {
        const [a, b, c] = [list[t], list[t + 1], list[t + 2]].map((k) => k + offset);
        indices.push(...(flip ? [a, c, b] : [a, b, c]));
        materialIndices.push(slot);
      }
    }
    if (!indices.length) return null;
    return {
      mesh: {
        name,
        positions: Float64Array.from(positions),
        normals: hasNormals ? Float64Array.from(normals) : null,
        uvs: hasUvs ? Float64Array.from(uvs) : null,
        indices: Uint32Array.from(indices),
        materialIndices: Int32Array.from(materialIndices),
        materials: slots,
      },
      influences,
    };
  };

  const meshes = [];
  const scenes = root.listScenes();
  const rigged = root.listSkins().length > 0 || root.listAnimations().length > 0;
  let result;

  if (!rigged) {
    for (const scene of scenes) {
      scene.traverse((n) => {
        const mesh = n.getMesh();
        if (!mesh) return;
        const built = buildMesh(mesh, unique(n.getName() || mesh.getName()), n.getWorldMatrix());
        if (built) meshes.push(built.mesh);
      });
    }
    if (!meshes.length) throw new Error('No triangle meshes to write to FBX.');
    result = { meshes };
  } else {
    // Keep the node tree. Bones (skin joints) are LimbNodes; skinned meshes sit at the root
    // with an identity transform, as glTF ignores a skinned mesh's own node transform.
    const joints = new Set(root.listSkins().flatMap((s) => s.listJoints()));
    const models = [];
    const modelOf = new Map();
    const skins = [];
    const bindPose = [];
    const visit = (n, parent) => {
      const skinned = n.getMesh() && n.getSkin();
      const index = models.length;
      const kind = joints.has(n) ? 'LimbNode' : n.getMesh() && !skinned ? 'Mesh' : 'Null';
      models.push({
        name: unique(n.getName(), kind === 'LimbNode' ? 'Bone' : 'Node'),
        kind,
        parent: skinned ? -1 : parent,
        translation: skinned ? [0, 0, 0] : n.getTranslation(),
        rotation: skinned ? [0, 0, 0] : quatToFbxEuler(n.getRotation()),
        scaling: skinned ? [1, 1, 1] : n.getScale(),
        node: n,
      });
      modelOf.set(n, index);
      if (n.getMesh()) {
        const built = buildMesh(n.getMesh(), models[index].name, null, Boolean(skinned));
        if (built) {
          meshes.push(built.mesh);
          if (!skinned) models[index].mesh = meshes.length - 1;
          else if (!n.listChildren().length) {
            // A skinned mesh is a Mesh Model at the root (models[index] was placed there already).
            models[index].kind = 'Mesh';
            models[index].mesh = meshes.length - 1;
            pendingSkins.push({ node: n, mesh: meshes.length - 1, meshModel: index, influences: built.influences });
          } else {
            // Rare: a skinned mesh node with children. The mesh gets its own root Model and the
            // node stays a Null so its children keep their place.
            const meshModel = models.length;
            models.push({ name: unique(`${models[index].name}_Mesh`), kind: 'Mesh', parent: -1, mesh: meshes.length - 1 });
            models[index].parent = parent;
            models[index].translation = n.getTranslation();
            models[index].rotation = quatToFbxEuler(n.getRotation());
            models[index].scaling = n.getScale();
            pendingSkins.push({ node: n, mesh: meshes.length - 1, meshModel, influences: built.influences });
          }
        }
      }
      for (const child of n.listChildren()) visit(child, index);
    };
    const pendingSkins = [];
    for (const scene of scenes) for (const child of scene.listChildren()) visit(child, -1);
    collapseEmptyChains(models, modelOf, pendingSkins, new Set(root.listAnimations().flatMap((a) => a.listChannels().map((c) => c.getTargetNode()))));

    for (const { node: n, mesh, meshModel, influences } of pendingSkins) {
      const skin = n.getSkin();
      const jointNodes = skin.listJoints();
      const ibm = skin.getInverseBindMatrices();
      // glTF skins vertices from the mesh's own space: world = jointWorld × inverseBind × v.
      // The mesh's bind matrix (jointWorld × inverseBind, for any joint) is baked into the
      // vertices, so the mesh sits in world space. Then, as Blender writes clusters,
      // TransformLink is the bone's bind-time world matrix and Transform its inverse
      // (bone world⁻¹ × mesh world, with the mesh world now the identity).
      const inverseBinds = jointNodes.map((joint, j) => (ibm ? ibm.getElement(j, new Array(16).fill(0)) : invert(joint.getWorldMatrix())));
      const meshBind = jointNodes.length ? multiply(jointNodes[0].getWorldMatrix(), inverseBinds[0]) : IDENTITY;
      bakeInto(meshes[mesh], meshBind);
      const clusters = jointNodes.map((joint, j) => ({
        bone: modelOf.get(joint), indexes: [], weights: [], transformLink: multiply(meshBind, invert(inverseBinds[j])),
      }));
      for (const c of clusters) c.transform = invert(c.transformLink);
      influences.forEach((list, vertex) => {
        for (const [j, w] of list) if (clusters[j]) { clusters[j].indexes.push(vertex); clusters[j].weights.push(w); }
      });
      skins.push({ mesh, clusters: clusters.filter((c) => c.indexes.length && c.bone != null) });
      bindPose.push({ model: meshModel, matrix: IDENTITY });
      for (const c of clusters) if (c.bone != null && !bindPose.some((p) => p.model === c.bone)) bindPose.push({ model: c.bone, matrix: c.transformLink });
      // The bones' non-bone ancestors (e.g. the armature) too, at their bind-time world matrix.
      for (const joint of jointNodes) {
        for (let up = joint.getParentNode(); up; up = up.getParentNode()) {
          const model = modelOf.get(up);
          if (model == null || bindPose.some((p) => p.model === model)) continue;
          bindPose.push({ model, matrix: up.getWorldMatrix() });
        }
      }
    }

    let animations = root.listAnimations().map((anim, a) => sampleAnimation(anim, a, modelOf, notes)).filter(Boolean);
    // One frame rate per file: clips on different rates are all resampled at 30 fps.
    if (new Set(animations.map((a) => a.fps)).size > 1) animations = root.listAnimations().map((anim, a) => sampleAnimation(anim, a, modelOf, new Set(), 30)).filter(Boolean);
    if (!meshes.length) throw new Error('No triangle meshes to write to FBX.');
    result = { meshes, models, skins, bindPose, animations };
  }

  const bytes = writeFbx({ ...result, materials, textures, creator });
  const triangles = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  return {
    bytes,
    notes: [...notes],
    stats: {
      meshes: meshes.length,
      triangles,
      materials: materials.length,
      textures: textures.length,
      bones: result.models ? result.models.filter((m) => m.kind === 'LimbNode').length : 0,
      animations: result.animations?.length ?? 0,
    },
  };
}

/**
 * Merges chains of empty, unanimated nodes (a Null whose only child is
 * another Null) into the child, keeping its world transform. A unit-fixing
 * scale on one node undone by the next (0.01 then 100, as three.js writes
 * FBX imports) otherwise lands Blender's armature under a scaled empty, and
 * Blender scales the skinned mesh by it.
 */
function collapseEmptyChains(models, modelOf, pendingSkins, animatedNodes) {
  const childrenOf = (i) => models.flatMap((m, j) => (m && m.parent === i ? [j] : []));
  const isEmpty = (m) => m && m.kind === 'Null' && m.mesh == null && !animatedNodes.has(m.node);
  let changed = true;
  while (changed) {
    changed = false;
    models.forEach((m, i) => {
      if (!isEmpty(m)) return;
      const kids = childrenOf(i);
      if (kids.length !== 1 || !isEmpty(models[kids[0]])) return;
      const child = models[kids[0]];
      const parentWorld = m.parent >= 0 ? models[m.parent].node.getWorldMatrix() : IDENTITY;
      const local = decompose(multiply(invert(parentWorld), child.node.getWorldMatrix()));
      Object.assign(child, { parent: m.parent, translation: local.translation, rotation: quatToFbxEuler(local.rotation), scaling: local.scale });
      models[i] = null;
      changed = true;
    });
  }
  // Compact, renumbering parents, the node map and skinned-mesh model indexes.
  const renumber = new Map();
  const kept = models.filter((m, i) => m && renumber.set(i, renumber.size));
  for (const m of kept) m.parent = m.parent >= 0 ? renumber.get(m.parent) : -1;
  for (const [n, i] of modelOf) renumber.has(i) ? modelOf.set(n, renumber.get(i)) : modelOf.delete(n);
  for (const s of pendingSkins) s.meshModel = renumber.get(s.meshModel);
  models.length = 0;
  models.push(...kept);
}

// ------------------------------------------------------------- animation
// Frame rates a clip may already sit on; Unreal refuses a take whose start or end falls between frames.
const RATES = [30, 24, 25, 60, 50, 48, 120];
const onFrame = (seconds, fps) => Math.abs(seconds * fps - Math.round(seconds * fps)) < 1e-3;

/**
 * One glTF animation as FBX curves, every channel resampled once per frame.
 * The frame rate is the first of RATES the clip's first and last keys both
 * land on (a Blender clip at 24 fps stays at 24); failing that, 30 fps with
 * the range widened to whole frames, holding the first and last poses.
 */
function sampleAnimation(anim, index, modelOf, notes, forceFps = null) {
  const curves = [];
  let start = Infinity;
  let duration = 0;
  for (const channel of anim.listChannels()) {
    const target = channel.getTargetNode();
    const path = channel.getTargetPath();
    const sampler = channel.getSampler();
    if (!target || !modelOf.has(target)) continue;
    if (path === 'weights') { notes.add('Morph target animation isn’t in the FBX yet.'); continue; }
    const input = sampler.getInput().getArray();
    start = Math.min(start, input[0] || 0);
    duration = Math.max(duration, input[input.length - 1] || 0);
  }
  if (!Number.isFinite(start)) start = 0;
  // Keys run from the clip's own first key (not 0) to its last, so the take keeps its timing.
  let fps = forceFps ? null : RATES.find((r) => onFrame(start, r) && onFrame(duration, r));
  if (!fps) {
    fps = 30;
    start = Math.floor(start * fps + 1e-6) / fps;
    duration = Math.ceil(duration * fps - 1e-6) / fps;
  }
  start = Math.round(start * fps) / fps;
  duration = Math.max(start + 1 / fps, Math.round(duration * fps) / fps);
  const frames = Math.round((duration - start) * fps);
  const times = Float64Array.from({ length: frames + 1 }, (_, f) => start + f / fps);

  for (const channel of anim.listChannels()) {
    const target = channel.getTargetNode();
    const path = channel.getTargetPath();
    if (!target || !modelOf.has(target) || path === 'weights') continue;
    const sampler = channel.getSampler();
    const input = sampler.getInput().getArray();
    const output = sampler.getOutput();
    const size = path === 'rotation' ? 4 : 3;
    const cubic = sampler.getInterpolation() === 'CUBICSPLINE';
    const value = (k) => output.getElement(cubic ? k * 3 + 1 : k, new Array(size).fill(0));
    const x = new Float32Array(times.length);
    const y = new Float32Array(times.length);
    const z = new Float32Array(times.length);
    let previous = null;
    times.forEach((t, f) => {
      let v;
      if (t <= input[0]) v = value(0);
      else if (t >= input[input.length - 1]) v = value(input.length - 1);
      else {
        let k = 0;
        while (input[k + 1] < t) k++;
        const s = sampler.getInterpolation() === 'STEP' ? 0 : (t - input[k]) / (input[k + 1] - input[k]);
        v = size === 4 ? slerp(value(k), value(k + 1), s) : value(k).map((a, i) => a + (value(k + 1)[i] - a) * s);
      }
      if (size === 4) {
        v = quatToFbxEuler(v);
        if (previous) v = v.map((angle, i) => angle + 360 * Math.round((previous[i] - angle) / 360)); // no ±180° flips between keys
        previous = v;
      }
      x[f] = v[0]; y[f] = v[1]; z[f] = v[2];
    });
    curves.push({ model: modelOf.get(target), channel: { translation: 'T', rotation: 'R', scale: 'S' }[path], times, x, y, z });
  }
  if (!curves.length) return null;
  return { name: anim.getName() || `Take_${index + 1}`, start, duration, fps, curves };
}

function slerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (dot < 0) { b = b.map((v) => -v); dot = -dot; }
  if (dot > 0.9995) return normalize4(a.map((v, i) => v + (b[i] - v) * t));
  const theta = Math.acos(dot);
  const sa = Math.sin((1 - t) * theta) / Math.sin(theta);
  const sb = Math.sin(t * theta) / Math.sin(theta);
  return a.map((v, i) => v * sa + b[i] * sb);
}
const normalize4 = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };

/**
 * glTF quaternion [x,y,z,w] to FBX Lcl Rotation in degrees. FBX's default
 * XYZ order applies X, then Y, then Z, i.e. R = Rz · Ry · Rx.
 */
export function quatToFbxEuler([x, y, z, w]) {
  const m00 = 1 - 2 * (y * y + z * z);
  const m10 = 2 * (x * y + z * w);
  const m20 = 2 * (x * z - y * w);
  const m21 = 2 * (y * z + x * w);
  const m22 = 1 - 2 * (x * x + y * y);
  const m11 = 1 - 2 * (x * x + z * z);
  const m12 = 2 * (y * z - x * w);
  const deg = 180 / Math.PI;
  const sy = Math.max(-1, Math.min(1, -m20));
  if (Math.abs(sy) < 0.999999) return [Math.atan2(m21, m22) * deg, Math.asin(sy) * deg, Math.atan2(m10, m00) * deg];
  return [Math.atan2(-m12, m11) * deg, Math.asin(sy) * deg, 0];
}

/** Browser default for toPng: decode, draw to a canvas, encode as PNG. */
async function canvasPng(bytes, mime) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null;
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

// ------------------------------------------------------------- matrices (column-major, as glTF)
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const apply3 = (m, [x, y, z]) => [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];
const normalize = ([x, y, z]) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
/** Inverse transpose of the upper 3x3, column-major. */
function normalMatrixOf(m) {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g;
  const det = a * A + b * B + c * Cc || 1;
  // cofactor matrix / det == inverse transpose
  return [A / det, B / det, Cc / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
}
/** Column-major 4x4 to translation, quaternion and scale (no shear). */
function decompose(m) {
  let sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  if (det3(m) < 0) sx = -sx;
  const r = [m[0] / sx, m[1] / sx, m[2] / sx, m[4] / sy, m[5] / sy, m[6] / sy, m[8] / sz, m[9] / sz, m[10] / sz];
  const [m11, m21, m31, m12, m22, m32, m13, m23, m33] = r;
  const trace = m11 + m22 + m33;
  let q;
  if (trace > 0) { const k = 0.5 / Math.sqrt(trace + 1); q = [(m32 - m23) * k, (m13 - m31) * k, (m21 - m12) * k, 0.25 / k]; }
  else if (m11 > m22 && m11 > m33) { const k = 2 * Math.sqrt(1 + m11 - m22 - m33); q = [0.25 * k, (m12 + m21) / k, (m13 + m31) / k, (m32 - m23) / k]; }
  else if (m22 > m33) { const k = 2 * Math.sqrt(1 + m22 - m11 - m33); q = [(m12 + m21) / k, 0.25 * k, (m23 + m32) / k, (m13 - m31) / k]; }
  else { const k = 2 * Math.sqrt(1 + m33 - m11 - m22); q = [(m13 + m31) / k, (m23 + m32) / k, 0.25 * k, (m21 - m12) / k]; }
  return { translation: [m[12], m[13], m[14]], rotation: q, scale: [sx, sy, sz] };
}
/** a × b, column-major 4x4. */
function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}
/** Transforms a built mesh's positions and normals by `m` in place (flipping winding if mirrored). */
function bakeInto(mesh, m) {
  if (m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9)) return;
  const n3 = normalMatrixOf(m);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = apply(m, [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
    mesh.positions[i] = p[0]; mesh.positions[i + 1] = p[1]; mesh.positions[i + 2] = p[2];
    if (mesh.normals) {
      const n = normalize(apply3(n3, [mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]]));
      mesh.normals[i] = n[0]; mesh.normals[i + 1] = n[1]; mesh.normals[i + 2] = n[2];
    }
  }
  if (det3(m) < 0) for (let t = 0; t < mesh.indices.length; t += 3) [mesh.indices[t + 1], mesh.indices[t + 2]] = [mesh.indices[t + 2], mesh.indices[t + 1]];
}
/** General 4x4 inverse, column-major. */
function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06 || 1;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) / det, (a02 * b10 - a01 * b11 - a03 * b09) / det, (a31 * b05 - a32 * b04 + a33 * b03) / det, (a22 * b04 - a21 * b05 - a23 * b03) / det,
    (a12 * b08 - a10 * b11 - a13 * b07) / det, (a00 * b11 - a02 * b08 + a03 * b07) / det, (a32 * b02 - a30 * b05 - a33 * b01) / det, (a20 * b05 - a22 * b02 + a23 * b01) / det,
    (a10 * b10 - a11 * b08 + a13 * b06) / det, (a01 * b08 - a00 * b10 - a03 * b06) / det, (a30 * b04 - a31 * b02 + a33 * b00) / det, (a21 * b02 - a20 * b04 - a23 * b00) / det,
    (a11 * b07 - a10 * b09 - a12 * b06) / det, (a00 * b09 - a01 * b07 + a02 * b06) / det, (a31 * b01 - a30 * b03 - a32 * b00) / det, (a20 * b03 - a21 * b01 + a22 * b00) / det,
  ];
}
