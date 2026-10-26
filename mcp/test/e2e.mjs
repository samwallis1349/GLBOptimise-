/**
 * Drives the MCP server through a real MCP client against an API (default a
 * local `wrangler dev` on :8799), calling every tool on real files.
 *
 *   ASSETBENCH_API_URL=http://localhost:8799 node mcp/test/e2e.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const API = process.env.ASSETBENCH_API_URL || 'http://localhost:8799';

const work = await mkdtemp(join(tmpdir(), 'assetbench-mcp-'));
const glb = join(work, 'robot.glb');
const fbx = join(work, 'crate.fbx');
const png = join(work, 'icon.png');
await cp(join(ROOT, 'public/tools/character-workshop/samples/robot-expressive.glb'), glb);
await cp(join(ROOT, 'tests/fixtures/fbx/static-textured.fbx'), fbx);
await cp(join(ROOT, 'public/hero/sunny-poster.png'), png);

let key = process.env.ASSETBENCH_API_KEY;
if (!key) {
  const res = await fetch(`${API}/api/v1/auth/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  key = (await res.json()).key;
  assert.ok(key, 'minted a trial key');
}

const client = new Client({ name: 'e2e', version: '1.0.0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(HERE, '..', 'index.js')],
  env: { ...process.env, ASSETBENCH_API_URL: API, ASSETBENCH_API_KEY: key },
}));

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

const run = async (name, args, expectError = false) => {
  const r = await client.callTool({ name, arguments: args });
  const out = r.content.map((c) => c.text).join('\n');
  console.log(`\n── ${name}${r.isError ? ' (error)' : ''}\n${out.slice(0, 400)}${out.length > 400 ? ' …' : ''}`);
  assert.equal(Boolean(r.isError), expectError, `${name}: ${out}`);
  return out;
};

const check = JSON.parse(await run('check_model', { path: glb, target: 'Roblox on a low-end Android phone' }));
assert.ok(check.evaluation && check.devices, 'check report has evaluation and devices');
await run('explain_target', { target: 'Quest headset, under 20k tris' });
await run('account_status', {});
await run('reduce_model', { path: glb, ratio: 0.5 });
await run('optimize_model', { path: glb, target: 'web' });
await run('make_game_ready', { path: glb, engine: 'unity', device: 'mid', lods: true, collision: true });
await run('generate_lods', { path: glb, levels: [1, 0.5, 0.25] });
await run('convert_model', { path: fbx });
await run('convert_model', { path: glb, to: 'obj' });
await run('compress_textures', { path: png, maxSize: 256 });
await run('resize_texture', { path: png, maxSize: 256, format: 'webp' });
await run('make_app_assets', { path: png, platforms: 'ios,android' });
await run('make_store_screenshots', { paths: [png], devices: ['iphone-6.9', 'android-phone'] });

// Helpful failures, not crashes.
await run('check_model', { path: fbx }, true);
await run('check_model', { path: join(work, 'missing.glb') }, true);

console.log('\nfiles written:', (await readdir(work)).join(', '));
await client.close();
console.log('\nall tools passed');
