import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The site's 3D viewers load Draco from `${BASE_URL}draco/` (setDecoderPath);
// without these files every Draco-compressed model fails with a 404.
test('the Draco decoder the viewers load from /draco/ is in public/', () => {
  for (const file of ['draco_decoder.wasm', 'draco_wasm_wrapper.js', 'draco_decoder.js']) {
    assert.ok(existsSync(join('public/draco', file)), `public/draco/${file} is missing`);
  }

  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const users = walk('src').filter((f) => f.endsWith('.js') && /setDecoderPath\(`\$\{[^}]+\}draco\/`\)/.test(readFileSync(f, 'utf8')));
  assert.ok(users.length > 0, 'some viewer loads Draco from /draco/');
});
