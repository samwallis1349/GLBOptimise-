import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { inspectModel, snapshotRestPose, trackBinding } from '../public/tools/character-workshop/js/inspect.js';
import { validateAsset, summarise } from '../public/tools/character-workshop/js/validate.js';
import { AnimationController, suggestCategories } from '../public/tools/character-workshop/js/animation.js';
import { ADAPTERS, adapterFor, badgeFor, pickPrimary } from '../public/tools/character-workshop/js/formats.js';
import { availableTargets, exportAsset, sanitiseFileName, verifyExport } from '../public/tools/character-workshop/js/export.js';
import { disposeObject } from '../public/tools/character-workshop/js/dispose.js';

// GLTFExporter reads Blobs with FileReader, which Node does not provide.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((r) => { this.result = `data:${blob.type};base64,${Buffer.from(r).toString('base64')}`; this.onloadend?.(); this.onload?.(); }); }
};

/** A tiny rigged "character": a two-bone skinned box with named clips. */
function makeRiggedCharacter() {
  const geometry = new THREE.BoxGeometry(0.4, 1.8, 0.3, 1, 4, 1).translate(0, 0.9, 0);
  const pos = geometry.getAttribute('position');
  const skinIndex = [], skinWeight = [];
  for (let i = 0; i < pos.count; i++) {
    const upper = pos.getY(i) > 0.9 ? 1 : 0;
    skinIndex.push(upper, 0, 0, 0);
    skinWeight.push(1, 0, 0, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const hips = new THREE.Bone(); hips.name = 'Hips';
  const chest = new THREE.Bone(); chest.name = 'Chest'; chest.position.y = 0.9; hips.add(chest);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0x888888 }));
  mesh.name = 'Body';
  const root = new THREE.Group(); root.name = 'Character';
  root.add(hips, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hips, chest]));
  const q = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(deg)).toArray();
  const clip = (name, deg) => new THREE.AnimationClip(name, 1, [
    new THREE.QuaternionKeyframeTrack('Chest.quaternion', [0, 0.5, 1], [...q(0), ...q(deg), ...q(0)]),
  ]);
  return { root, clips: [clip('Idle', 5), clip('Walk_Cycle', 20), clip('Wave', 40)] };
}

function makeStaticMesh() {
  const root = new THREE.Group(); root.name = 'Crate';
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return root;
}

test('format adapters declare capabilities and pick the model from a multi-file selection', () => {
  for (const a of ADAPTERS) {
    assert.ok(a.extensions.length && typeof a.rig === 'boolean' && typeof a.animation === 'boolean', a.id);
    assert.ok(Array.isArray(a.limitations) && Array.isArray(a.exportTargets), a.id);
  }
  assert.equal(adapterFor('Hero.FBX').id, 'fbx');
  assert.equal(badgeFor(adapterFor('a.obj')), 'OBJ — Static');
  assert.equal(badgeFor(adapterFor('a.glb')), 'GLB');
  assert.equal(adapterFor('scene.blend').load, undefined, '.blend is explained, not loaded');
  const picked = pickPrimary([{ name: 'tex.png' }, { name: 'scene.bin' }, { name: 'scene.gltf' }]);
  assert.equal(picked.adapter.id, 'gltf');
  assert.equal(pickPrimary([{ name: 'notes.txt' }]), null);
});

test('a static mesh with no skeleton gives warnings, not failures or a crash', () => {
  const root = makeStaticMesh();
  const stats = inspectModel(root, []);
  assert.equal(stats.hasSkeleton, false);
  const checks = validateAsset(stats, { root, clips: [], source: { adapter: adapterFor('a.stl') } });
  const noSkeleton = checks.find((c) => c.title === 'No skeleton');
  assert.equal(noSkeleton.status, 'warn');
  assert.match(noSkeleton.detail, /cannot contain a skeleton/);
  assert.equal(summarise(checks).fail, 0);
});

test('a rigged character passes rig and clip checks', () => {
  const { root, clips } = makeRiggedCharacter();
  const stats = inspectModel(root, clips);
  assert.equal(stats.skinnedMeshCount, 1);
  assert.equal(stats.skinBoneCount, 2);
  assert.equal(stats.clipCount, 3);
  const checks = validateAsset(stats, { root, clips, source: { adapter: adapterFor('a.glb') } });
  assert.equal(checks.find((c) => c.title === 'Skeleton connected')?.status, 'pass');
  assert.equal(checks.find((c) => c.title === 'Animation clips usable')?.status, 'pass');
});

test('empty clips and tracks for missing bones are flagged as problems', () => {
  const { root } = makeRiggedCharacter();
  const clips = [
    new THREE.AnimationClip('Nothing', 1, []),
    new THREE.AnimationClip('Foreign', 1, [new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 0, 0, 0, 1, 0])]),
  ];
  const checks = validateAsset(inspectModel(root, clips), { root, clips });
  assert.equal(checks.find((c) => c.title === 'Empty clips').status, 'warn');
  assert.equal(checks.find((c) => c.title === 'Empty clips').kind, 'failure');
  assert.equal(checks.find((c) => c.title === 'Tracks that target missing nodes').status, 'warn');
  assert.deepEqual(trackBinding(clips[1], root), { total: 1, bound: 0, unbound: ['mixamorigHips.position'] });
});

test('categories are suggested only from clip names', () => {
  const { clips } = makeRiggedCharacter();
  const s = suggestCategories(clips);
  assert.equal(s.idle.clip.name, 'Idle');
  assert.equal(s.walk.clip.name, 'Walk_Cycle');
  assert.equal(s.wave.clip.name, 'Wave');
  assert.equal(s.type, null, 'a walk cycle is never labelled Type');
  assert.equal(s.run, null);
  assert.equal(suggestCategories([{ name: 'WalkJump' }]).run, null);
});

test('switching clips never leaves more than the outgoing and incoming actions running', () => {
  const { root, clips } = makeRiggedCharacter();
  const ctl = new AnimationController();
  ctl.attach(root, clips, snapshotRestPose(root));
  ctl.play(clips[0]); ctl.update(0.1);
  ctl.play(clips[1]); ctl.update(0.05);
  ctl.play(clips[2]); ctl.update(0.05);
  assert.ok(ctl.activeActionCount() <= 2);
  ctl.update(1);
  assert.equal(ctl.activeActionCount(), 1);
  ctl.seek(0.5);
  assert.equal(ctl.time, 0.5);
  const chest = root.getObjectByName('Chest');
  assert.notEqual(chest.quaternion.z, 0);
  ctl.stop();
  assert.equal(chest.quaternion.z, 0, 'stop restores the rest pose');
  ctl.detach();
  assert.equal(ctl.mixer, null);
});

test('GLB export keeps skeleton and selected clips, and the reloaded file matches', async () => {
  const { root, clips } = makeRiggedCharacter();
  const rest = snapshotRestPose(root);
  // Pose the live model mid-animation: the export must still use the rest pose.
  root.getObjectByName('Chest').rotation.z = 1;
  const out = await exportAsset({ model: root, restPose: rest, clips: [clips[0], clips[2]], target: 'glb', fileName: 'hero' });
  assert.equal(out.fileName, 'hero.glb');
  assert.ok(out.size > 0);
  const { checks, stats } = await verifyExport(out);
  for (const c of checks) assert.equal(c.status, 'pass', `${c.label}: expected ${c.expected}, got ${c.actual}`);
  assert.equal(stats.clipCount, 2);
  assert.equal(root.getObjectByName('Chest').rotation.z, 1, 'source model untouched');
});

test('static-only targets are disabled for rigged assets', () => {
  const { root, clips } = makeRiggedCharacter();
  const targets = availableTargets(adapterFor('a.glb'), inspectModel(root, clips));
  assert.equal(targets.find((t) => t.id === 'glb').enabled, true);
  assert.equal(targets.find((t) => t.id === 'stl').enabled, false);
  assert.equal(sanitiseFileName('my hero?.fbx', 'glb'), 'my hero_.glb');
});

test('disposing a model releases its geometry and materials', () => {
  const root = makeStaticMesh();
  const mesh = root.children[0];
  let disposed = 0;
  mesh.geometry.addEventListener('dispose', () => disposed++);
  mesh.material.addEventListener('dispose', () => disposed++);
  disposeObject(root);
  assert.equal(disposed, 2);
});
