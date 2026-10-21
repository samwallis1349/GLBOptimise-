import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorFromAlpha, drawOrder, gridFromWorld, itemRect, layoutJson, pixelAt,
  sceneBounds, snapWorld, stepOnGrid, worldFromGrid,
} from '../src/tools/iso-scene-builder/scene.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('grid and world coordinates round-trip on a 2:1 grid', () => {
  for (const [gx, gy] of [[0, 0], [3, -2], [1.5, 7.25]]) {
    const w = worldFromGrid(gx, gy, 64);
    const g = gridFromWorld(w.x, w.y, 64);
    near(g.gx, gx); near(g.gy, gy);
  }
  assert.deepEqual(worldFromGrid(1, 0, 64), { x: 32, y: 16 });
  assert.deepEqual(worldFromGrid(1, 1, 64), { x: 0, y: 32 });
});

test('snapping lands on tile centres, corners or half tiles', () => {
  assert.deepEqual(snapWorld(3, 14, 64), worldFromGrid(0.5, 0.5, 64));
  assert.deepEqual(snapWorld(3, 2, 64, 'corner'), { x: 0, y: 0 });
  const h = snapWorld(17, 9, 64, 'half');
  const g = gridFromWorld(h.x, h.y, 64);
  near(g.gx * 2, Math.round(g.gx * 2)); near(g.gy * 2, Math.round(g.gy * 2));
});

test('a screen-up step moves one tile straight up', () => {
  const c = worldFromGrid(2.5, 2.5, 64);
  const up = stepOnGrid(c.x, c.y, 64, -1, -1);
  near(up.x, c.x); near(up.y, c.y - 32);
  const right = stepOnGrid(c.x, c.y, 64, 1, -1);
  near(right.x, c.x + 64); near(right.y, c.y);
});

test('auto depth draws lower objects in front, layers override it', () => {
  const back = { uid: 'b', y: 10, x: 0, layer: 0 };
  const front = { uid: 'f', y: 50, x: 0, layer: 0 };
  const sky = { uid: 's', y: 0, x: 0, layer: 1 };
  assert.deepEqual(drawOrder([front, sky, back]).map((i) => i.uid), ['b', 'f', 's']);
  assert.deepEqual(drawOrder([front, sky, back], false).map((i) => i.uid), ['f', 'b', 's']);
});

test('rects, flipped hit pixels and bounds follow the ground point', () => {
  const object = { width: 100, height: 50, anchorX: 0.25, anchorY: 1 };
  const item = { x: 200, y: 100, scale: 2, flip: false, layer: 0, objectId: 'o' };
  assert.deepEqual(itemRect(item, object), { x: 150, y: 0, w: 200, h: 100 });
  assert.deepEqual(pixelAt(item, object, 151, 1), { px: 0, py: 0 });
  const flipped = { ...item, flip: true };
  assert.deepEqual(itemRect(flipped, object), { x: 50, y: 0, w: 200, h: 100 });
  assert.deepEqual(pixelAt(flipped, object, 51, 1), { px: 99, py: 0 });
  assert.equal(pixelAt(item, object, 0, 0), null);
  assert.deepEqual(sceneBounds([item, flipped], new Map([['o', object]])), { x: 50, y: 0, w: 300, h: 100 });
  assert.equal(sceneBounds([], new Map()), null);
});

test('the ground point comes from the lowest opaque row', () => {
  const w = 10, h = 10, alpha = new Uint8Array(w * h);
  for (let y = 2; y <= 6; y++) for (let x = 3; x <= 6; x++) alpha[y * w + x] = 255;
  assert.deepEqual(anchorFromAlpha(alpha, w, h), { anchorX: 0.5, anchorY: 0.7 });
  assert.deepEqual(anchorFromAlpha(new Uint8Array(4), 2, 2), { anchorX: 0.5, anchorY: 1 });
});

test('layout JSON lists objects in draw order with grid positions', () => {
  const objects = new Map([['tree', { name: 'Tree', anchorX: 0.5, anchorY: 1 }]]);
  const a = { uid: 'a', objectId: 'tree', ...worldFromGrid(1.5, 0.5, 64), scale: 1, flip: false, layer: 0 };
  const b = { uid: 'b', objectId: 'tree', ...worldFromGrid(0.5, 0.5, 64), scale: 1, flip: true, layer: 0 };
  const out = layoutJson({ tile: 64, autoDepth: true, items: [a, b] }, objects);
  assert.equal(out.tile.height, 32);
  assert.deepEqual(out.objects.map((o) => [o.gridX, o.gridY, o.flipX]), [[0.5, 0.5, true], [1.5, 0.5, false]]);
});
