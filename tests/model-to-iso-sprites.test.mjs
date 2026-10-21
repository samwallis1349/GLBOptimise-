// Pure-logic tests for Model to Iso Sprites: projection presets, frame planning, sheet layout, atlas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pxPerMetre, facingRotation, DIRECTION_SETS, autoCell, ELEVATION, tilePreset } from '../public/tools/model-to-iso-sprites/js/presets.js';
import { sampleTimes, frameName, planFrames, layoutSheet, buildAtlas, countFrames, slug } from '../public/tools/model-to-iso-sprites/js/frames.js';

test('2:1 tile: 1 m is tileW/√2 px and the camera tilt is atan(1/2)', () => {
  assert.equal(Math.round(pxPerMetre(128) * 100) / 100, 90.51);
  assert.ok(Math.abs(Math.tan(ELEVATION) - 0.5) < 1e-12);
  assert.equal(tilePreset('nope').tileW, 128);
});

test('facing: +Z model turned to face each screen direction', () => {
  // Camera at (+,+,+): screen down-right (SE) is world +X, screen down-left (SW) is +Z.
  const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-9;
  assert.ok(near(facingRotation('sw'), 0));
  assert.ok(near(facingRotation('se'), Math.PI / 2));
  assert.ok(near(facingRotation('ne'), Math.PI));
  assert.ok(near(facingRotation('nw'), -Math.PI / 2));
  assert.deepEqual(DIRECTION_SETS[4], ['se', 'sw', 'nw', 'ne']);
  assert.equal(new Set(DIRECTION_SETS[8]).size, 8);
});

test('autoCell fits a 1.75 m person with room and puts the base point low and centred', () => {
  const { cell, anchor } = autoCell({ height: 1.75, reach: 0.4, tileW: 128 });
  assert.equal(cell % 16, 0);
  assert.equal(anchor.x, cell / 2);
  const s = pxPerMetre(128);
  assert.ok(anchor.y > 1.75 * Math.cos(ELEVATION) * s, 'head fits above the base point');
  assert.ok(anchor.y < cell);
});

test('loop-safe sampling leaves the last frame out', () => {
  assert.deepEqual(sampleTimes(1, 4, true), [0, 0.25, 0.5, 0.75]);
  assert.deepEqual(sampleTimes(1, 4, false), [0, 1 / 3, 2 / 3, 1]);
  assert.equal(sampleTimes(100, 24).length, 64, 'capped');
  assert.deepEqual(sampleTimes(0, 12), [0]);
});

test('frame names follow the pattern and never collide', () => {
  assert.equal(frameName('{model}_{anim}_{dir}_{frame}', { model: 'Guard Mk 2', anim: 'Walk Cycle', dir: 'se', frame: 3 }), 'guard_mk_2_walk_cycle_se_03');
  const rows = planFrames({ model: 'x', clips: [{ name: 'Walk', duration: 0.5 }], dirs: ['se', 'sw'], fps: 12, pattern: '{anim}' });
  const names = rows.flatMap((r) => r.frames.map((f) => f.name));
  assert.equal(new Set(names).size, names.length);
  assert.equal(slug(''), 'clip');
});

test('no clips → one still frame per direction', () => {
  const rows = planFrames({ model: 'crate', clips: [], dirs: DIRECTION_SETS[8], fps: 12 });
  assert.equal(countFrames(rows), 8);
  assert.equal(rows[0].anim, 'static');
});

test('sheet layout wraps long clips and the atlas indexes every frame', () => {
  const rows = planFrames({ model: 'g', clips: [{ name: 'Walk', duration: 1 }, { name: 'Idle', duration: 0.5 }], dirs: ['se', 'sw'], fps: 12 });
  const layout = layoutSheet(rows, 128, 1024);
  assert.equal(layout.cols, 8);
  assert.equal(layout.width, 1024);
  // Walk 12 frames → 2 rows per dir; Idle 6 → 1 row per dir.
  assert.equal(layout.height, (2 + 2 + 1 + 1) * 128);
  const atlas = buildAtlas({ image: 'g.png', layout, rows, cell: 128, anchor: { x: 64, y: 100 }, fps: 12, loopSafe: true, tileW: 128, model: 'g' });
  assert.equal(Object.keys(atlas.frames).length, countFrames(rows));
  assert.deepEqual(Object.keys(atlas.animations.Walk.directions), ['se', 'sw']);
  assert.equal(atlas.animations.Walk.directions.se.length, 12);
  const f = atlas.frames[atlas.animations.Idle.directions.sw[0]];
  assert.deepEqual(f.frame, { x: 0, y: 5 * 128, w: 128, h: 128 });
  assert.equal(f.pivot.y, 0.7813);
});
