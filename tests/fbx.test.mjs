import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Box3 } from 'three';
import { documentToFbx } from '../src/shared/fbx/glbToFbx.js';
import { fbxMetresPerUnit } from '../src/shared/fbx/fbxUnits.js';
import { fbxTestScene } from './helpers/fbxScene.mjs';

const parse = (bytes) => new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

test('FBX export: binary 7.4 that three.js reads back with the same meshes, materials and placement', async () => {
  const { bytes, stats, notes } = await documentToFbx(fbxTestScene());
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 18)), 'Kaydara FBX Binary');
  assert.deepEqual(stats, { meshes: 2, triangles: 8, materials: 2, textures: 0, bones: 0, animations: 0 });
  assert.deepEqual(notes, []);

  const model = parse(bytes);
  const meshes = [];
  model.traverse((o) => o.isMesh && meshes.push(o));
  assert.equal(meshes.length, 2);
  for (const mesh of meshes) {
    assert.equal(mesh.geometry.getAttribute('position').count, 12, `${mesh.name}: 4 triangles`);
    assert.deepEqual([mesh.material].flat().map((m) => m.name).sort(), ['Blue', 'Red']);
  }
  // Child: parent rotated 90° about Y and scaled 2x, child at x = +1 → centred on z = -2, 2 m tall.
  const child = new Box3().setFromObject(meshes.find((m) => m.name === 'Child'));
  assert.ok(Math.abs(child.min.y + 1) < 1e-4 && Math.abs(child.max.y - 1) < 1e-4);
  assert.ok(Math.abs((child.min.z + child.max.z) / 2 + 2) < 1e-4);
  // Mirror (scale x = -1): faces still point up, so the winding was flipped.
  const mirror = meshes.find((m) => m.name === 'Mirror').geometry;
  const n = mirror.getAttribute('normal');
  for (let i = 0; i < n.count; i++) assert.ok(n.getY(i) > 0.99);
});

test('FBX export: textures embed, and WebP is re-encoded as PNG', async () => {
  const { Document } = await import('@gltf-transform/core');
  const doc = fbxTestScene();
  const png = readFileSync('tests/fixtures/fbx/checker.png');
  const tex = doc.createTexture('checker').setMimeType('image/webp').setImage(new Uint8Array([1, 2, 3]));
  doc.getRoot().listMaterials()[0].setBaseColorTexture(tex);
  const { bytes, stats, notes } = await documentToFbx(doc, { toPng: async () => new Uint8Array(png) });
  assert.equal(stats.textures, 1);
  assert.ok(notes.some((n) => /WebP .*converted to PNG/.test(n)));
  assert.ok(Buffer.from(bytes).includes(Buffer.from(png)), 'the PNG is embedded byte for byte');
  assert.ok(Document);
});

test('FBX units: centimetre files are scaled to metres', () => {
  assert.equal(fbxMetresPerUnit(readFileSync('tests/fixtures/fbx/static-textured.fbx')), 0.01);
  assert.equal(fbxMetresPerUnit(readFileSync('tests/fixtures/fbx/rigged-animated.fbx')), 0.01);
  assert.equal(fbxMetresPerUnit(new TextEncoder().encode('P: "UnitScaleFactor", "double", "Number", "",2.54')), 0.0254);
  assert.equal(fbxMetresPerUnit(new Uint8Array([1, 2, 3])), 1, 'unknown → leave as is');
});

test('FBX export: a rigged, animated glTF keeps its bones, skin weights and take', async () => {
  const { readDocument } = await import('../worker/api/glb.js');
  const doc = await readDocument(new Uint8Array(readFileSync('tests/fixtures/fbx/rigged-animated.glb')));
  const { bytes, stats } = await documentToFbx(doc);
  assert.equal(stats.bones, 2);
  assert.equal(stats.animations, 1);

  const model = parse(bytes);
  let skinned = null;
  const bones = [];
  model.traverse((o) => { if (o.isSkinnedMesh) skinned = o; if (o.isBone) bones.push(o.name); });
  assert.ok(skinned, 'the mesh comes back skinned');
  assert.deepEqual(bones.filter((n) => ['Upper', 'Lower'].includes(n)).sort(), ['Lower', 'Upper']);
  const skinWeights = skinned.geometry.getAttribute('skinWeight');
  assert.ok(skinWeights && skinWeights.count === skinned.geometry.getAttribute('position').count);

  assert.equal(model.animations.length, 1);
  const clip = model.animations[0];
  // three.js times a clip from 0, so it ends at the last key (1.04 s); the take itself is 0.958 s from its first key.
  assert.ok(Math.abs(clip.duration - 1.0417) < 0.01, `take ends at ${clip.duration}s`);
  assert.ok(clip.tracks.some((t) => /Lower\.quaternion/.test(t.name)), 'Lower is rotated');
});
