import { ApiError, CORS_HEADERS, errorResponse, fileResponse, json, toBase64 } from './http.js';
import { publicPlans } from './plans.js';
import { assertCanRun, authenticate, chargeOperation, isAdmin, mintKey, quotaStatus, revokeKey } from './keys.js';
import { analyseGlb, evaluate, TARGETS } from './glb.js';
import { compileIntent } from './intent.js';
import { generateLodChain, optimizeGlb } from './mesh.js';
import { buildIconPack } from './icons.js';
import { decodeImage, encodeImage, fitSize, resize } from './images.js';
import JSZip from 'jszip';

/**
 * AssetBench Cloud: /api/v1/*. Graphics for mobile apps, processed on the
 * edge with the same engines the site runs in the browser. See /docs for
 * the interactive reference.
 *
 * Every processing call takes the file as multipart/form-data (field
 * "file", options as other fields) or as the raw request body (options in
 * the query string). Responses are the file itself with a summary in the
 * X-AssetBench-Summary header, or JSON with the file base64-encoded when
 * ?output=json is passed.
 */

const ENDPOINTS = [
  ['GET', '/api/v1/pricing', 'Plans and quotas', false],
  ['GET', '/api/v1/targets', 'Device budgets used by inspect/optimize', false],
  ['GET', '/api/v1/intent?target=...', 'Preview how a plain-English target compiles', false],
  ['POST', '/api/v1/auth/keys', 'Get a free trial key (owner: mint any plan)', false],
  ['GET', '/api/v1/auth/me', 'Your plan and remaining quota', true],
  ['POST', '/api/v1/3d/inspect', 'Mobile-ready report for a GLB (free, no quota)', true],
  ['POST', '/api/v1/3d/optimize', 'Reduce triangles, downscale textures, Meshopt-compress', true],
  ['POST', '/api/v1/3d/lods', 'ZIP of an LOD chain', true],
  ['POST', '/api/v1/2d/app-icons', 'ZIP of iOS / watchOS / Android icon sets', true],
  ['POST', '/api/v1/2d/xcassets', 'Same as app-icons, iOS only by default', true],
  ['POST', '/api/v1/2d/resize', 'Resize a texture to mobile-friendly power-of-two size', true],
];

async function readUpload(request, maxBytes) {
  if (request.method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Use POST with the file in the body.');
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);
  const declared = Number(request.headers.get('Content-Length'));
  if (declared && declared > maxBytes + 64 * 1024) throw tooLarge(maxBytes);

  const type = request.headers.get('Content-Type') || '';
  let bytes;
  let filename = params.filename || request.headers.get('x-filename') || null;
  if (type.startsWith('multipart/form-data')) {
    const form = await request.formData();
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') params[k] = v;
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new ApiError(400, 'missing_file', 'Attach the file in a form field named "file".');
    bytes = new Uint8Array(await file.arrayBuffer());
    filename = filename || file.name || null;
  } else {
    bytes = new Uint8Array(await request.arrayBuffer());
  }
  if (!bytes.byteLength) throw new ApiError(400, 'missing_file', 'The request body is empty. Send the file as the body or as multipart field "file".');
  if (bytes.byteLength > maxBytes) throw tooLarge(maxBytes);
  return { bytes, params, filename };
}

const tooLarge = (maxBytes) => new ApiError(413, 'file_too_large', `Files on your plan are limited to ${Math.round(maxBytes / 1048576)} MB.`);

function baseName(filename, fallback) {
  const name = String(filename || fallback).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  return name.replace(/[^\w.-]+/g, '_').slice(0, 80) || fallback;
}

function respond({ output, filename, contentType, summary, report, quota, params }) {
  if (params.output === 'json') {
    return json({ ok: true, report, quota, file: { name: filename, contentType, bytes: output.byteLength, base64: toBase64(output) } });
  }
  return fileResponse(output, { filename, contentType, summary, quota });
}

/** Runs a quota-metered operation: auth, plan/quota check, work, charge. */
async function metered(request, env, engine, work) {
  const account = await authenticate(request, env);
  await assertCanRun(env, account, engine);
  const upload = await readUpload(request, account.plan.maxUploadMB * 1048576);
  const result = await work(upload);
  const quota = await chargeOperation(env, account);
  return respond({ ...result, quota, params: upload.params });
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  if (path === '/api/v1' && method === 'GET') {
    return json({
      name: 'AssetBench Cloud API',
      version: 'v1',
      docs: `${url.origin}/docs/`,
      auth: 'Authorization: Bearer abk_live_...',
      endpoints: ENDPOINTS.map(([m, p, d, auth]) => ({ method: m, path: p, description: d, auth })),
    });
  }
  if (path === '/api/v1/pricing' && method === 'GET') return json({ currency: 'GBP', plans: publicPlans() });
  if (path === '/api/v1/targets' && method === 'GET') return json({ targets: TARGETS });
  if (path === '/api/v1/intent') {
    const body = method === 'POST' ? await request.json().catch(() => ({})) : {};
    return json(compileIntent(body.target ?? url.searchParams.get('target') ?? ''));
  }

  if (path === '/api/v1/auth/keys') {
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return json({ ok: true, ...(await mintKey(request, env, body)), note: 'Store this key now; it is not shown again.' }, 201);
    }
    if (method === 'DELETE') {
      if (!(await isAdmin(request, env))) throw new ApiError(401, 'unauthorized', 'Owner key required.');
      const body = await request.json().catch(() => ({}));
      return json({ ok: true, ...(await revokeKey(env, body.key ?? body.keyHash)) });
    }
  }
  if (path === '/api/v1/auth/me' && method === 'GET') {
    const account = await authenticate(request, env);
    const { name, engines, maxUploadMB } = account.plan;
    return json({ ok: true, plan: { id: account.plan.id, name, engines, maxUploadMB }, label: account.record.label, createdAt: account.record.createdAt, quota: await quotaStatus(env, account) });
  }

  if (path === '/api/v1/3d/inspect') {
    // Inspection is read-only and cheap, so it needs a key but costs no quota.
    const account = await authenticate(request, env);
    if (!account.plan.engines.includes('3d')) throw new ApiError(403, 'engine_not_in_plan', `Your ${account.plan.name} plan does not include the 3D engine.`);
    const { bytes, params } = await readUpload(request, account.plan.maxUploadMB * 1048576);
    const stats = analyseGlb(bytes);
    const target = params.target && TARGETS[params.target] ? params.target : compileIntent(params.target || '').target;
    return json({ ok: true, stats, evaluation: evaluate(stats, target) });
  }

  if (path === '/api/v1/3d/optimize') {
    return metered(request, env, '3d', async ({ bytes, params, filename }) => {
      const { output, report } = await optimizeGlb(bytes, params);
      return {
        output,
        report,
        filename: `${baseName(filename, 'model')}-optimised.glb`,
        contentType: 'model/gltf-binary',
        summary: {
          target: report.settings.target,
          trianglesBefore: report.before.stats.triangles,
          trianglesAfter: report.after.stats.triangles,
          bytesBefore: report.before.stats.fileBytes,
          bytesAfter: report.after.stats.fileBytes,
          scoreBefore: report.before.evaluation.score,
          scoreAfter: report.after.evaluation.score,
          verdict: report.after.evaluation.verdict,
          warnings: report.warnings.length,
        },
      };
    });
  }

  if (path === '/api/v1/3d/lods') {
    return metered(request, env, '3d', async ({ bytes, params, filename }) => {
      const { levels, report } = await generateLodChain(bytes, params);
      const zip = new JSZip();
      for (const level of levels) zip.file(level.file, level.output);
      zip.file('report.json', JSON.stringify(report, null, 2));
      const output = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
      return {
        output,
        report,
        filename: `${baseName(filename, 'model')}-lods.zip`,
        contentType: 'application/zip',
        summary: { levels: report.levels.map((l) => ({ file: l.file, keep: l.keep, triangles: l.triangles })), warnings: report.warnings.length },
      };
    });
  }

  if (path === '/api/v1/2d/app-icons' || path === '/api/v1/2d/xcassets') {
    const xcassets = path.endsWith('xcassets');
    return metered(request, env, '2d', async ({ bytes, params, filename }) => {
      const { output, report } = await buildIconPack(bytes, { ...params, platforms: params.platforms || (xcassets ? 'ios' : undefined) });
      return {
        output,
        report,
        filename: `${baseName(filename, 'app')}-${xcassets ? 'xcassets' : 'icons'}.zip`,
        contentType: 'application/zip',
        summary: { platforms: report.platforms, files: report.fileCount, warnings: report.warnings.length },
      };
    });
  }

  if (path === '/api/v1/2d/resize') {
    return metered(request, env, '2d', async ({ bytes, params, filename }) => {
      const maxSize = Number(params.maxSize || 1024);
      if (!Number.isInteger(maxSize) || maxSize < 16 || maxSize > 4096) throw new ApiError(400, 'invalid_max_size', 'maxSize must be a whole number from 16 to 4096.');
      const powerOfTwo = !['false', '0', 'no'].includes(String(params.powerOfTwo ?? 'true').toLowerCase());
      const image = decodeImage(bytes);
      const format = params.format ? `image/${params.format.toLowerCase().replace('jpg', 'jpeg')}` : image.mime;
      if (format !== 'image/png' && format !== 'image/jpeg') throw new ApiError(400, 'invalid_format', 'format must be png or jpeg.');
      const size = fitSize(image.width, image.height, maxSize, powerOfTwo);
      const output = encodeImage(resize(image, size.width, size.height), format, { quality: Number(params.quality) || 88 });
      const report = { from: { width: image.width, height: image.height, bytes: bytes.byteLength }, to: { ...size, bytes: output.byteLength, format }, powerOfTwo };
      return {
        output,
        report,
        filename: `${baseName(filename, 'texture')}-${size.width}x${size.height}.${format === 'image/png' ? 'png' : 'jpg'}`,
        contentType: format,
        summary: report,
      };
    });
  }

  throw new ApiError(404, 'not_found', `No endpoint ${method} ${path}. See GET /api/v1 for the list.`);
}

export async function handleApiV1(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  try {
    return await route(request, env);
  } catch (err) {
    return errorResponse(err);
  }
}
