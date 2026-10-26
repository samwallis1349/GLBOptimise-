import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { encode } from 'fast-png';
import { analyseGlb } from '../worker/api/glb.js';
import { pngBytes, sphereGlb } from './helpers/apiFixtures.mjs';
import { pipelineIO, multiMaterial, skinnedCharacter } from './helpers/pipelineFixtures.mjs';
import { runTool, TOOL_IDS } from '../extensions/model-optimiser/src/engine.js';
import { EDITIONS } from '../extensions/model-optimiser/editions.js';
import { SITE_TOOL } from '../extensions/model-optimiser/src/licensing.js';
import { IMAGE_TOOLS, PANEL_TOOLS } from '../extensions/model-optimiser/src/kinds.js';
import { TOOLS } from '../src/shared/config/tools.js';

// The Draco decoder's .wasm, as the extension's worker supplies it.
globalThis.__ASSETBENCH_DRACO_WASM__ ??= await WebAssembly.compile(readFileSync(new URL('../node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm', import.meta.url)));

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/fbx/${name}`, import.meta.url)));
const unzip = async (bytes) => JSZip.loadAsync(bytes);
const isGlb = (b) => String.fromCharCode(...b.subarray(0, 4)) === 'glTF';

/** RGBA image as PNG: a white page with `boxes` (x, y, w, h, [r,g,b]) drawn on it. */
function pagePng(width, height, boxes, background = [255, 255, 255]) {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) data.set([...background, 255], p * 4);
  for (const [x0, y0, w, h, c] of boxes) for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) data.set([...c, 255], (y * width + x) * 4);
  return encode({ width, height, data, channels: 4, depth: 8 });
}

test('editions 4–7: every tool exists, maps to a site tool, and the listings fit the store limits', () => {
  for (const id of ['animation-tools', 'converter', 'app-assets', 'image-tools']) {
    const e = EDITIONS[id];
    assert.ok(e, id);
    assert.equal(e.accepts, 'any');
    for (const t of e.tools) {
      assert.ok(TOOL_IDS.includes(t), `${id}: ${t}`);
      assert.ok(TOOLS.some((tool) => tool.id === SITE_TOOL[t]), `${id}: ${t} → ${SITE_TOOL[t]} is a site tool`);
    }
    assert.equal(e.free.length, 1, `${id} has one free check`);
  }
  assert.ok(PANEL_TOOLS.has('iso') && !IMAGE_TOOLS.has('iso'));
});

test('Animation Tools: FBX and GLB clips are listed, stripped and optimised', async () => {
  // FBX in: converted to GLB first, and the report says so.
  const fbx = fixture('rigged-animated.fbx');
  const clips = await runTool('clips', fbx, {}, 'rigged-animated.fbx');
  assert.equal(clips.output, undefined);
  assert.equal(clips.report.clips.length, 1);
  assert.match(clips.report.warnings[0], /Converted from FBX to GLB/);
  const optimised = await runTool('anim-optimise', fbx, { preset: 'balanced' }, 'rigged-animated.fbx');
  assert.ok(isGlb(optimised.output));
  assert.ok(optimised.report.keyframesAfter <= optimised.report.keyframesBefore);
  await assert.rejects(runTool('strip', fbx, { keep: [0] }, 'rigged-animated.fbx'), /Every clip is ticked/);

  // GLB with two clips: keep one.
  const glb = await skinnedCharacter(await pipelineIO());
  const listed = await runTool('clips', glb, {}, 'character.glb');
  assert.deepEqual(listed.report.clips.map((c) => c.name), ['Wave', 'Bob']);
  const stripped = await runTool('strip', glb, { keep: [1] }, 'character.glb');
  assert.equal(stripped.name, 'character-clips.glb');
  assert.deepEqual(stripped.report.kept, ['Bob']);
  assert.deepEqual(stripped.report.removed, ['Wave']);
  assert.equal(analyseGlb(stripped.output).animations, 1);
  assert.equal(analyseGlb(stripped.output).skins, 1, 'the rig stays');

  await assert.rejects(runTool('clips', new Uint8Array([1, 2, 3, 4]), {}, 'x.bin'), /not a binary glTF/);
});

test('3D Converter: FBX → GLB / glTF / OBJ / FBX, GLB → FBX that three.js reads back', async () => {
  const fbx = fixture('static-textured.fbx');
  const info = await runTool('formats', fbx, {}, 'static-textured.fbx');
  assert.equal(info.report.format, 'FBX');
  assert.equal(info.report.textures, 1);

  const glb = await runTool('convert', fbx, { to: 'glb' }, 'static-textured.fbx');
  assert.ok(isGlb(glb.output));
  assert.equal(glb.name, 'static-textured.glb');
  assert.equal(analyseGlb(glb.output).textures.length, 1, 'the embedded texture comes along');

  const gltf = await unzip((await runTool('convert', fbx, { to: 'gltf' }, 'static-textured.fbx')).output);
  assert.ok(Object.keys(gltf.files).some((n) => n.endsWith('.gltf')));
  const obj = await unzip((await runTool('convert', fbx, { to: 'obj' }, 'static-textured.fbx')).output);
  assert.ok(Object.keys(obj.files).some((n) => n.endsWith('.obj')));

  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const toFbx = await runTool('convert', fixture('rigged-animated.glb'), { to: 'fbx' }, 'rigged-animated.glb');
  assert.equal(new TextDecoder().decode(toFbx.output.subarray(0, 18)), 'Kaydara FBX Binary');
  const back = new FBXLoader().parse(toFbx.output.buffer.slice(toFbx.output.byteOffset, toFbx.output.byteOffset + toFbx.output.byteLength), '');
  let meshes = 0;
  back.traverse((o) => { if (o.isMesh) meshes += 1; });
  assert.ok(meshes >= 1);
  assert.equal(back.animations.length, 1, 'the clip survives');

  const scaled = await runTool('convert', glb.output, { to: 'glb', scale: 0.01 }, 'static-textured.glb');
  assert.ok(analyseGlb(scaled.output).triangles === analyseGlb(glb.output).triangles);
});

test('3D Converter: split by mesh and material, merge FBX + GLB, LOD chain', async () => {
  const parts = await sphereGlb(16, { parts: 3 });
  const byMesh = await runTool('split', parts, { by: 'meshes' }, 'kit.glb');
  assert.equal(byMesh.report.parts.length, 3);
  const zip = await unzip(byMesh.output);
  const glbs = Object.keys(zip.files).filter((n) => n.endsWith('.glb'));
  assert.equal(glbs.length, 3);
  for (const n of glbs) assert.equal(analyseGlb(await zip.file(n).async('uint8array')).meshCount, 1, n);
  const byObject = await runTool('split', parts, { by: 'objects' }, 'kit.glb');
  assert.equal(byObject.report.parts.length, 3);
  await assert.rejects(runTool('split', parts, { by: 'materials' }, 'kit.glb'), /1 material/);

  const multi = await multiMaterial(await pipelineIO());
  const byMaterial = await runTool('split', multi, { by: 'materials' }, 'multi.glb');
  assert.ok(byMaterial.report.parts.length >= 2);

  const merged = await runTool('merge', parts, { others: [{ name: 'static-textured.fbx', bytes: fixture('static-textured.fbx').buffer }, { name: 'rigged.glb', bytes: fixture('rigged-animated.glb').buffer }] }, 'kit.glb');
  const before = analyseGlb(parts).triangles + 108 + analyseGlb(fixture('rigged-animated.glb')).triangles;
  assert.equal(analyseGlb(merged.output).triangles, before, 'every model is in the merged GLB');
  assert.equal(merged.report.models.length, 3);

  const lods = await runTool('lods', await sphereGlb(60), { levels: '1,0.5,0.25' }, 'ball.glb');
  const tris = lods.report.levels.map((l) => l.triangles);
  assert.equal(tris.length, 3);
  assert.ok(tris[0] > tris[1] && tris[1] > tris[2], tris.join(' > '));
});

test('App Assets: icon check, icon sets, Xcode image sets and screenshots', async () => {
  const icon = pngBytes(1024, 1024, { alpha: true });
  const check = await runTool('icon-check', icon, {}, 'icon.png');
  assert.equal(check.report.transparent, true);
  assert.ok(check.report.checks.some((c) => c.level === 'warn' && /transparency/.test(c.text)));
  const small = await runTool('icon-check', pngBytes(300, 300), {}, 'small.png');
  assert.ok(small.report.checks.some((c) => c.level === 'error'));

  const icons = await unzip((await runTool('icons', icon, { platforms: 'ios,android' }, 'icon.png')).output);
  assert.ok(icons.file('ios/AppIcon.appiconset/Contents.json'));
  assert.ok(icons.file('android/res/mipmap-xxxhdpi/ic_launcher.png'));

  const sets = await runTool('xcassets', pngBytes(300, 150), { others: [{ name: 'logo.png', bytes: pngBytes(90, 90).buffer }] }, 'button@3x.png');
  const x = await unzip(sets.output);
  assert.ok(x.file('Assets.xcassets/button.imageset/button@2x.png'), 'the @3x suffix becomes the set name');
  assert.ok(x.file('Assets.xcassets/logo.imageset/Contents.json'));
  assert.deepEqual(sets.report.sets.map((s) => s.size1x), ['100×50', '30×30']);

  const shots = await runTool('screenshots', pngBytes(540, 960), { devices: 'iphone-6.9,android-phone', fit: 'contain', others: [{ name: 'two.png', bytes: pngBytes(540, 960).buffer }] }, 'one.png');
  assert.equal(shots.report.files, 4);
  await assert.rejects(runTool('icons', fixture('rigged-animated.glb'), {}, 'x.glb'), /PNG, JPEG or WebP/);
});

test('Sprite Studio: cutout finds and splits sprites on a coloured background; line art makes PNG + SVG', async () => {
  const sheet = pagePng(300, 120, [[20, 20, 60, 80, [200, 40, 40]], [120, 30, 50, 60, [40, 40, 200]], [210, 25, 70, 70, [30, 160, 60]]], [240, 236, 220]);
  const check = await runTool('sheet-check', sheet, {}, 'sheet.png');
  assert.equal(check.report.background, '#F0ECDC');
  assert.equal(check.report.sprites, 3);
  const cut = await runTool('cutout', sheet, { split: true, minPx: 500 }, 'sheet.png');
  const zip = await unzip(cut.output);
  const frames = JSON.parse(await zip.file('sprites.json').async('string')).frames;
  assert.deepEqual(frames.map(({ x, y, w, h }) => [x, y, w, h]), [[20, 20, 60, 80], [120, 30, 50, 60], [210, 25, 70, 70]]);
  const { decode } = await import('fast-png');
  const full = decode(await zip.file('sheet-cutout.png').async('uint8array'));
  assert.equal(full.data[3], 0, 'the background is transparent');
  assert.equal(full.data[(50 * 300 + 50) * 4 + 3], 255, 'a sprite stays solid');

  const page = pagePng(200, 200, [[20, 40, 160, 3, [20, 20, 20]], [100, 20, 2, 160, [20, 20, 20]]]);
  const lines = await runTool('lines', page, { enhance: true, weight: 4, svg: true }, 'page.png');
  const lz = await unzip(lines.output);
  const svg = await lz.file('page-lines.svg').async('string');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 200 200"/);
  assert.ok(lines.report.paths >= 1);
  const png = decode(await lz.file('page-lines.png').async('uint8array'));
  assert.equal(png.data[3], 0, 'white is removed');
  const onLine = png.data[(41 * 200 + 60) * 4 + 3];
  assert.ok(onLine > 200, `the line is kept (${onLine})`);
});
