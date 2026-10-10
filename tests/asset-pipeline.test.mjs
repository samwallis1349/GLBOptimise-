import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { encodeImage } from '../worker/api/images.js';
import { encodeKtx2 } from '../worker/api/ktx2.js';
import { processAsset, CancelledError } from '../src/tools/asset-pipeline/engine/pipeline.js';
import { inspectAsset } from '../src/tools/asset-pipeline/engine/inspect.js';
import { planAsset } from '../src/tools/asset-pipeline/engine/plan.js';
import { pureCodecs } from '../src/tools/asset-pipeline/engine/codecs.js';
import { checkStageOrder } from '../src/tools/asset-pipeline/engine/stages.js';
import { gatherAssets } from '../src/tools/asset-pipeline/engine/sources.js';
import { runBatch } from '../src/tools/asset-pipeline/engine/queue.js';
import { buildZip } from '../src/tools/asset-pipeline/engine/packaging.js';
import { batchCsv } from '../src/tools/asset-pipeline/engine/reports.js';
import { createEncodeCache } from '../src/tools/asset-pipeline/engine/textures.js';
import { BUILTIN_PROFILES, compose, defaultSettings, normaliseSettings, parseProfileFile, profileFile } from '../src/tools/asset-pipeline/engine/settings.js';
import { pipelineIO, staticTextured, multiMaterial, transparent, skinnedCharacter, morphTargets, separateGltf, entry } from './helpers/pipelineFixtures.mjs';

globalThis.__ASSETBENCH_BASIS_WASM__ = await WebAssembly.compile(readFileSync(new URL('../node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm', import.meta.url)));

const io = await pipelineIO();
const codecs = pureCodecs();
const ktxCodecs = {
  ...codecs,
  encoders: {
    ...codecs.encoders,
    ktx2: async (image, o) => (await encodeKtx2(encodeImage(image, 'image/png'), { mode: o.mode, normalMap: o.normalMap, srgb: o.srgb, mipmaps: o.mipmaps, quality: o.quality })).bytes,
  },
};
const env = (extra = {}) => ({ io, codecs, encodeCache: createEncodeCache(), ...extra });

function settings(mutate) {
  const s = defaultSettings();
  mutate?.(s);
  return normaliseSettings(s);
}
const setStage = (s, id, enabled) => (s.stages.find((x) => x.id === id).enabled = enabled);
const main = (r) => r.outputs.find((o) => o.kind === 'main') || r.outputs.find((o) => o.kind === 'lod' && o.level === 0);
const reopen = (bytes) => io.readBinary(bytes);
const allChecks = (r) => r.validation.flatMap((v) => v.checks);

// ---------------------------------------------------------------- settings

test('settings: stages pinned, values clamped, profiles round-trip, every built-in profile is valid', () => {
  const s = normaliseSettings({ stages: [{ id: 'export' }, { id: 'geometry', enabled: false }, { id: 'inspect', enabled: false }], geometry: { keepPercent: 500, error: -1 }, export: { suffix: '../../evil' } });
  assert.equal(s.stages[0].id, 'inspect');
  assert.equal(s.stages[0].enabled, true);
  assert.equal(s.stages.at(-1).id, 'export');
  assert.equal(s.stages.length, 11);
  assert.equal(s.stages.find((x) => x.id === 'geometry').enabled, false);
  assert.equal(s.geometry.keepPercent, 100);
  assert.equal(s.geometry.error, 0.0001);
  assert.ok(!s.export.suffix.includes('/'));

  const file = profileFile('Studio', s);
  const back = parseProfileFile(JSON.stringify(file));
  assert.equal(back.name, 'Studio');
  assert.deepEqual(back.settings, s);
  assert.throws(() => parseProfileFile('{"hello":1}'), /not an AssetBench pipeline profile/);

  for (const p of BUILTIN_PROFILES) {
    const built = normaliseSettings(p.build());
    assert.deepEqual(checkStageOrder(built.stages).errors, [], p.name);
  }
});

test('stage order: hard dependencies block, risky orders warn', () => {
  const s = defaultSettings();
  const swap = (a, b) => {
    const i = s.stages.findIndex((x) => x.id === a);
    const j = s.stages.findIndex((x) => x.id === b);
    [s.stages[i], s.stages[j]] = [s.stages[j], s.stages[i]];
  };
  swap('resizeTextures', 'compressTextures');
  assert.match(checkStageOrder(s.stages).errors.join(), /Compress textures must run after Resize textures/);
  swap('resizeTextures', 'compressTextures');
  swap('geometry', 'lods');
  const r = checkStageOrder(s.stages.map((x) => ({ ...x, enabled: true })));
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join(), /unoptimised geometry/);
  swap('geometry', 'lods');
  swap('validate', 'animation');
  assert.match(checkStageOrder(s.stages).errors.join(), /Validate output must run after/);
});

// ---------------------------------------------------------------- assets

test('static textured model: resized per role, measured smaller, source untouched, validation passes', async () => {
  const bytes = await staticTextured(io, { size: 1024 });
  const copy = bytes.slice();
  const s = settings((x) => {
    x.textures.roles.baseColor.maxSize = 512;
    x.textures.roles.normal.maxSize = 512;
    x.textures.roles.metallicRoughness.maxSize = 256;
    x.geometry.keepPercent = 50;
  });
  const r = await processAsset({ name: 'ball.glb', dir: 'props/', bytes }, s, env());
  assert.equal(r.status, 'done', r.error);
  assert.deepEqual(bytes, copy, 'source bytes are never modified');
  assert.equal(main(r).path, 'props/ball_optimized.glb');
  assert.ok(r.outputBytes < bytes.byteLength);
  const sizes = Object.fromEntries(r.textures.map((t) => [t.role, t.after.width]));
  assert.deepEqual(sizes, { baseColor: 512, normal: 512, metallicRoughness: 256 });
  assert.ok(r.after.stats.triangles < r.inspection.stats.triangles * 0.6);
  assert.ok(r.after.stats.gpuTextureBytes < r.inspection.stats.gpuTextureBytes / 3);
  assert.ok(allChecks(r).every((c) => c.status !== 'fail'));
  const doc = await reopen(main(r).bytes);
  assert.equal(doc.getRoot().listTextures()[0].getSize()[0], 512);
});

test('multiple materials: names, materials and assignments survive; shared texture stays shared', async () => {
  const bytes = await multiMaterial(io);
  const r = await processAsset({ name: 'kit.glb', bytes }, settings((x) => (x.geometry.joinPrimitives = true)), env());
  assert.equal(r.status, 'done');
  const doc = await reopen(main(r).bytes);
  const root = doc.getRoot();
  assert.deepEqual(root.listMeshes().map((m) => m.getName()).sort(), ['Part_Blue', 'Part_Green', 'Part_Red']);
  assert.equal(root.listMaterials().length, 3);
  assert.equal(root.listTextures().length, 1);
  for (const mesh of root.listMeshes()) assert.equal(mesh.listPrimitives()[0].getMaterial().getName(), mesh.getName().replace('Part_', ''));
});

test('large textures: data maps refuse lossy formats, colour maps take JPEG, KTX2 written with KHR_texture_basisu', async () => {
  const bytes = await staticTextured(io, { segments: 16, size: 2048 });
  const s = settings((x) => {
    for (const r of Object.values(x.textures.roles)) r.maxSize = 1024;
    x.textures.roles.baseColor.format = 'jpeg';
    x.textures.roles.normal.format = 'jpeg';
    x.textures.roles.metallicRoughness.format = 'webp';
  });
  const r = await processAsset({ name: 'big.glb', bytes }, s, env());
  assert.equal(r.status, 'done');
  const byRole = Object.fromEntries(r.textures.map((t) => [t.role, t]));
  assert.equal(byRole.baseColor.after.mime, 'image/jpeg');
  assert.equal(byRole.normal.after.mime, 'image/png');
  assert.match(byRole.normal.notes.join(), /refused for a normal map/);
  assert.equal(byRole.metallicRoughness.after.mime, 'image/png');
  assert.ok(r.textures.every((t) => t.after.width === 1024));

  const k = settings((x) => {
    for (const r2 of Object.values(x.textures.roles)) {
      r2.maxSize = 512;
      r2.format = 'ktx2';
    }
  });
  const rk = await processAsset({ name: 'big.glb', bytes }, k, env({ codecs: ktxCodecs }));
  assert.equal(rk.status, 'done', rk.error);
  assert.ok(rk.textures.every((t) => t.after.mime === 'image/ktx2'));
  const doc = await reopen(main(rk).bytes);
  assert.ok(doc.getRoot().listExtensionsRequired().some((e) => e.extensionName === 'KHR_texture_basisu'));
  assert.ok(rk.after.stats.gpuTextureBytes < r.after.stats.gpuTextureBytes, 'KTX2 estimate is lower than RGBA8');
  // Without an encoder the format is not faked.
  const none = await processAsset({ name: 'big.glb', bytes }, k, env());
  assert.ok(none.textures.every((t) => t.after.mime === 'image/png'));
  assert.match(none.log.map((l) => l.message).join(), /KTX2 is not available/);
});

test('transparent textures: alpha role, JPEG refused for alpha, alpha mode preserved', async () => {
  const bytes = await transparent(io);
  const s = settings((x) => {
    x.textures.roles.alpha.format = 'jpeg';
    x.textures.roles.alpha.maxSize = 512;
  });
  const r = await processAsset({ name: 'leaves.glb', bytes }, s, env());
  assert.equal(r.status, 'done');
  assert.equal(r.textures[0].role, 'alpha');
  assert.equal(r.textures[0].after.mime, 'image/png');
  assert.match(r.textures[0].notes.join(), /transparency/);
  const doc = await reopen(main(r).bytes);
  assert.equal(doc.getRoot().listMaterials()[0].getAlphaMode(), 'BLEND');
});

test('skinned animated character: protected from simplification, rig and clips survive, redundant keys removed', async () => {
  const bytes = await skinnedCharacter(io);
  const inspection = await inspectAsset(bytes, { io });
  assert.equal(inspection.features.skins, 1);
  assert.equal(inspection.features.animations.length, 2);

  const s = settings((x) => {
    x.geometry.keepPercent = 25;
    x.advanced.origin = 'below';
    x.advanced.mergeMeshes = true;
  });
  const plan = planAsset(inspection, s);
  assert.ok(plan.stages.find((st) => st.id === 'geometry').skipped.some((t) => /protected/.test(t)));
  assert.ok(plan.confirm.some((c) => c.code === 'heavy-simplify'));

  const r = await processAsset({ name: 'hero.glb', bytes }, s, env());
  assert.equal(r.status, 'done', r.error);
  assert.equal(r.geometry.meshes[0].status, 'Skipped');
  assert.equal(r.after.stats.triangles, inspection.stats.triangles - r.geometry.degenerateRemoved);
  const v = allChecks(r);
  assert.ok(v.some((c) => c.name === 'skinning' && c.status === 'pass'));
  assert.ok(v.some((c) => c.name === 'animations' && c.status === 'pass'));
  assert.match(r.log.map((l) => l.message).join(), /Origin was not moved/);
  assert.match(r.log.map((l) => l.message).join(), /Merge compatible meshes was skipped/);
  const [, keysBefore, keysAfter] = /redundant keyframes \((\d+) → (\d+)\)/.exec(r.stages.find((st) => st.id === 'animation').ops.join());
  assert.ok(Number(keysAfter) < Number(keysBefore), 'the linear Bob clip loses its middle key');

  // Explicitly allowed: the mesh is simplified and the plan asks for confirmation.
  const allow = settings((x) => {
    x.geometry.keepPercent = 50;
    x.geometry.allowDeforming = true;
  });
  assert.ok(planAsset(inspection, allow).confirm.some((c) => c.code === 'deforming'));
  const r2 = await processAsset({ name: 'hero.glb', bytes }, allow, env());
  assert.ok(r2.after.stats.triangles < inspection.stats.triangles * 0.7);
  assert.equal(r2.after.features.joints, 3);
});

test('morph targets survive and are protected by default', async () => {
  const bytes = await morphTargets(io);
  const r = await processAsset({ name: 'face.glb', bytes }, settings(), env());
  assert.equal(r.status, 'done');
  assert.equal(r.after.features.morphTargets, 2);
  assert.equal(r.geometry.meshes[0].status, 'Skipped');
  assert.ok(allChecks(r).some((c) => c.name === 'morph-targets' && c.status === 'pass'));
});

test('glTF with sibling files: packed to GLB; missing image reported; missing .bin rejected', async () => {
  const files = await separateGltf(io);
  const { assets } = await gatherAssets(files.map((f) => entry(f.path, f.data)));
  assert.equal(assets.length, 1);
  assert.equal(assets[0].sourceFormat, 'gltf');
  const { bytes, missing } = await assets[0].load(io);
  assert.deepEqual(missing, ['missing.png']);
  const inspection = await inspectAsset(bytes, { io, missing });
  assert.ok(inspection.issues.some((i) => i.code === 'missing-resources'));
  const r = await processAsset({ name: 'model.gltf', dir: 'kit/', bytes, missing, inspection }, settings(), env());
  assert.notEqual(r.status, 'failed');
  assert.equal(main(r).path, 'kit/model_optimized.glb');

  const broken = await separateGltf(io, { dropBin: true });
  const { assets: a2 } = await gatherAssets(broken.map((f) => entry(f.path, f.data)));
  await assert.rejects(a2[0].load(io), /Missing geometry buffer/);
});

test('malformed and unsupported files fail cleanly without throwing', async () => {
  const junk = new Uint8Array(4096).map((_, i) => (i * 37) & 255);
  const r = await processAsset({ name: 'junk.glb', bytes: junk }, settings(), env());
  assert.equal(r.status, 'failed');
  assert.match(r.error, /glb|GLB/);

  const good = await staticTextured(io, { segments: 8, size: 64 });
  const truncated = good.slice(0, Math.floor(good.byteLength / 2));
  const r2 = await processAsset({ name: 'cut.glb', bytes: truncated }, settings(), env());
  assert.equal(r2.status, 'failed');

  const { assets, ignored } = await gatherAssets([entry('notes.txt', new Uint8Array(3)), entry('bad.zip', new Uint8Array([1, 2, 3]))]);
  assert.equal(assets.length, 0);
  assert.equal(ignored.length, 2);
});

test('large batch from a ZIP: bounded concurrency, failures isolated, ZIP with manifest/CSV/HTML and no path collisions', async () => {
  const zip = new JSZip();
  const small = await staticTextured(io, { segments: 12, size: 64 });
  for (let i = 0; i < 18; i += 1) zip.file(`set${i % 3}/prop.glb`.replace('prop', i < 3 ? 'prop' : `prop${i}`), small);
  zip.file('set1/broken.glb', new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]));
  const data = await zip.generateAsync({ type: 'uint8array' });
  const { assets } = await gatherAssets([entry('library.zip', data)]);
  assert.equal(assets.length, 19);

  const s = settings((x) => (x.export.folders = 'flat'));
  let running = 0;
  let peak = 0;
  const outcomes = await runBatch(
    assets,
    async (asset) => {
      running += 1;
      peak = Math.max(peak, running);
      try {
        const { bytes, missing } = await asset.load(io);
        return await processAsset({ name: asset.name, dir: asset.dir, bytes, missing }, s, env());
      } finally {
        running -= 1;
      }
    },
    { concurrency: 3 }
  );
  assert.ok(peak <= 3);
  const results = outcomes.map((o) => o.value);
  assert.equal(results.filter((r) => r.status === 'done').length, 18);
  assert.equal(results.filter((r) => r.status === 'failed').length, 1);

  const { data: zipped, files } = await buildZip(results, s);
  const out = await JSZip.loadAsync(zipped);
  assert.ok(files.includes('manifest.json') && files.includes('batch_summary.csv') && files.includes('report.html'));
  // Three "prop.glb" from different folders, flattened: no overwrites.
  assert.ok(files.includes('prop_optimized.glb') && files.includes('prop_optimized_2.glb') && files.includes('prop_optimized_3.glb'));
  assert.equal(batchCsv(results).trim().split('\n').length, 20);
  const manifest = JSON.parse(await out.file('manifest.json').async('string'));
  assert.equal(manifest.assets.length, 19);
  assert.equal(manifest.assets.find((a) => a.status === 'failed').outputs.length, 0);
});

test('budgets: retries toward the budget, but respects minimums and marks for review', async () => {
  const bytes = await staticTextured(io, { segments: 64, size: 256 });
  const base = (x) => {
    x.geometry.simplify = false;
    x.budgets.enabled = true;
    x.budgets.onExceed = 'optimise';
    for (const k of Object.keys(x.budgets.limits)) x.budgets.limits[k] = { warn: 0, fail: 0 };
    x.budgets.limits.triangles = { warn: 2000, fail: 2500 };
  };
  const r = await processAsset({ name: 'b.glb', bytes }, settings(base), env());
  assert.equal(r.status, 'done', JSON.stringify(r.budgets));
  assert.ok(r.after.stats.triangles <= 2500);
  assert.ok(r.attempts.length >= 2);

  const r2 = await processAsset({ name: 'b.glb', bytes }, settings((x) => { base(x); x.geometry.minTriangles = 5000; }), env());
  assert.equal(r2.status, 'review');
  assert.match(r2.log.map((l) => l.message).join(), /nothing more can be reduced|manual review/);
});

test('LODs: separate files in decreasing order, grouped file with named LOD nodes, collision mesh', async () => {
  const bytes = await staticTextured(io, { segments: 48, size: 128 });
  const s = settings((x) => {
    setStage(x, 'lods', true);
    x.geometry.simplify = false;
    x.lods.collision = true;
  });
  const r = await processAsset({ name: 'rock.glb', bytes }, s, env());
  const lods = r.outputs.filter((o) => o.kind === 'lod');
  assert.deepEqual(lods.map((o) => o.path), ['rock_LOD0.glb', 'rock_LOD1.glb', 'rock_LOD2.glb', 'rock_LOD3.glb']);
  const tris = r.lods.map((l) => l.triangles);
  assert.ok(tris.every((t, i) => i === 0 || t < tris[i - 1]), tris.join());
  assert.ok(r.outputs.some((o) => o.kind === 'collision' && o.validation === 'pass'));

  s.lods.grouping = 'grouped';
  const g = await processAsset({ name: 'rock.glb', bytes }, s, env());
  const doc = await reopen(main(g).bytes);
  assert.equal(doc.getRoot().listScenes().length, 1);
  const names = doc.getRoot().listScenes()[0].listChildren().map((n) => n.getName());
  assert.deepEqual(names, ['rock_LOD0', 'rock_LOD1', 'rock_LOD2', 'rock_LOD3']);
  const lod0Textures = (await reopen(lods[0].bytes)).getRoot().listTextures().length;
  assert.equal(doc.getRoot().listTextures().length, lod0Textures, 'textures are stored once, shared by every level');
});

test('advanced: Z-up conversion and scale, separate-texture glTF output, Meshopt export', async () => {
  const bytes = await multiMaterial(io);
  const r = await processAsset({ name: 'kit.glb', bytes }, settings((x) => { x.advanced.sourceUp = 'z'; x.advanced.scale = 0.01; }), env());
  const before = r.inspection.features.bounds.size;
  const after = r.after.features.bounds.size;
  assert.ok(Math.abs(after[0] - before[0] * 0.01) < 1e-4);
  assert.ok(Math.abs(after[2] - before[1] * 0.01) < 1e-4, 'old Y extent is now Z');

  const sep = await processAsset({ name: 'kit.glb', bytes }, settings((x) => (x.textures.output = 'separate')), env());
  const gltf = sep.outputs.find((o) => o.path.endsWith('.gltf'));
  assert.ok(gltf);
  const json = JSON.parse(new TextDecoder().decode(gltf.bytes));
  for (const uri of [...json.buffers, ...json.images].map((x) => x.uri)) assert.ok(sep.outputs.some((o) => o.path === uri), uri);

  const m = await processAsset({ name: 'kit.glb', bytes }, settings((x) => (x.export.compression = 'meshopt')), env());
  assert.ok(m.after.compression.meshopt);
  assert.ok(allChecks(m).every((c) => c.status !== 'fail'));
});

test('cancellation stops between stages', async () => {
  const bytes = await staticTextured(io, { segments: 16, size: 64 });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(processAsset({ name: 'x.glb', bytes }, settings(), env({ signal: controller.signal })), CancelledError);
});

test('engine presets produce engine-appropriate defaults', () => {
  assert.equal(compose('unreal', 'balanced').export.compression, 'none');
  assert.equal(compose('threejs', 'balanced').export.compression, 'meshopt');
  assert.equal(compose('threejs', 'balanced').textures.roles.normal.format, 'keep');
  assert.equal(compose('mobile', 'balanced').budgets.enabled, true);
  assert.equal(compose('mobile', 'maximum').geometry.keepPercent, 30);
});
