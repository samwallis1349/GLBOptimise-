/**
 * A small binary FBX 7.4 writer: meshes (normals, one UV set, per-face
 * materials), textures embedded in the file, and optionally a node
 * hierarchy with skeletons, skin weights, a bind pose and animation. Same
 * layout and header constants as Blender's exporter, which Blender, Unity
 * and Unreal all import.
 *
 * Input is plain data (see glbToFbx.js for the glTF side), Y-up metres, so
 * it runs the same in the browser, a Worker and Node tests.
 *
 *   writeFbx({
 *     meshes: [{ name, positions (xyz), normals?, uvs? (uv, glTF v-down),
 *                indices (triangles), materialIndices? (per triangle), materials: [scene material index] }],
 *     materials: [{ name, color: [r,g,b], opacity, emissive?, diffuseTexture?, normalTexture? }],
 *     textures: [{ name, fileName: 'x.png', bytes: Uint8Array }],
 *     // Optional hierarchy; without it each mesh gets its own Model at the root.
 *     models: [{ name, kind: 'Mesh'|'LimbNode'|'Null', parent: -1|index, mesh?: index,
 *                translation: [x,y,z], rotation: [x,y,z] (degrees, FBX XYZ order), scaling: [x,y,z] }],
 *     skins: [{ mesh: index, clusters: [{ bone: model index, indexes, weights,
 *               transform: [16], transformLink: [16] }] }],          // column-major matrices
 *     bindPose: [{ model: index, matrix: [16] }],
 *     animations: [{ name, start (s), duration (s, end time), fps (all the same), curves: [{ model, channel: 'T'|'R'|'S', times (s), x, y, z }] }],
 *     creator,
 *   }) -> Uint8Array
 */

import { zlibSync } from 'three/examples/jsm/libs/fflate.module.js';

const VERSION = 7400;
// Arrays bigger than this are zlib-compressed (encoding 1), as Blender and the FBX SDK write them.
const COMPRESS_OVER = 128;
// Blender's fixed FileId / CreationTime / footer id: the FBX SDK checks they agree.
const FILE_ID = new Uint8Array([0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1]);
const TIME_ID = '1970-01-01 10:00:00:000';
const FOOT_ID = new Uint8Array([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e]);
const FOOT_MAGIC = new Uint8Array([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b]);
/** FBX time: ticks per second. */
const KTIME = 46186158000n;
const enc = new TextEncoder();

// ------------------------------------------------------------- node tree
// A node is [name, props, children]; a prop is [typeCode, value].
const I = (v) => ['I', v];
const L = (v) => ['L', v];
const D = (v) => ['D', v];
const C = (v) => ['C', v];
const S = (v) => ['S', v];
const R = (v) => ['R', v];
const di = (v) => ['d', v];
const fi = (v) => ['f', v];
const ii = (v) => ['i', v];
const li = (v) => ['l', v];
const node = (name, props = [], children = []) => [name, props, children];
/** "Name\0\x01Class", FBX's object name + class pair. */
const nc = (name, cls) => `${name}\u0000\u0001${cls}`;
const P = (...args) => node('P', args);

/** Properties70 entries: [name, type, label, flags, ...values] */
const props70 = (...entries) => node('Properties70', [], entries.map(([n, t, l, f, ...vals]) => P(S(n), S(t), S(l), S(f), ...vals)));

// ------------------------------------------------------------- encoding
class Out {
  constructor() { this.chunks = []; this.length = 0; this.patches = []; }
  bytes(b) { this.chunks.push(b); this.length += b.length; }
  u8(v) { this.bytes(Uint8Array.of(v)); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); this.bytes(b); }
  patch32(at, v) { this.patches.push([at, v]); }
  finish() {
    const all = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) { all.set(c, o); o += c.length; }
    const view = new DataView(all.buffer);
    for (const [at, v] of this.patches) view.setUint32(at, v, true);
    return all;
  }
}

const ARRAY = { d: [8, (v, o, x) => v.setFloat64(o, x, true)], f: [4, (v, o, x) => v.setFloat32(o, x, true)], i: [4, (v, o, x) => v.setInt32(o, x, true)], l: [8, (v, o, x) => v.setBigInt64(o, BigInt(x), true)] };

function encodeProp(out, [type, value]) {
  const fixed = (size, set) => { const b = new Uint8Array(1 + size); b[0] = type.charCodeAt(0); set(new DataView(b.buffer), 1); out.bytes(b); };
  switch (type) {
    case 'C': return fixed(1, (v, o) => v.setUint8(o, value ? 1 : 0));
    case 'I': return fixed(4, (v, o) => v.setInt32(o, value, true));
    case 'D': return fixed(8, (v, o) => v.setFloat64(o, value, true));
    case 'L': return fixed(8, (v, o) => v.setBigInt64(o, BigInt(value), true));
    case 'S':
    case 'R': {
      const data = type === 'S' ? enc.encode(value) : value;
      out.u8(type.charCodeAt(0)); out.u32(data.length); out.bytes(data);
      return;
    }
    case 'd':
    case 'f':
    case 'i':
    case 'l': {
      const [size, set] = ARRAY[type];
      const data = new Uint8Array(value.length * size);
      const v = new DataView(data.buffer);
      for (let k = 0; k < value.length; k++) set(v, k * size, value[k]);
      const packed = data.length > COMPRESS_OVER ? zlibSync(data, { level: 6 }) : null;
      out.u8(type.charCodeAt(0)); out.u32(value.length); out.u32(packed ? 1 : 0); out.u32((packed || data).length); out.bytes(packed || data);
      return;
    }
    default: throw new Error(`FBX: unknown property type ${type}`);
  }
}

const SENTINEL = new Uint8Array(13);

function encodeNode(out, [name, props, children], isLast) {
  const start = out.length;
  out.u32(0); // end offset, patched
  out.u32(props.length);
  out.u32(0); // property list length, patched
  const nameBytes = enc.encode(name);
  out.u8(nameBytes.length); out.bytes(nameBytes);
  const propsStart = out.length;
  for (const p of props) encodeProp(out, p);
  out.patch32(start + 8, out.length - propsStart);
  if (children.length) {
    children.forEach((child, i) => encodeNode(out, child, i === children.length - 1));
    out.bytes(SENTINEL);
  } else if (!props.length && !isLast) {
    out.bytes(SENTINEL);
  }
  out.patch32(start, out.length);
}

/**
 * Definitions › PropertyTemplate defaults the FBX SDK reads (Unity and Unreal
 * import through it). Without the AnimLayer one its Weight defaults to 0 and
 * the animation is dropped. Values as Blender writes them.
 */
const TEMPLATES = {
  AnimationStack: node('PropertyTemplate', [S('FbxAnimStack')], [props70(
    ['Description', 'KString', '', '', S('')],
    ['LocalStart', 'KTime', 'Time', '', L(0)], ['LocalStop', 'KTime', 'Time', '', L(0)],
    ['ReferenceStart', 'KTime', 'Time', '', L(0)], ['ReferenceStop', 'KTime', 'Time', '', L(0)],
  )]),
  AnimationLayer: node('PropertyTemplate', [S('FbxAnimLayer')], [props70(
    ['Weight', 'Number', '', 'A', D(100)], ['Mute', 'bool', '', '', I(0)], ['Solo', 'bool', '', '', I(0)], ['Lock', 'bool', '', '', I(0)],
    ['Color', 'ColorRGB', 'Color', '', D(0.8), D(0.8), D(0.8)], ['BlendMode', 'enum', '', '', I(0)],
    ['RotationAccumulationMode', 'enum', '', '', I(0)], ['ScaleAccumulationMode', 'enum', '', '', I(0)],
    ['BlendModeBypass', 'ULongLong', '', '', L(0)],
  )]),
  AnimationCurveNode: node('PropertyTemplate', [S('FbxAnimCurveNode')], [props70(['d', 'Compound', '', ''])]),
};

/** FBX TimeMode enum by frame rate (14 = custom, using CustomFrameRate). */
const TIME_MODE = { 120: 1, 100: 2, 60: 3, 50: 4, 48: 5, 30: 6, 25: 10, 24: 11 };

const ktime = (seconds) => BigInt(Math.round(seconds * Number(KTIME)));

// ------------------------------------------------------------- scene
export function writeFbx({ meshes, materials = [], textures = [], models, skins = [], bindPose = [], animations = [], creator = 'Asset Bench' }) {
  let nextId = 1000000;
  const uid = () => nextId++;
  const objects = [];
  const connections = [];
  const link = (child, parent, prop) => connections.push(prop ? node('C', [S('OP'), L(child), L(parent), S(prop)]) : node('C', [S('OO'), L(child), L(parent)]));

  // Without a hierarchy, every mesh is a Model of its own at the root.
  models ??= meshes.map((m, i) => ({ name: m.name, kind: 'Mesh', parent: -1, mesh: i }));

  // Textures: one Video (the embedded image) + one Texture each.
  const textureIds = textures.map((t) => {
    const video = uid();
    const texture = uid();
    objects.push(node('Video', [L(video), S(nc(t.name, 'Video')), S('Clip')], [
      node('Type', [S('Clip')]),
      props70(['Path', 'KString', 'XRefUrl', '', S(t.fileName)]),
      node('UseMipMap', [I(0)]),
      node('Filename', [S(t.fileName)]),
      node('RelativeFilename', [S(t.fileName)]),
      node('Content', [R(t.bytes)]),
    ]));
    objects.push(node('Texture', [L(texture), S(nc(t.name, 'Texture')), S('')], [
      node('Type', [S('TextureVideoClip')]),
      node('Version', [I(202)]),
      node('TextureName', [S(nc(t.name, 'Texture'))]),
      props70(['UseMaterial', 'bool', '', '', I(1)]),
      node('Media', [S(nc(t.name, 'Video'))]),
      node('FileName', [S(t.fileName)]),
      node('RelativeFilename', [S(t.fileName)]),
      node('ModelUVTranslation', [D(0), D(0)]),
      node('ModelUVScaling', [D(1), D(1)]),
      node('Texture_Alpha_Source', [S('None')]),
      node('Cropping', [I(0), I(0), I(0), I(0)]),
    ]));
    link(video, texture);
    return texture;
  });

  const materialIds = materials.map((m) => {
    const id = uid();
    const [r, g, b] = m.color ?? [0.8, 0.8, 0.8];
    const [er, eg, eb] = m.emissive ?? [0, 0, 0];
    const opacity = m.opacity ?? 1;
    objects.push(node('Material', [L(id), S(nc(m.name || 'Material', 'Material')), S('')], [
      node('Version', [I(102)]),
      node('ShadingModel', [S('Phong')]),
      node('MultiLayer', [I(0)]),
      props70(
        ['DiffuseColor', 'Color', '', 'A', D(r), D(g), D(b)],
        ['DiffuseFactor', 'Number', '', 'A', D(1)],
        ['EmissiveColor', 'Color', '', 'A', D(er), D(eg), D(eb)],
        ['EmissiveFactor', 'Number', '', 'A', D(1)],
        ['SpecularColor', 'Color', '', 'A', D(0.2), D(0.2), D(0.2)],
        ['ShininessExponent', 'Number', '', 'A', D(20)],
        ['TransparencyFactor', 'Number', '', 'A', D(1 - opacity)],
        ['Opacity', 'Number', '', 'A', D(opacity)],
      ),
    ]));
    if (m.diffuseTexture != null) link(textureIds[m.diffuseTexture], id, 'DiffuseColor');
    if (m.normalTexture != null) link(textureIds[m.normalTexture], id, 'NormalMap');
    return id;
  });

  const geometryIds = meshes.map((mesh) => {
    const geometry = uid();
    const tris = mesh.indices.length / 3;
    const polyIndex = new Int32Array(mesh.indices.length);
    for (let t = 0; t < tris; t++) {
      polyIndex[t * 3] = mesh.indices[t * 3];
      polyIndex[t * 3 + 1] = mesh.indices[t * 3 + 1];
      polyIndex[t * 3 + 2] = ~mesh.indices[t * 3 + 2]; // last corner of a polygon is stored as -(i+1)
    }
    const layers = [];
    const children = [
      node('GeometryVersion', [I(124)]),
      node('Vertices', [di(mesh.positions)]),
      node('PolygonVertexIndex', [ii(polyIndex)]),
    ];
    if (mesh.normals) {
      const n = new Float64Array(mesh.indices.length * 3);
      mesh.indices.forEach((v, k) => { n[k * 3] = mesh.normals[v * 3]; n[k * 3 + 1] = mesh.normals[v * 3 + 1]; n[k * 3 + 2] = mesh.normals[v * 3 + 2]; });
      children.push(node('LayerElementNormal', [I(0)], [
        node('Version', [I(101)]), node('Name', [S('')]),
        node('MappingInformationType', [S('ByPolygonVertex')]), node('ReferenceInformationType', [S('Direct')]),
        node('Normals', [di(n)]),
      ]));
      layers.push('LayerElementNormal');
    }
    if (mesh.uvs) {
      const uv = new Float64Array(mesh.uvs.length);
      for (let k = 0; k < mesh.uvs.length; k += 2) { uv[k] = mesh.uvs[k]; uv[k + 1] = 1 - mesh.uvs[k + 1]; } // glTF v runs down, FBX v up
      children.push(node('LayerElementUV', [I(0)], [
        node('Version', [I(101)]), node('Name', [S('UVMap')]),
        node('MappingInformationType', [S('ByPolygonVertex')]), node('ReferenceInformationType', [S('IndexToDirect')]),
        node('UV', [di(uv)]), node('UVIndex', [ii(Int32Array.from(mesh.indices))]),
      ]));
      layers.push('LayerElementUV');
    }
    const slots = mesh.materials ?? [];
    if (slots.length) {
      const perFace = slots.length > 1 && mesh.materialIndices;
      children.push(node('LayerElementMaterial', [I(0)], [
        node('Version', [I(101)]), node('Name', [S('')]),
        node('MappingInformationType', [S(perFace ? 'ByPolygon' : 'AllSame')]), node('ReferenceInformationType', [S('IndexToDirect')]),
        node('Materials', [ii(perFace ? Int32Array.from(mesh.materialIndices) : Int32Array.of(0))]),
      ]));
      layers.push('LayerElementMaterial');
    }
    children.push(node('Layer', [I(0)], [node('Version', [I(100)]), ...layers.map((type) => node('LayerElement', [], [node('Type', [S(type)]), node('TypedIndex', [I(0)])]))]));
    objects.push(node('Geometry', [L(geometry), S(nc(mesh.name, 'Geometry')), S('Mesh')], children));
    return geometry;
  });

  // Channels with curves are flagged animated ("A+"), as Blender and the FBX SDK write them.
  const animated = new Set(animations.flatMap((a) => a.curves.map((c) => `${c.model}:${c.channel}`)));
  const flag = (i, channel) => (animated.has(`${i}:${channel}`) ? 'A+' : 'A');
  const modelIds = models.map((model, i) => {
    const id = uid();
    const [tx, ty, tz] = model.translation ?? [0, 0, 0];
    const [rx, ry, rz] = model.rotation ?? [0, 0, 0];
    const [sx, sy, sz] = model.scaling ?? [1, 1, 1];
    objects.push(node('Model', [L(id), S(nc(model.name, 'Model')), S(model.kind)], [
      node('Version', [I(232)]),
      props70(
        ['Lcl Translation', 'Lcl Translation', '', flag(i, 'T'), D(tx), D(ty), D(tz)],
        ['Lcl Rotation', 'Lcl Rotation', '', flag(i, 'R'), D(rx), D(ry), D(rz)],
        ['Lcl Scaling', 'Lcl Scaling', '', flag(i, 'S'), D(sx), D(sy), D(sz)],
        ['DefaultAttributeIndex', 'int', 'Integer', '', I(0)],
        ['InheritType', 'enum', '', '', I(1)],
      ),
      node('Shading', [C(true)]),
      node('Culling', [S('CullingOff')]),
    ]));
    if (model.kind === 'LimbNode') {
      const attr = uid();
      objects.push(node('NodeAttribute', [L(attr), S(nc(model.name, 'NodeAttribute')), S('LimbNode')], [
        props70(['Size', 'double', 'Number', '', D(10)]),
        node('TypeFlags', [S('Skeleton')]),
      ]));
      link(attr, id);
    } else if (model.kind === 'Null') {
      const attr = uid();
      objects.push(node('NodeAttribute', [L(attr), S(nc(model.name, 'NodeAttribute')), S('Null')], [
        node('TypeFlags', [S('Null')]),
        props70(['Size', 'double', 'Number', '', D(10)], ['Look', 'enum', '', '', I(1)]),
      ]));
      link(attr, id);
    }
    if (model.mesh != null) {
      link(geometryIds[model.mesh], id);
      for (const slot of meshes[model.mesh].materials ?? []) link(materialIds[slot], id);
    }
    return id;
  });
  models.forEach((model, i) => link(modelIds[i], model.parent >= 0 ? modelIds[model.parent] : 0));

  // Skins: one Skin deformer per skinned geometry, one Cluster per bone.
  for (const skin of skins) {
    const skinId = uid();
    objects.push(node('Deformer', [L(skinId), S(nc(meshes[skin.mesh].name, 'Deformer')), S('Skin')], [
      node('Version', [I(101)]),
      node('Link_DeformAcuracy', [D(50)]),
    ]));
    link(skinId, geometryIds[skin.mesh]);
    for (const cluster of skin.clusters) {
      const id = uid();
      objects.push(node('Deformer', [L(id), S(nc(models[cluster.bone].name, 'SubDeformer')), S('Cluster')], [
        node('Version', [I(100)]),
        node('UserData', [S(''), S('')]),
        node('Indexes', [ii(Int32Array.from(cluster.indexes))]),
        node('Weights', [di(Float64Array.from(cluster.weights))]),
        node('Transform', [di(Float64Array.from(cluster.transform))]),
        node('TransformLink', [di(Float64Array.from(cluster.transformLink))]),
      ]));
      link(id, skinId);
      link(modelIds[cluster.bone], id);
    }
  }
  if (bindPose.length) {
    objects.push(node('Pose', [L(uid()), S(nc('BindPose', 'Pose')), S('BindPose')], [
      node('Type', [S('BindPose')]),
      node('Version', [I(100)]),
      node('NbPoseNodes', [I(bindPose.length)]),
      ...bindPose.map((p) => node('PoseNode', [], [node('Node', [L(modelIds[p.model])]), node('Matrix', [di(Float64Array.from(p.matrix))])])),
    ]));
  }

  // Animation: Stack > Layer > CurveNode (per bone channel, on Lcl T/R/S) > Curve (per axis).
  const CHANNEL = { T: 'Lcl Translation', R: 'Lcl Rotation', S: 'Lcl Scaling' };
  // Blender's key attributes (auto-tangent cubic keys); our keys are dense, so the shape holds.
  const KEY_FLAGS = Int32Array.of((1 << 2) | (1 << 8) | (1 << 13) | (1 << 14));
  const KEY_DATA = Float32Array.of(0, 0, 9.419963346924634e-30, 0);
  let longest = 0;
  // '|' separates FBX node paths, so take names lose it (glTF clips from Blender are often "Rig|Walk").
  const takeName = (name) => String(name || 'Take').replace(/[|:\x00-\x1f]+/g, '_');
  for (const anim of animations) {
    const stack = uid();
    const layer = uid();
    const begin = ktime(anim.start ?? 0);
    const stop = ktime(anim.duration);
    longest = Math.max(longest, anim.duration);
    objects.push(node('AnimationStack', [L(stack), S(nc(takeName(anim.name), 'AnimStack')), S('')], [
      props70(['LocalStart', 'KTime', 'Time', '', L(begin)], ['LocalStop', 'KTime', 'Time', '', L(stop)], ['ReferenceStart', 'KTime', 'Time', '', L(begin)], ['ReferenceStop', 'KTime', 'Time', '', L(stop)]),
    ]));
    objects.push(node('AnimationLayer', [L(layer), S(nc('BaseLayer', 'AnimLayer')), S('')], [props70(['Weight', 'Number', '', 'A', D(100)])]));
    link(layer, stack);
    for (const curve of anim.curves) {
      const curveNode = uid();
      const axes = [curve.x, curve.y, curve.z];
      objects.push(node('AnimationCurveNode', [L(curveNode), S(nc(curve.channel, 'AnimCurveNode')), S('')], [
        props70(...['X', 'Y', 'Z'].map((a, k) => [`d|${a}`, 'Number', '', 'A', D(axes[k][0])])),
      ]));
      link(curveNode, layer);
      link(curveNode, modelIds[curve.model], CHANNEL[curve.channel]);
      const times = Array.from(curve.times, ktime);
      axes.forEach((values, k) => {
        const id = uid();
        objects.push(node('AnimationCurve', [L(id), S(nc('', 'AnimCurve')), S('')], [
          node('Default', [D(values[0])]),
          node('KeyVer', [I(4008)]),
          node('KeyTime', [li(times)]),
          node('KeyValueFloat', [fi(Float32Array.from(values))]),
          node('KeyAttrFlags', [ii(KEY_FLAGS)]),
          node('KeyAttrDataFloat', [fi(KEY_DATA)]),
          node('KeyAttrRefCount', [ii(Int32Array.of(times.length))]),
        ]));
        link(id, curveNode, `d|${['X', 'Y', 'Z'][k]}`);
      });
    }
  }

  const fps = animations[0]?.fps ?? 30;
  const ORDER = ['Model', 'NodeAttribute', 'Geometry', 'Material', 'Texture', 'Video', 'Deformer', 'Pose', 'AnimationStack', 'AnimationLayer', 'AnimationCurveNode', 'AnimationCurve'];
  const count = (type) => objects.filter(([n]) => n === type).length;
  const defs = ORDER.filter(count);
  const now = { Year: 1970, Month: 1, Day: 1, Hour: 10, Minute: 0, Second: 0, Millisecond: 0 };

  const root = [
    node('FBXHeaderExtension', [], [
      node('FBXHeaderVersion', [I(1003)]),
      node('FBXVersion', [I(VERSION)]),
      node('EncryptionType', [I(0)]),
      node('CreationTimeStamp', [], [node('Version', [I(1000)]), ...Object.entries(now).map(([k, v]) => node(k, [I(v)]))]),
      node('Creator', [S(creator)]),
    ]),
    node('FileId', [R(FILE_ID)]),
    node('CreationTime', [S(TIME_ID)]),
    node('Creator', [S(creator)]),
    node('GlobalSettings', [], [
      node('Version', [I(1000)]),
      // Y up, +Z front, +X right, metres (100 cm per unit): the same frame as glTF. 30 fps timeline.
      props70(
        ['UpAxis', 'int', 'Integer', '', I(1)], ['UpAxisSign', 'int', 'Integer', '', I(1)],
        ['FrontAxis', 'int', 'Integer', '', I(2)], ['FrontAxisSign', 'int', 'Integer', '', I(1)],
        ['CoordAxis', 'int', 'Integer', '', I(0)], ['CoordAxisSign', 'int', 'Integer', '', I(1)],
        ['OriginalUpAxis', 'int', 'Integer', '', I(1)], ['OriginalUpAxisSign', 'int', 'Integer', '', I(1)],
        ['UnitScaleFactor', 'double', 'Number', '', D(100)], ['OriginalUnitScaleFactor', 'double', 'Number', '', D(100)],
        ['TimeMode', 'enum', '', '', I(TIME_MODE[fps] ?? 14)],
        ['TimeSpanStart', 'KTime', 'Time', '', L(0)], ['TimeSpanStop', 'KTime', 'Time', '', L(ktime(longest || 1))],
        ['CustomFrameRate', 'double', 'Number', '', D(fps)],
      ),
    ]),
    node('Documents', [], [node('Count', [I(1)]), node('Document', [L(uid()), S('Scene'), S('Scene')], [
      props70(['SourceObject', 'object', '', ''], ['ActiveAnimStackName', 'KString', '', '', S(animations[0] ? takeName(animations[0].name) : '')]),
      node('RootNode', [L(0)]),
    ])]),
    node('References'),
    node('Definitions', [], [
      node('Version', [I(100)]),
      node('Count', [I(defs.length + 1)]),
      node('ObjectType', [S('GlobalSettings')], [node('Count', [I(1)])]),
      ...defs.map((type) => node('ObjectType', [S(type)], [node('Count', [I(count(type))]), ...(TEMPLATES[type] ? [TEMPLATES[type]] : [])])),
    ]),
    node('Objects', [], objects),
    node('Connections', [], connections),
    node('Takes', [], [
      node('Current', [S('')]),
      ...animations.map((a) => node('Take', [S(takeName(a.name))], [
        node('FileName', [S(`${takeName(a.name).replace(/[^\w-]+/g, '_')}.tak`)]),
        node('LocalTime', [L(ktime(a.start ?? 0)), L(ktime(a.duration))]),
        node('ReferenceTime', [L(ktime(a.start ?? 0)), L(ktime(a.duration))]),
      ])),
    ]),
  ];

  const out = new Out();
  const head = new Uint8Array(27);
  head.set(enc.encode('Kaydara FBX Binary  '), 0);
  head[20] = 0x00; head[21] = 0x1a; head[22] = 0x00;
  new DataView(head.buffer).setUint32(23, VERSION, true);
  out.bytes(head);
  root.forEach((n, i) => encodeNode(out, n, i === root.length - 1));
  out.bytes(SENTINEL);
  // Footer, as Blender writes it.
  out.bytes(FOOT_ID);
  out.bytes(new Uint8Array(4));
  const pad = ((out.length + 15) & ~15) - out.length;
  out.bytes(new Uint8Array(pad || 16));
  out.u32(VERSION);
  out.bytes(new Uint8Array(120));
  out.bytes(FOOT_MAGIC);
  return out.finish();
}
