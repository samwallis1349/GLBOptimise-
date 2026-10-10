import { Document, Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { pngBytes } from './apiFixtures.mjs';

/**
 * Representative assets for the Asset Pipeline tests, built in memory so the
 * repo needs no binary fixtures: static textured props, multi-material
 * models, large and transparent textures, a skinned animated character,
 * morph targets, broken glTF references and malformed files.
 */

export async function pipelineIO() {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

function sphereData(segments, radius = 1) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let y = 0; y <= segments; y += 1) {
    for (let x = 0; x <= segments; x += 1) {
      const u = x / segments;
      const v = y / segments;
      const theta = u * Math.PI * 2;
      const phi = v * Math.PI;
      const p = [Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi)];
      positions.push(p[0] * radius, p[1] * radius, p[2] * radius);
      normals.push(...p);
      uvs.push(u, v);
    }
  }
  for (let y = 0; y < segments; y += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = y * (segments + 1) + x;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

function primitive(doc, buffer, data, material) {
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', data.positions))
    .setAttribute('NORMAL', acc('VEC3', data.normals))
    .setAttribute('TEXCOORD_0', acc('VEC2', data.uvs))
    .setIndices(acc('SCALAR', data.indices))
    .setMaterial(material);
}

const tex = (doc, name, w, h, opts) => doc.createTexture(name).setImage(pngBytes(w, h, opts)).setMimeType('image/png').setURI(`${name}.png`);

/** One textured sphere: base colour + normal + metallic-roughness. */
export async function staticTextured(io, { segments = 64, size = 1024 } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mat = doc
    .createMaterial('Painted')
    .setBaseColorTexture(tex(doc, 'albedo', size, size))
    .setNormalTexture(tex(doc, 'normal', size, size))
    .setMetallicRoughnessTexture(tex(doc, 'orm', size, size));
  const mesh = doc.createMesh('Ball').addPrimitive(primitive(doc, buffer, sphereData(segments), mat));
  doc.createScene('Scene').addChild(doc.createNode('Ball').setMesh(mesh));
  return io.writeBinary(doc);
}

/** Three meshes, three materials, one shared texture. */
export async function multiMaterial(io) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const shared = tex(doc, 'shared', 256, 256);
  const scene = doc.createScene('Scene');
  ['Red', 'Green', 'Blue'].forEach((name, i) => {
    const mat = doc.createMaterial(name).setBaseColorFactor([i === 0 ? 1 : 0.2, i === 1 ? 1 : 0.2, i === 2 ? 1 : 0.2, 1]).setBaseColorTexture(shared);
    const mesh = doc.createMesh(`Part_${name}`).addPrimitive(primitive(doc, buffer, sphereData(32), mat));
    scene.addChild(doc.createNode(`Part_${name}`).setMesh(mesh).setTranslation([i * 2.5, 0, 0]));
  });
  return io.writeBinary(doc);
}

/** Transparent leaf card: BLEND material with an alpha texture. */
export async function transparent(io) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mat = doc.createMaterial('Leaves').setAlphaMode('BLEND').setBaseColorTexture(tex(doc, 'leaves', 1024, 1024, { alpha: true }));
  const mesh = doc.createMesh('Leaves').addPrimitive(primitive(doc, buffer, sphereData(24), mat));
  doc.createScene().addChild(doc.createNode('Leaves').setMesh(mesh));
  return io.writeBinary(doc);
}

/** Skinned, animated "character": a tall capsule-ish mesh bound to a 3-bone chain with a 2 s clip. */
export async function skinnedCharacter(io) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const data = sphereData(40);
  // Stretch to 2 units tall and bind by height.
  const count = data.positions.length / 3;
  const joints = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    data.positions[i * 3 + 1] = (data.positions[i * 3 + 1] + 1) * 1; // 0..2
    const y = data.positions[i * 3 + 1];
    const bone = Math.min(2, Math.floor(y / 0.67));
    joints[i * 4] = bone;
    weights[i * 4] = 1;
  }
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const mat = doc.createMaterial('Skin').setBaseColorTexture(tex(doc, 'skin', 512, 512));
  const prim = primitive(doc, buffer, data, mat).setAttribute('JOINTS_0', acc('VEC4', joints)).setAttribute('WEIGHTS_0', acc('VEC4', weights));
  const mesh = doc.createMesh('Body').addPrimitive(prim);

  const root = doc.createNode('Hips');
  const spine = doc.createNode('Spine').setTranslation([0, 0.67, 0]);
  const head = doc.createNode('Head').setTranslation([0, 0.67, 0]);
  root.addChild(spine);
  spine.addChild(head);
  const ibm = new Float32Array(16 * 3);
  [0, 0.67, 1.34].forEach((y, i) => {
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -y, 0, 1], i * 16);
  });
  const skin = doc.createSkin('Rig').addJoint(root).addJoint(spine).addJoint(head).setInverseBindMatrices(acc('MAT4', ibm)).setSkeleton(root);
  const body = doc.createNode('Body').setMesh(mesh).setSkin(skin);
  const armature = doc.createNode('Armature');
  armature.addChild(root);
  armature.addChild(body);
  doc.createScene().addChild(armature);

  const times = acc('SCALAR', new Float32Array([0, 0.5, 1, 1.5, 2]));
  const s = Math.sin(0.4) ;
  const c = Math.cos(0.4);
  const rot = acc('VEC4', new Float32Array([0, 0, 0, 1, 0, 0, s, c, 0, 0, 0, 1, 0, 0, -s, c, 0, 0, 0, 1]));
  const anim = doc.createAnimation('Wave');
  const sampler = doc.createAnimationSampler().setInput(times).setOutput(rot).setInterpolation('LINEAR');
  anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(spine).setTargetPath('rotation').setSampler(sampler));
  // A second, perfectly linear clip: its middle keyframe is redundant.
  const t2 = acc('SCALAR', new Float32Array([0, 1, 2]));
  const tr = acc('VEC3', new Float32Array([0, 0.67, 0, 0, 0.77, 0, 0, 0.87, 0]));
  const anim2 = doc.createAnimation('Bob');
  const s2 = doc.createAnimationSampler().setInput(t2).setOutput(tr).setInterpolation('LINEAR');
  anim2.addSampler(s2).addChannel(doc.createAnimationChannel().setTargetNode(spine).setTargetPath('translation').setSampler(s2));
  return io.writeBinary(doc);
}

/** A face mesh with two morph targets (blend shapes). */
export async function morphTargets(io) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const data = sphereData(48);
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = primitive(doc, buffer, data, doc.createMaterial('Face'));
  for (const [name, axis] of [['Smile', 0], ['Blink', 1]]) {
    const delta = new Float32Array(data.positions.length);
    for (let i = axis; i < delta.length; i += 3) delta[i] = 0.05;
    prim.addTarget(doc.createPrimitiveTarget(name).setAttribute('POSITION', acc('VEC3', delta)));
  }
  const mesh = doc.createMesh('Face').addPrimitive(prim).setWeights([0, 0]);
  doc.createScene().addChild(doc.createNode('Face').setMesh(mesh));
  return io.writeBinary(doc);
}

/** .gltf JSON + .bin + one present and one missing image, as separate files. */
export async function separateGltf(io, { dropBin = false } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer('geometry');
  const mat = doc.createMaterial('Mat').setBaseColorTexture(tex(doc, 'present', 128, 128)).setNormalTexture(tex(doc, 'missing', 128, 128));
  const mesh = doc.createMesh('Box').addPrimitive(primitive(doc, buffer, sphereData(12), mat));
  doc.createScene().addChild(doc.createNode('Box').setMesh(mesh));
  const { json, resources } = await io.writeJSON(doc, { basename: 'model' });
  const files = [{ path: 'kit/model.gltf', data: new TextEncoder().encode(JSON.stringify(json)) }];
  for (const [uri, data] of Object.entries(resources)) {
    if (uri === 'missing.png') continue;
    if (dropBin && uri.endsWith('.bin')) continue;
    files.push({ path: `kit/${uri}`, data });
  }
  return files;
}

export const entry = (path, data) => ({ path, size: data.byteLength, read: async () => data });
