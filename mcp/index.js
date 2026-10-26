#!/usr/bin/env node
/**
 * AssetBench MCP server. Runs on the user's machine over stdio, reads model
 * and image files from disk, sends them to the AssetBench Cloud API
 * (/api/v1, worker/api/index.js) and saves what comes back next to the
 * input. The API key is the user's All Access licence key or an abk_live_
 * key from /docs, passed as ASSETBENCH_API_KEY.
 *
 *   claude mcp add assetbench -e ASSETBENCH_API_KEY=... -- npx -y assetbench-mcp
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import JSZip from 'jszip';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const VERSION = '1.0.0';
const API = (process.env.ASSETBENCH_API_URL || 'https://www.assetbench.co.uk').replace(/\/+$/, '');
const KEY = process.env.ASSETBENCH_API_KEY || '';

/** worker/api/gameReady.js and glb.js; kept here so the agent sees the choices up front. */
const ROLES = ['prop', 'vehicle', 'character', 'hero', 'environment'];
const DEVICES = ['low', 'mid', 'high', 'quest'];
const ENGINES = ['unity', 'unreal', 'godot', 'roblox', 'web'];
const SCREENSHOT_DEVICES = ['iphone-6.9', 'iphone-6.5', 'iphone-5.5', 'ipad-13', 'ipad-12.9', 'android-phone', 'android-tablet'];

class ToolError extends Error {}

const filePath = z.string().describe('Path to the input file. Absolute, or relative to the folder the agent was started in.');
const outDir = z.string().optional().describe('Folder to save results in. Defaults to the input file\'s folder.');
const extract = z.boolean().optional().describe('Unzip ZIP results into a folder next to the ZIP (default true).');
const target = z.string().optional().describe('Built-in target (prop, character, scene, quest, web) or plain English, e.g. "Roblox on a low-end Android phone" or "under 5k tris, 512px textures".');
const role = z.enum(ROLES).optional().describe('What the model is in the game.');
const device = z.enum(DEVICES).optional().describe('Weakest device class it must run on.');
const engine = z.enum(ENGINES).optional().describe('Engine the files are for (sets import notes, units and axes).');

async function readInput(path, kinds) {
  const full = resolve(path);
  const ext = extname(full).slice(1).toLowerCase();
  if (kinds && !kinds.includes(ext)) {
    const hint = kinds.includes('glb') && ['fbx', 'obj', 'gltf', 'zip'].includes(ext) ? ' Run convert_model first to turn it into a GLB.' : '';
    throw new ToolError(`${basename(full)} is a .${ext || '?'} file; this tool takes ${kinds.map((k) => `.${k}`).join(', ')}.${hint}`);
  }
  try {
    return { full, name: basename(full), bytes: await readFile(full) };
  } catch (err) {
    throw new ToolError(`Couldn't read ${full}: ${err.code === 'ENOENT' ? 'no such file' : err.message}`);
  }
}

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

async function call(path, { method = 'POST', params = {}, body, headers = {} } = {}) {
  if (!KEY) throw new ToolError('No API key. Set ASSETBENCH_API_KEY to your All Access licence key, or get a free key (100 operations a month) at https://www.assetbench.co.uk/docs/');
  let res;
  try {
    res = await fetch(`${API}/api/v1${path}${query(params)}`, {
      method,
      body,
      headers: { Authorization: `Bearer ${KEY}`, 'User-Agent': `assetbench-mcp/${VERSION}`, ...headers },
    });
  } catch (err) {
    throw new ToolError(`Couldn't reach ${API}: ${err.cause?.message || err.message}`);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new ToolError(`${msg} Check ASSETBENCH_API_KEY.`);
    if (res.status === 429 || res.status === 402) throw new ToolError(`${msg} More operations: https://www.assetbench.co.uk/pricing`);
    throw new ToolError(msg);
  }
  return res;
}

const upload = (input, path, params) => call(path, {
  params,
  body: input.bytes,
  headers: { 'Content-Type': 'application/octet-stream', 'x-filename': input.name },
});

function quotaLine(res) {
  const left = res.headers.get('X-Quota-Remaining');
  const limit = res.headers.get('X-Quota-Limit');
  return left == null ? '' : `Operations left this month: ${left} of ${limit}.`;
}

/** A free name in `dir`: never overwrites the input or an earlier result. */
async function freePath(dir, name) {
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 0; ; i++) {
    const path = join(dir, i ? `${stem}-${i}${ext}` : name);
    try { await access(path); } catch { return path; }
  }
}

async function unzipTo(bytes, dir) {
  const zip = await JSZip.loadAsync(bytes);
  const root = resolve(dir);
  const written = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const dest = resolve(root, entry.name);
    // Never write outside the folder, whatever the ZIP says.
    if (dest !== root && !dest.startsWith(root + sep)) continue;
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, await entry.async('uint8array'));
    written.push(relative(root, dest).split(sep).join('/'));
  }
  return written;
}

/** Saves a file response; unzips ZIPs unless told not to. Returns lines for the tool result. */
async function save(res, input, opts) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `${basename(input.name, extname(input.name))}-assetbench.bin`;
  const dir = resolve(opts.out_dir || dirname(input.full));
  await mkdir(dir, { recursive: true });
  const path = await freePath(dir, name);
  await writeFile(path, bytes);
  const lines = [`Saved ${path} (${(bytes.byteLength / 1024).toFixed(1)} KB).`];
  if (extname(name) === '.zip' && opts.extract !== false) {
    const folder = path.slice(0, -4);
    const files = await unzipTo(bytes, folder);
    lines.push(`Unzipped to ${folder}${sep}: ${files.join(', ')}`);
  }
  const summary = res.headers.get('X-AssetBench-Summary');
  if (summary) lines.push(`Summary: ${summary}`);
  const quota = quotaLine(res);
  if (quota) lines.push(quota);
  return lines;
}

const text = (s) => ({ content: [{ type: 'text', text: s }] });

/** Wraps a handler so expected failures reach the agent as a readable tool error. */
const tool = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err instanceof ToolError ? err.message : `Unexpected error: ${err.message}` }] };
  }
};

/** A tool that uploads one file to `path` and saves the result. */
const fileTool = (path, kinds, paramsOf) => tool(async (args) => {
  const input = await readInput(args.path, kinds);
  const res = await upload(input, path, paramsOf(args));
  return text((await save(res, input, args)).join('\n'));
});

export function createServer() {
  const server = new McpServer({ name: 'assetbench', version: VERSION });

  server.registerTool('check_model', {
    title: 'Check a 3D model',
    description: 'Free. Audits a GLB against phone, Quest and web performance budgets: triangles, draw calls, textures, materials, a 0-100 score, a pass/fail per device class and what to fix first. Use it before and after optimising.',
    inputSchema: { path: filePath, target, role, device, engine },
    annotations: { readOnlyHint: true },
  }, tool(async (args) => {
    const input = await readInput(args.path, ['glb']);
    const res = await upload(input, '/check', { target: args.target, role: args.role, device: args.device, engine: args.engine });
    const report = await res.json();
    delete report.ok;
    return text(JSON.stringify(report, null, 2));
  }));

  server.registerTool('make_game_ready', {
    title: 'Make a model game-ready',
    description: 'The full pipeline in one call: merges draw calls, reduces triangles, fits textures and fixes the pivot for the chosen device and engine, with optional LODs, a collision mesh and KTX2 textures. Saves a ZIP with the GLBs, report.json and engine import notes, and unzips it. 1 operation.',
    inputSchema: {
      path: filePath, target, role, device, engine,
      lods: z.boolean().optional().describe('Include an LOD chain.'),
      collision: z.boolean().optional().describe('Include a simplified collision mesh.'),
      ktx2: z.boolean().optional().describe('Compress textures to KTX2.'),
      out_dir: outDir, extract,
    },
  }, fileTool('/game-ready', ['glb'], (a) => ({ target: a.target, role: a.role, device: a.device, engine: a.engine, lods: a.lods, collision: a.collision, ktx2: a.ktx2 })));

  server.registerTool('make_app_assets', {
    title: 'Make app icon sets',
    description: 'Turns one square image (PNG, JPEG or WebP, 512px or more; 1024px is best) into every iOS, Android and watchOS app icon plus the Play Store icon. Saves and unzips a ZIP with AppIcon.appiconset (drag into Assets.xcassets) and Android mipmaps. 1 operation.',
    inputSchema: {
      path: filePath,
      platforms: z.string().optional().describe('Comma-separated: ios, android, watchos (default all three).'),
      background: z.string().optional().describe('Fill colour behind transparent pixels, e.g. #FFFFFF.'),
      out_dir: outDir, extract,
    },
  }, fileTool('/app-assets', ['png', 'jpg', 'jpeg', 'webp'], (a) => ({ platforms: a.platforms, background: a.background })));

  server.registerTool('make_store_screenshots', {
    title: 'Make store screenshots',
    description: 'Resizes and frames screenshots for every App Store and Google Play device size. Takes up to 50 images (or a ZIP of them). 1 operation for the whole set.',
    inputSchema: {
      paths: z.array(z.string()).min(1).describe('Screenshot images (PNG, JPEG, WebP) or one ZIP of them.'),
      devices: z.array(z.enum(SCREENSHOT_DEVICES)).optional().describe('Store sizes to make (default all).'),
      fit: z.enum(['cover', 'contain']).optional().describe('cover crops to fill; contain letterboxes.'),
      background: z.string().optional().describe('Letterbox colour for contain, e.g. #000000.'),
      out_dir: outDir, extract,
    },
  }, tool(async (args) => {
    const inputs = await Promise.all(args.paths.map((p) => readInput(p, ['png', 'jpg', 'jpeg', 'webp', 'zip'])));
    const form = new FormData();
    for (const input of inputs) form.append('files', new Blob([input.bytes]), input.name);
    const res = await call('/app-assets/screenshots', { params: { devices: args.devices?.join(','), fit: args.fit, background: args.background }, body: form });
    return text((await save(res, inputs[0], args)).join('\n'));
  }));

  server.registerTool('optimize_model', {
    title: 'Optimise a model',
    description: 'Reduces triangles, scales textures down to a power of two and compresses the GLB (Meshopt, optionally KTX2), aiming at a target or explicit limits. Saves a new GLB. 1 operation.',
    inputSchema: {
      path: filePath, target,
      ratio: z.number().min(0.01).max(1).optional().describe('Share of triangles to keep, e.g. 0.5.'),
      triangles: z.number().int().min(4).optional().describe('Triangle count to aim for.'),
      maxTextureSize: z.number().int().optional().describe('Largest texture side in pixels, e.g. 1024.'),
      compress: z.boolean().optional().describe('Meshopt-compress the geometry.'),
      ktx2: z.boolean().optional().describe('Compress textures to KTX2.'),
      out_dir: outDir,
    },
  }, fileTool('/3d/optimize', ['glb'], (a) => ({ target: a.target, ratio: a.ratio, triangles: a.triangles, maxTextureSize: a.maxTextureSize, compress: a.compress, ktx2: a.ktx2 })));

  server.registerTool('reduce_model', {
    title: 'Reduce polygons',
    description: 'Free. Geometry-only polygon reduction of a GLB; textures and materials are left alone. Saves a new GLB.',
    inputSchema: {
      path: filePath,
      ratio: z.number().min(0.01).max(1).optional().describe('Share of triangles to keep, e.g. 0.5.'),
      triangles: z.number().int().min(4).optional().describe('Triangle count to aim for.'),
      error: z.number().min(0.0001).max(1).optional().describe('Largest allowed shape error (relative to model size).'),
      lockBorders: z.boolean().optional().describe('Keep open mesh edges in place.'),
      out_dir: outDir,
    },
  }, fileTool('/3d/reduce', ['glb'], (a) => ({ ratio: a.ratio, triangles: a.triangles, error: a.error, lockBorders: a.lockBorders })));

  server.registerTool('generate_lods', {
    title: 'Generate LODs',
    description: 'Builds a chain of lower-detail GLBs (lod0.glb ... lodN.glb) from one model, with report.json. Saves and unzips a ZIP. 1 operation.',
    inputSchema: {
      path: filePath,
      levels: z.array(z.number().min(0.01).max(1)).optional().describe('Triangle keep ratio per level, e.g. [1, 0.5, 0.25, 0.12].'),
      compress: z.boolean().optional().describe('Meshopt-compress each level.'),
      out_dir: outDir, extract,
    },
  }, fileTool('/3d/lods', ['glb'], (a) => ({ levels: a.levels?.join(','), compress: a.compress })));

  server.registerTool('convert_model', {
    title: 'Convert a 3D model',
    description: 'Converts FBX, OBJ or glTF (or a ZIP of one with its textures) to GLB, or a GLB to glTF or OBJ (as a ZIP). Use it to get a GLB for the other tools. 1 operation.',
    inputSchema: {
      path: filePath,
      to: z.enum(['glb', 'gltf', 'obj']).optional().describe('Output format (default glb, or gltf when the input is already a GLB).'),
      out_dir: outDir, extract,
    },
  }, fileTool('/3d/convert', ['glb', 'gltf', 'obj', 'fbx', 'zip'], (a) => ({ to: a.to })));

  server.registerTool('compress_textures', {
    title: 'Compress textures to KTX2',
    description: 'Encodes an image to a .ktx2 texture, or every texture inside a GLB to KTX2 (saves a new GLB). Cuts GPU memory a lot; ETC1S can soften colour textures, UASTC keeps detail. 1 operation.',
    inputSchema: {
      path: filePath,
      mode: z.enum(['auto', 'etc1s', 'uastc']).optional(),
      maxSize: z.number().int().min(16).max(4096).optional().describe('Largest texture side in pixels.'),
      normalMap: z.boolean().optional().describe('The image is a normal map.'),
      mipmaps: z.boolean().optional(),
      quality: z.number().int().min(1).max(255).optional(),
      out_dir: outDir,
    },
  }, fileTool('/textures/ktx2', ['glb', 'png', 'jpg', 'jpeg', 'webp'], (a) => ({ mode: a.mode, maxSize: a.maxSize, normalMap: a.normalMap, mipmaps: a.mipmaps, quality: a.quality })));

  server.registerTool('resize_texture', {
    title: 'Resize a texture',
    description: 'Resizes and re-encodes a PNG, JPEG or WebP texture, snapping to a power of two by default. 1 operation.',
    inputSchema: {
      path: filePath,
      maxSize: z.number().int().min(16).max(4096).optional().describe('Largest side in pixels (default 1024).'),
      powerOfTwo: z.boolean().optional().describe('Snap to a power of two (default true).'),
      format: z.enum(['png', 'jpeg', 'webp']).optional(),
      quality: z.number().int().min(1).max(100).optional(),
      lossless: z.boolean().optional().describe('Lossless WebP.'),
      out_dir: outDir,
    },
  }, fileTool('/textures/resize', ['png', 'jpg', 'jpeg', 'webp'], (a) => ({ maxSize: a.maxSize, powerOfTwo: a.powerOfTwo, format: a.format, quality: a.quality, lossless: a.lossless })));

  server.registerTool('explain_target', {
    title: 'Explain a target',
    description: 'Free. Turns a plain-English target ("Roblox on a low-end Android phone", "Shopify product viewer") into the exact budgets and settings the other tools will use, and says why.',
    inputSchema: { target: z.string().describe('Where the model has to run, in plain English.') },
    annotations: { readOnlyHint: true },
  }, tool(async ({ target: t }) => {
    const res = await call('/intent', { method: 'GET', params: { target: t } });
    return text(JSON.stringify(await res.json(), null, 2));
  }));

  server.registerTool('account_status', {
    title: 'Account status',
    description: 'Free. The API plan, upload size limit and operations left this month. Check before a big job.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, tool(async () => {
    const res = await call('/auth/me', { method: 'GET' });
    const { plan, quota } = await res.json();
    return text(JSON.stringify({ plan, quota }, null, 2));
  }));

  return server;
}

// Run as a server unless imported (the tests import createServer).
const entry = process.argv[1] && resolve(process.argv[1]);
const self = fileURLToPath(import.meta.url);
if (entry && (entry === self || basename(entry) === 'assetbench-mcp')) {
  await createServer().connect(new StdioServerTransport());
}
