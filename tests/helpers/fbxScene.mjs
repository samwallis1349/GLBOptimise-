import { Document } from '@gltf-transform/core';

/**
 * A scene that exercises the FBX writer: a parent node (rotated 90° about Y,
 * scaled 2x) holding a two-material box (red top half, blue bottom half) at
 * x = +1, plus a mirrored copy (scale x = -1) at the root. Returns the Document.
 */
export function fbxTestScene() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const red = doc.createMaterial('Red').setBaseColorFactor([1, 0, 0, 1]);
  const blue = doc.createMaterial('Blue').setBaseColorFactor([0, 0, 1, 1]);
  // a unit quad pair: top quad (y = 0.5) and bottom quad (y = -0.5), 2 triangles each
  const quad = (y) => new Float32Array([-0.5, y, -0.5, 0.5, y, -0.5, 0.5, y, 0.5, -0.5, y, 0.5]);
  const prim = (y, material) => doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(quad(y)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array([0, 2, 1, 0, 3, 2])).setBuffer(buffer))
    .setMaterial(material);
  const mesh = doc.createMesh('Box').addPrimitive(prim(0.5, red)).addPrimitive(prim(-0.5, blue));
  const child = doc.createNode('Child').setMesh(mesh).setTranslation([1, 0, 0]);
  const parent = doc.createNode('Parent').setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]).setScale([2, 2, 2]).addChild(child);
  const mirror = doc.createNode('Mirror').setMesh(mesh).setScale([-1, 1, 1]).setTranslation([0, 3, 0]);
  doc.createScene('Scene').addChild(parent).addChild(mirror);
  return doc;
}
