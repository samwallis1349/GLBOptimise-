import JSZip from 'jszip';
import { ApiError, CORS_HEADERS, errorResponse, fileResponse, json, toBase64 } from './http.js';
import { PRODUCTS, publicPlans } from './plans.js';
import { assertCanRun, authenticate, chargeOperation, isAdmin, mintKey, quotaStatus, revokeKey } from './keys.js';
import { analyseGlb, evaluate, readDocument, TARGETS, writeDocument } from './glb.js';
import { compileIntent } from './intent.js';
import { generateLodChain, optimizeGlb } from './mesh.js';
import { buildIconPack } from './icons.js';
import { DEVICES, ENGINES, ROLES, budgetFor, deviceMatrix, gameReady } from './gameReady.js';
import { decodeImage, encodeImage, fitSize, resize, sniffImage } from './images.js';
import { convert, CONVERSIONS } from './convert.js';
import { buildScreenshots, SCREENSHOT_SIZES } from './screenshots.js';
import { bump, PAGE_EVENTS, readStats } from './stats.js';

/**
 * AssetBench Cloud: /api/v1/*. Seven products on one key (see PRODUCTS in
 * plans.js), processed on the edge with the same engines the site runs in
 * the browser. /docs is the interactive reference.
 *
 * Processing calls take the file as multipart/form-data (field "file",
 * options as other fields) or as the raw body (options in the query
 * string). Responses are the file itself with a summary in the
 * X-AssetBench-Summary header, or JSON with the file base64-encoded when
 * ?output=json is passed. Every operation is also available to /batch.
 */

const baseName = (filename, fallback) => String(filename || fallback).split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || fallback;
const bool = (v, fallback) => (v === undefined || v === '' ? fallback : !['false', '0', 'no', 'off'].includes(String(v).toLowerCase()));

async function zipOf(entries, extra = {}) {
  const zip = new JSZip();
  for (const [path, data] of Object.entries(entries)) zip.file(path, data);
  for (const [path, data] of Object.entries(extra)) zip.file(path, data);
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

/**
 * Every metered operation: engine ('2d', '3d' or 'any'), and run(bytes,
 * params, filename) -> { output, filename, contentType, summary, report }.
 * `free` operations need a key but cost no quota.
 */
const OPERATIONS = {
  audit: {
    engine: '3d',
    free: true,
    json: true,
    async run(bytes, params) {
      const stats = analyseGlb(bytes);
      const target = TARGETS[params.target] ? params.target : compileIntent(params.target || '').target;
      const role = ROLES[params.role] ? params.role : 'prop';
      return { report: { stats, evaluation: evaluate(stats, target), devices: { role, results: deviceMatrix(stats, role, ENGINES[params.engine] ? params.engine : 'unity') } } };
    },
  },

  optimize: {
    engine: '3d',
    async run(bytes, params, filename) {
      const { output, report } = await optimizeGlb(bytes, params);
      if (bool(params.ktx2, false)) {
        const { texturesToKtx2 } = await import('./ktx2.js');
        const document = await readDocument(output);
        report.ktx2 = await texturesToKtx2(document, { mode: params.ktx2Mode || 'auto', warnings: report.warnings });
        const out = await writeDocument(document);
        report.after.stats = analyseGlb(out);
        return pack(out, report, filename);
      }
      return pack(output, report, filename);
      function pack(out, rep, name) {
        return {
          output: out,
          report: rep,
          filename: `${baseName(name, 'model')}-optimised.glb`,
          contentType: 'model/gltf-binary',
          summary: {
            target: rep.settings.target,
            trianglesBefore: rep.before.stats.triangles,
            trianglesAfter: rep.after.stats.triangles,
            bytesBefore: rep.before.stats.fileBytes,
            bytesAfter: out.byteLength,
            scoreBefore: rep.before.evaluation.score,
            scoreAfter: rep.after.evaluation.score,
            verdict: rep.after.evaluation.verdict,
            warnings: rep.warnings.length,
          },
        };
      }
    },
  },

  'game-ready': {
    engine: '3d',
    async run(bytes, params, filename) {
      const { files, report, text, importNotes } = await gameReady(bytes, params, filename);
      const entries = Object.fromEntries(files.map((f) => [f.file, f.output]));
      const output = await zipOf(entries, { 'REPORT.txt': text, [`IMPORT-${report.engine.toUpperCase()}.md`]: importNotes, 'report.json': JSON.stringify(report, null, 2) });
      return {
        output,
        report: { ...report, text, importNotes },
        filename: `${report.asset}-${report.device}-${report.engine}.zip`,
        contentType: 'application/zip',
        summary: {
          role: report.role, device: report.device, engine: report.engine,
          trianglesBefore: report.before.stats.triangles, trianglesAfter: report.after.stats.triangles,
          drawCallsBefore: report.before.stats.drawCalls, drawCallsAfter: report.after.stats.drawCalls,
          scoreBefore: report.before.evaluation.score, scoreAfter: report.after.evaluation.score,
          verdict: report.after.evaluation.verdict, files: report.files.map((f) => f.file), warnings: report.warnings.length,
        },
      };
    },
  },

  lods: {
    engine: '3d',
    async run(bytes, params, filename) {
      const { levels, report } = await generateLodChain(bytes, params);
      const output = await zipOf(Object.fromEntries(levels.map((l) => [l.file, l.output])), { 'report.json': JSON.stringify(report, null, 2) });
      return {
        output, report, filename: `${baseName(filename, 'model')}-lods.zip`, contentType: 'application/zip',
        summary: { levels: report.levels.map((l) => ({ file: l.file, keep: l.keep, triangles: l.triangles })), warnings: report.warnings.length },
      };
    },
  },

  convert: {
    engine: '3d',
    async run(bytes, params, filename) {
      const r = await convert(bytes, params, filename);
      const report = { from: r.from, to: r.to, bytesIn: bytes.byteLength, bytesOut: r.output.byteLength, warnings: r.warnings, ...(r.info ? { info: r.info } : {}) };
      if (r.ext === 'glb') {
        const s = analyseGlb(r.output);
        report.stats = { triangles: s.triangles, meshes: s.meshCount, materials: s.materials, textures: s.textures.length, animations: s.animations, skins: s.skins };
      }
      return { output: r.output, report, filename: r.filename, contentType: r.type, summary: { from: r.from, to: r.to, bytesOut: r.output.byteLength, warnings: r.warnings.length } };
    },
  },

  ktx2: {
    engine: 'any',
    async run(bytes, params, filename) {
      const { encodeKtx2, texturesToKtx2 } = await import('./ktx2.js');
      const maxSize = params.maxSize ? Number(params.maxSize) : 0;
      if (maxSize && !(Number.isInteger(maxSize) && maxSize >= 16 && maxSize <= 4096)) throw new ApiError(400, 'invalid_max_size', 'maxSize must be a whole number from 16 to 4096.');
      const isGlb = bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
      if (isGlb) {
        const document = await readDocument(bytes);
        const warnings = [];
        const textures = await texturesToKtx2(document, { mode: params.mode || 'auto', maxSize, warnings });
        const output = await writeDocument(document);
        const report = { kind: 'glb', textures, bytesBefore: bytes.byteLength, bytesAfter: output.byteLength, warnings };
        return { output, report, filename: `${baseName(filename, 'model')}-ktx2.glb`, contentType: 'model/gltf-binary', summary: { textures: textures.length, bytesBefore: bytes.byteLength, bytesAfter: output.byteLength, warnings: warnings.length } };
      }
      const info = sniffImage(bytes);
      if (!info || !['image/png', 'image/jpeg'].includes(info.mime)) throw new ApiError(415, 'unsupported_input', 'Send a PNG, JPEG or GLB.');
      const mode = params.mode && params.mode !== 'auto' ? params.mode : bool(params.normalMap, false) ? 'uastc' : 'etc1s';
      const r = await encodeKtx2(bytes, { mode, normalMap: bool(params.normalMap, false), srgb: !bool(params.linear, bool(params.normalMap, false)), mipmaps: bool(params.mipmaps, true), quality: params.quality ? Number(params.quality) : undefined, maxSize });
      const report = { kind: 'image', mode, width: r.width, height: r.height, mipmaps: bool(params.mipmaps, true), bytesBefore: bytes.byteLength, bytesAfter: r.bytes.byteLength, gpuMemoryBytes: Math.round(r.width * r.height * (mode === 'uastc' ? 1 : 0.5) * (bool(params.mipmaps, true) ? 4 / 3 : 1)) };
      return { output: r.bytes, report, filename: `${baseName(filename, 'texture')}.ktx2`, contentType: 'image/ktx2', summary: report };
    },
  },

  resize: {
    engine: 'any',
    async run(bytes, params, filename) {
      const maxSize = Number(params.maxSize || 1024);
      if (!Number.isInteger(maxSize) || maxSize < 16 || maxSize > 4096) throw new ApiError(400, 'invalid_max_size', 'maxSize must be a whole number from 16 to 4096.');
      const powerOfTwo = bool(params.powerOfTwo, true);
      const image = decodeImage(bytes);
      const format = params.format ? `image/${params.format.toLowerCase().replace('jpg', 'jpeg')}` : image.mime;
      if (format !== 'image/png' && format !== 'image/jpeg') throw new ApiError(400, 'invalid_format', 'format must be png or jpeg.');
      const size = fitSize(image.width, image.height, maxSize, powerOfTwo);
      const output = encodeImage(resize(image, size.width, size.height), format, { quality: Number(params.quality) || 88 });
      const report = { from: { width: image.width, height: image.height, bytes: bytes.byteLength }, to: { ...size, bytes: output.byteLength, format }, powerOfTwo };
      return { output, report, filename: `${baseName(filename, 'texture')}-${size.width}x${size.height}.${format === 'image/png' ? 'png' : 'jpg'}`, contentType: format, summary: report };
    },
  },

  'app-icons': {
    engine: '2d',
    async run(bytes, params, filename) {
      const { output, report } = await buildIconPack(bytes, params);
      return { output, report, filename: `${baseName(filename, 'app')}-icons.zip`, contentType: 'application/zip', summary: { platforms: report.platforms, files: report.fileCount, warnings: report.warnings.length } };
    },
  },

  xcassets: {
    engine: '2d',
    async run(bytes, params, filename) {
      const { output, report } = await buildIconPack(bytes, { ...params, platforms: params.platforms || 'ios' });
      return { output, report, filename: `${baseName(filename, 'app')}-xcassets.zip`, contentType: 'application/zip', summary: { platforms: report.platforms, files: report.fileCount, warnings: report.warnings.length } };
    },
  },
};

// Path -> operation. The short /2d and /3d paths from the first release stay as aliases.
const ROUTES = {
  '/api/v1/3d/audit': 'audit',
  '/api/v1/3d/inspect': 'audit',
  '/api/v1/3d/optimize': 'optimize',
  '/api/v1/3d/game-ready': 'game-ready',
  '/api/v1/3d/lods': 'lods',
  '/api/v1/3d/convert': 'convert',
  '/api/v1/textures/ktx2': 'ktx2',
  '/api/v1/textures/resize': 'resize',
  '/api/v1/2d/resize': 'resize',
  '/api/v1/ios/app-icons': 'app-icons',
  '/api/v1/2d/app-icons': 'app-icons',
  '/api/v1/ios/xcassets': 'xcassets',
  '/api/v1/2d/xcassets': 'xcassets',
};

const tooLarge = (maxBytes) => new ApiError(413, 'file_too_large', `Uploads on your plan are limited to ${Math.round(maxBytes / 1048576)} MB.`);

/** Reads every uploaded file (multipart fields "file"/"files", or the raw body) plus options. */
async function readUploads(request, maxBytes) {
  if (request.method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Use POST with the file in the body.');
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);
  const declared = Number(request.headers.get('Content-Length'));
  if (declared && declared > maxBytes + 64 * 1024) throw tooLarge(maxBytes);
  const files = [];
  const type = request.headers.get('Content-Type') || '';
  if (type.startsWith('multipart/form-data')) {
    const form = await request.formData();
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') params[k] = v;
      else if (k === 'file' || k === 'files') files.push({ bytes: new Uint8Array(await v.arrayBuffer()), filename: v.name || null });
    }
    if (!files.length) throw new ApiError(400, 'missing_file', 'Attach the file in a form field named "file".');
  } else {
    const bytes = new Uint8Array(await request.arrayBuffer());
    files.push({ bytes, filename: params.filename || request.headers.get('x-filename') || null });
  }
  if (files.some((f) => !f.bytes.byteLength)) throw new ApiError(400, 'missing_file', 'The upload is empty. Send the file as the body or as multipart field "file".');
  if (files.reduce((t, f) => t + f.bytes.byteLength, 0) > maxBytes) throw tooLarge(maxBytes);
  return { files, params };
}

function respond({ output, filename, contentType, summary, report, quota, params, jsonOnly }) {
  if (jsonOnly) return json({ ok: true, ...report, ...(quota ? { quota } : {}) });
  if (params.output === 'json') return json({ ok: true, report, quota, file: { name: filename, contentType, bytes: output.byteLength, base64: toBase64(output) } });
  return fileResponse(output, { filename, contentType, summary, quota });
}

async function runSingle(request, env, opName, track) {
  const op = OPERATIONS[opName];
  const account = await authenticate(request, env);
  if (op.free) {
    if (op.engine !== 'any' && !account.plan.engines.includes(op.engine)) throw new ApiError(403, 'engine_not_in_plan', `Your ${account.plan.name} plan does not include the ${op.engine.toUpperCase()} engine.`);
  } else {
    await assertCanRun(env, account, op.engine);
  }
  const { files, params } = await readUploads(request, account.plan.maxUploadMB * 1048576);
  const result = await op.run(files[0].bytes, params, files[0].filename);
  track(`op:${opName}`);
  const quota = op.free ? undefined : await chargeOperation(env, account);
  return respond({ ...result, quota, params, jsonOnly: op.json });
}

async function runScreenshots(request, env, track) {
  const account = await authenticate(request, env);
  await assertCanRun(env, account, '2d');
  const { files, params } = await readUploads(request, account.plan.maxUploadMB * 1048576);
  let inputs = files;
  if (files.length === 1 && files[0].bytes[0] === 0x50 && files[0].bytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(files[0].bytes);
    inputs = [];
    for (const f of Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!f.dir && /\.(png|jpe?g)$/i.test(f.name) && !f.name.startsWith('__MACOSX/')) inputs.push({ bytes: await f.async('uint8array'), filename: f.name });
    }
  }
  const { output, report } = await buildScreenshots(inputs, params);
  track('op:screenshots');
  const quota = await chargeOperation(env, account);
  return respond({ output, report, quota, params, filename: 'store-screenshots.zip', contentType: 'application/zip', summary: { devices: report.devices.map((d) => d.id), images: report.files.length, warnings: report.warnings.length } });
}

const BATCH_MAX_FILES = 50;
const BATCH_EXT = /\.(glb|gltf|obj|fbx|png|jpe?g)$/i;

/**
 * Runs one operation over many files: several multipart "files" fields or
 * one ZIP. Each file is charged as one operation (audit is free), results
 * land in results/<name>/, and manifest.json reports every file's outcome.
 * A failure on one file never stops the others.
 */
async function runBatch(request, env, track) {
  const account = await authenticate(request, env);
  const { files, params } = await readUploads(request, account.plan.batchMaxMB * 1048576);
  const opName = String(params.operation || '');
  const op = OPERATIONS[opName];
  if (!op) throw new ApiError(400, 'invalid_operation', `operation must be one of: ${Object.keys(OPERATIONS).join(', ')}.`);

  let items = files;
  if (files.length === 1 && files[0].bytes[0] === 0x50 && files[0].bytes[1] === 0x4b && opName !== 'convert') {
    const zip = await JSZip.loadAsync(files[0].bytes).catch(() => { throw new ApiError(422, 'unreadable_zip', 'The ZIP could not be opened.'); });
    items = [];
    for (const f of Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!f.dir && BATCH_EXT.test(f.name) && !f.name.startsWith('__MACOSX/')) items.push({ bytes: await f.async('uint8array'), filename: f.name });
    }
  }
  if (!items.length) throw new ApiError(400, 'empty_batch', 'No processable files found (GLB, glTF, OBJ, FBX, PNG or JPEG).');
  if (items.length > BATCH_MAX_FILES) throw new ApiError(400, 'batch_too_large', `A batch can hold up to ${BATCH_MAX_FILES} files; split larger jobs across several requests.`);

  if (op.engine !== 'any' && !account.plan.engines.includes(op.engine)) throw new ApiError(403, 'engine_not_in_plan', `Your ${account.plan.name} plan does not include the ${op.engine.toUpperCase()} engine.`);
  if (!op.free) {
    const quota = await quotaStatus(env, account);
    if (quota.remaining < items.length) throw new ApiError(429, 'quota_exhausted', `This batch needs ${items.length} operations but ${quota.remaining} remain.`, quota);
  }

  const zip = new JSZip();
  const manifest = [];
  const used = new Set();
  let ok = 0;
  for (const item of items) {
    let folder = baseName(item.filename, 'file');
    for (let n = 2; used.has(folder); n += 1) folder = `${baseName(item.filename, 'file')}_${n}`;
    used.add(folder);
    const started = Date.now();
    try {
      const result = await op.run(item.bytes, params, item.filename);
      if (result.output) zip.file(`results/${folder}/${result.filename}`, result.output);
      zip.file(`results/${folder}/report.json`, JSON.stringify(result.report, null, 2));
      manifest.push({ file: item.filename, status: 'ok', output: result.output ? `results/${folder}/${result.filename}` : null, summary: result.summary ?? summarizeAudit(result.report), ms: Date.now() - started });
      ok += 1;
    } catch (err) {
      manifest.push({ file: item.filename, status: 'error', error: err instanceof ApiError ? { code: err.code, message: err.message } : { code: 'internal_error', message: 'Processing failed.' }, ms: Date.now() - started });
    }
  }
  track('op:batch');
  track('batch_files', ok);
  const quota = op.free || !ok ? await quotaStatus(env, account) : await chargeOperation(env, account, ok);
  const report = { operation: opName, total: items.length, succeeded: ok, failed: items.length - ok, charged: op.free ? 0 : ok, files: manifest };
  zip.file('manifest.json', JSON.stringify(report, null, 2));
  if (op.json) return json({ ok: true, ...report, quota });
  const output = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  return respond({ output, report, quota, params, filename: `batch-${opName}.zip`, contentType: 'application/zip', summary: { operation: opName, total: items.length, succeeded: ok, failed: items.length - ok } });
}

function summarizeAudit(report) {
  if (!report?.evaluation) return null;
  return { triangles: report.stats.triangles, score: report.evaluation.score, verdict: report.evaluation.verdict };
}

async function route(request, env, track) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  if (path === '/api/v1' && method === 'GET') {
    return json({ name: 'AssetBench Cloud API', version: 'v1', docs: `${url.origin}/docs/`, auth: 'Authorization: Bearer abk_live_...', products: PRODUCTS });
  }
  if (path === '/api/v1/pricing' && method === 'GET') return json({ currency: 'GBP', plans: publicPlans(env), products: PRODUCTS });
  if (path === '/api/v1/targets' && method === 'GET') return json({ targets: TARGETS });
  if (path === '/api/v1/formats' && method === 'GET') return json({ conversions: CONVERSIONS, screenshots: SCREENSHOT_SIZES, ktx2Modes: ['auto', 'etc1s', 'uastc'] });
  if (path === '/api/v1/devices' && method === 'GET') {
    return json({
      devices: DEVICES,
      roles: Object.fromEntries(Object.entries(ROLES).map(([id, r]) => [id, { name: r.name, budgets: Object.fromEntries(Object.keys(DEVICES).map((d) => [d, budgetFor(id, d, 'unity')])) }])),
      engines: Object.fromEntries(Object.entries(ENGINES).map(([id, e]) => [id, e.name])),
      note: 'Budgets are AssetBench guidelines for smooth frame rates; your real limits depend on everything else on screen.',
    });
  }
  if (path === '/api/v1/intent') {
    const body = method === 'POST' ? await request.json().catch(() => ({})) : {};
    return json(compileIntent(body.target ?? url.searchParams.get('target') ?? ''));
  }

  if (path === '/api/v1/auth/keys') {
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const minted = await mintKey(request, env, body);
      track(minted.plan === 'trial' ? 'key_issued' : 'key_minted_owner');
      return json({ ok: true, ...minted, note: 'Store this key now; it is not shown again.' }, 201);
    }
    if (method === 'DELETE') {
      if (!(await isAdmin(request, env))) throw new ApiError(401, 'unauthorized', 'Owner key required.');
      const body = await request.json().catch(() => ({}));
      return json({ ok: true, ...(await revokeKey(env, body.key ?? body.keyHash)) });
    }
  }
  if (path === '/api/v1/auth/me' && method === 'GET') {
    const account = await authenticate(request, env);
    const { name, engines, maxUploadMB, batchMaxMB } = account.plan;
    return json({ ok: true, plan: { id: account.plan.id, name, engines, maxUploadMB, batchMaxMB }, label: account.record.label, createdAt: account.record.createdAt, quota: await quotaStatus(env, account) });
  }

  if (path === '/api/v1/track' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!PAGE_EVENTS.has(body?.event)) throw new ApiError(400, 'unknown_event', 'Unknown event.');
    track(body.event);
    return json({ ok: true });
  }
  if (path === '/api/v1/stats' && method === 'GET') {
    if (!(await isAdmin(request, env))) throw new ApiError(401, 'unauthorized', 'Owner key required.');
    const days = Math.min(400, Math.max(1, Number(url.searchParams.get('days')) || 30));
    return json({ ok: true, ...(await readStats(env, days)) });
  }

  if (ROUTES[path]) return runSingle(request, env, ROUTES[path], track);
  if (path === '/api/v1/ios/screenshots') return runScreenshots(request, env, track);
  if (path === '/api/v1/batch') return runBatch(request, env, track);

  throw new ApiError(404, 'not_found', `No endpoint ${method} ${path}. See GET /api/v1 for the list.`);
}

// Counters are written after the response is sent (ctx.waitUntil) so they never slow a request.
export async function handleApiV1(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  const pending = [];
  const track = (metric, by) => { pending.push(bump(env, metric, by)); };
  try {
    return await route(request, env, track);
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) track(`error:${err.code}`);
    return errorResponse(err);
  } finally {
    const all = Promise.all(pending);
    if (ctx?.waitUntil) ctx.waitUntil(all); else await all;
  }
}
