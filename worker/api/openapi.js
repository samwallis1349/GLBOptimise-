import { ADVANCED_ENDPOINTS, PRODUCTS, publicPlans } from './plans.js';
import { TARGETS } from './glb.js';
import { CONVERSIONS } from './convert.js';
import { SCREENSHOT_SIZES } from './screenshots.js';
import { DEVICES, ENGINES, ROLES } from './gameReady.js';

/**
 * Generates the OpenAPI 3.1.0 specification for the AssetBench Cloud API (/api/v1).
 * Served at GET /api/v1/openapi.json so SDK generators, Postman/Insomnia, and AI
 * coding agents can discover every route, parameter, and schema automatically.
 */
export function buildOpenApiSpec(origin = 'https://www.assetbench.co.uk', env = {}) {
  const authSecurity = [{ BearerAuth: [] }, { ApiKeyAuth: [] }];

  const uploadRequestBody = (description, extraProps = {}) => ({
    required: true,
    description: `${description} Send the file as raw binary in the request body, as \`multipart/form-data\` (field \`file\`), or pass a remote \`url\` in query/JSON.`,
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
      'model/gltf-binary': {
        schema: { type: 'string', format: 'binary' },
      },
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary', description: 'Uploaded asset file.' },
            url: { type: 'string', format: 'uri', description: 'Public HTTP(S) URL of the asset to fetch and process.' },
            ...extraProps,
          },
        },
      },
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri', description: 'Public HTTP(S) URL of the asset to fetch and process.' },
            ...extraProps,
          },
        },
      },
    },
  });

  const commonParams = [
    {
      name: 'url',
      in: 'query',
      required: false,
      description: 'Public HTTP(S) URL of the input file (alternative to uploading bytes in the request body).',
      schema: { type: 'string', format: 'uri' },
    },
    {
      name: 'output',
      in: 'query',
      required: false,
      description: 'Pass `json` to receive a JSON envelope containing the full report and base64-encoded output file instead of a binary download.',
      schema: { type: 'string', enum: ['binary', 'json'] },
    },
  ];

  const fileOrJsonResponse = (contentType, description) => ({
    200: {
      description,
      headers: {
        'X-AssetBench-Summary': {
          description: 'Compact JSON summary of before/after metrics.',
          schema: { type: 'string' },
        },
        'X-Quota-Limit': {
          description: 'Monthly operation limit for the authenticated plan.',
          schema: { type: 'integer' },
        },
        'X-Quota-Remaining': {
          description: 'Operations remaining in the current billing period.',
          schema: { type: 'integer' },
        },
        'X-Quota-Reset': {
          description: 'ISO 8601 UTC timestamp when the monthly quota resets.',
          schema: { type: 'string', format: 'date-time' },
        },
      },
      content: {
        [contentType]: { schema: { type: 'string', format: 'binary' } },
        'application/json': { schema: { $ref: '#/components/schemas/ProcessedEnvelope' } },
      },
    },
    400: { $ref: '#/components/responses/ErrorResponse' },
    401: { $ref: '#/components/responses/ErrorResponse' },
    413: { $ref: '#/components/responses/ErrorResponse' },
    415: { $ref: '#/components/responses/ErrorResponse' },
    422: { $ref: '#/components/responses/ErrorResponse' },
    429: { $ref: '#/components/responses/ErrorResponse' },
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'AssetBench Cloud API',
      version: '1.1.0',
      summary: 'Edge 3D & 2D game/app asset optimisation, polygon reduction, KTX2 compression, LOD chains, and store asset generation.',
      description:
        'Process 3D models (GLB, glTF, OBJ, FBX, including Draco- and Meshopt-compressed GLBs) and 2D textures/icons on the edge. ' +
        'Every processing endpoint accepts raw binary uploads, `multipart/form-data` (`file`), or a public asset URL (`?url=https://...` or JSON `{"url": "..."}`).\n\n' +
        'AI agents: the `assetbench-mcp` MCP server (`npx -y assetbench-mcp`, env `ASSETBENCH_API_KEY`) exposes this API as 12 tools for Claude, Cursor, VS Code and other MCP clients, working on local files. ' +
        `Setup: ${origin}/docs/#mcp-h`,
      contact: {
        name: 'AssetBench',
        url: `${origin}/docs/`,
      },
    },
    externalDocs: { description: 'Docs, playground and MCP server setup', url: `${origin}/docs/` },
    'x-mcp-server': { package: 'assetbench-mcp', command: 'npx', args: ['-y', 'assetbench-mcp'], env: ['ASSETBENCH_API_KEY'], docs: `${origin}/docs/#mcp-h` },
    servers: [{ url: origin, description: 'AssetBench Cloud Edge API' }],
    paths: {
      '/api/v1': {
        get: {
          operationId: 'getApiIndex',
          summary: 'API index and discovery metadata',
          responses: { 200: { description: 'API index, products, and documentation links.' } },
        },
      },
      '/api/v1/openapi.json': {
        get: {
          operationId: 'getOpenApiSpec',
          summary: 'OpenAPI 3.1.0 specification',
          responses: { 200: { description: 'OpenAPI 3.1.0 JSON document.' } },
        },
      },
      '/api/v1/pricing': {
        get: {
          operationId: 'getPricing',
          summary: 'List API plans, quotas, and checkout links',
          responses: { 200: { description: 'Active plans and products.' } },
        },
      },
      '/api/v1/targets': {
        get: {
          operationId: 'getTargets',
          summary: 'List built-in 3D performance target budgets',
          responses: { 200: { description: 'Target budgets keyed by id.' } },
        },
      },
      '/api/v1/formats': {
        get: {
          operationId: 'getFormats',
          summary: 'List supported 3D format conversions, screenshot profiles, and KTX2 modes',
          responses: { 200: { description: 'Supported conversions and device sizes.' } },
        },
      },
      '/api/v1/devices': {
        get: {
          operationId: 'getDevices',
          summary: 'List device classes, asset roles, and engine budgets',
          responses: { 200: { description: 'Device classes, roles, and per-device triangle/texture budgets.' } },
        },
      },
      '/api/v1/intent': {
        get: {
          operationId: 'compileIntentGet',
          summary: 'Compile plain-English target description into optimization budgets',
          parameters: [
            { name: 'target', in: 'query', required: true, schema: { type: 'string' }, description: 'Natural language target (e.g. "Roblox on a low-end Android phone").' },
          ],
          responses: { 200: { description: 'Compiled technical budget and settings.' } },
        },
        post: {
          operationId: 'compileIntentPost',
          summary: 'Compile plain-English target description into optimization budgets',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { target: { type: 'string' } } } } },
          },
          responses: { 200: { description: 'Compiled technical budget and settings.' } },
        },
      },
      '/api/v1/auth/keys': {
        post: {
          operationId: 'mintApiKey',
          summary: 'Issue a free trial API key (100 ops/month) or owner-minted plan key',
          responses: { 201: { description: 'Newly minted API key.' } },
        },
        delete: {
          operationId: 'revokeApiKey',
          summary: 'Revoke an API key (owner only)',
          security: authSecurity,
          responses: { 200: { description: 'Key revoked.' } },
        },
      },
      '/api/v1/auth/me': {
        get: {
          operationId: 'getAccountMe',
          summary: 'Inspect current API key plan and remaining monthly quota',
          security: authSecurity,
          responses: { 200: { description: 'Authenticated plan and quota status.' } },
        },
      },
      '/api/v1/check': {
        post: {
          operationId: 'checkModel',
          summary: 'Audit a GLB model against mobile/VR/web performance budgets (Free — 0 quota)',
          security: authSecurity,
          parameters: [
            { name: 'role', in: 'query', schema: { type: 'string', enum: Object.keys(ROLES) } },
            { name: 'device', in: 'query', schema: { type: 'string', enum: Object.keys(DEVICES) } },
            { name: 'engine', in: 'query', schema: { type: 'string', enum: Object.keys(ENGINES) } },
            { name: 'target', in: 'query', schema: { type: 'string' }, description: `Built-in target (${Object.keys(TARGETS).join(', ')}) or plain-English description.` },
            commonParams[0],
          ],
          requestBody: uploadRequestBody('Binary glTF (.glb) to inspect.'),
          responses: {
            200: { description: 'Detailed model audit report, score (0-100), and device pass/fail matrix.' },
            401: { $ref: '#/components/responses/ErrorResponse' },
          },
        },
      },
      '/api/v1/game-ready': {
        post: {
          operationId: 'makeGameReady',
          summary: 'Full mobile game-ready pipeline: draw-call merge, simplify, texture fit, pivot, LODs, collision mesh, and engine notes',
          security: authSecurity,
          parameters: [
            { name: 'role', in: 'query', schema: { type: 'string', enum: Object.keys(ROLES) } },
            { name: 'device', in: 'query', schema: { type: 'string', enum: Object.keys(DEVICES) } },
            { name: 'engine', in: 'query', schema: { type: 'string', enum: Object.keys(ENGINES) } },
            { name: 'lods', in: 'query', schema: { type: 'boolean' } },
            { name: 'collision', in: 'query', schema: { type: 'boolean' } },
            { name: 'ktx2', in: 'query', schema: { type: 'boolean' } },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('Binary glTF (.glb) to make game-ready.'),
          responses: fileOrJsonResponse('application/zip', 'Engine-ready ZIP archive containing LODs, collision mesh, report.json, and engine import guide.'),
        },
      },
      '/api/v1/3d/optimize': {
        post: {
          operationId: 'optimizeGlb',
          summary: 'Optimize a GLB model (polygon reduction, power-of-two texture downscaling, Meshopt/KTX2 compression)',
          security: authSecurity,
          parameters: [
            { name: 'target', in: 'query', schema: { type: 'string' }, description: 'Target preset or plain-English description.' },
            { name: 'ratio', in: 'query', schema: { type: 'number', minimum: 0.01, maximum: 1 } },
            { name: 'triangles', in: 'query', schema: { type: 'integer', minimum: 4 } },
            { name: 'maxTextureSize', in: 'query', schema: { type: 'integer' } },
            { name: 'compress', in: 'query', schema: { type: 'boolean' } },
            { name: 'ktx2', in: 'query', schema: { type: 'boolean' } },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('Binary glTF (.glb) to optimize.'),
          responses: fileOrJsonResponse('model/gltf-binary', 'Optimized .glb binary.'),
        },
      },
      '/api/v1/3d/reduce': {
        post: {
          operationId: 'reduceGlb',
          summary: 'Reduce GLB polygon count using meshoptimizer (Free — 0 quota, geometry only)',
          security: authSecurity,
          parameters: [
            { name: 'ratio', in: 'query', schema: { type: 'number', minimum: 0.01, maximum: 1 } },
            { name: 'triangles', in: 'query', schema: { type: 'integer', minimum: 4 } },
            { name: 'error', in: 'query', schema: { type: 'number', minimum: 0.0001, maximum: 1 } },
            { name: 'lockBorders', in: 'query', schema: { type: 'boolean' } },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('Binary glTF (.glb) whose polygon count should be reduced.'),
          responses: fileOrJsonResponse('model/gltf-binary', 'Polygon-reduced .glb binary.'),
        },
      },
      '/api/v1/3d/lods': {
        post: {
          operationId: 'generateLods',
          summary: 'Generate a discrete LOD chain (lod0.glb ... lodN.glb) in a ZIP archive',
          security: authSecurity,
          parameters: [
            { name: 'levels', in: 'query', schema: { type: 'string' }, description: 'Comma-separated triangle keep ratios (e.g. `1,0.5,0.25,0.12`).' },
            { name: 'compress', in: 'query', schema: { type: 'boolean' } },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('Binary glTF (.glb) to build LOD levels from.'),
          responses: fileOrJsonResponse('application/zip', 'ZIP containing lod0.glb...lodN.glb and report.json.'),
        },
      },
      '/api/v1/3d/convert': {
        post: {
          operationId: 'convertModel',
          summary: 'Convert 3D models between GLB, glTF (ZIP), OBJ (ZIP), and FBX -> GLB',
          security: authSecurity,
          parameters: [
            { name: 'to', in: 'query', schema: { type: 'string', enum: ['glb', 'gltf', 'obj'] }, description: 'Target format (defaults to `glb` when input is glTF/OBJ/FBX, or `gltf` when input is GLB).' },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('3D model file (.glb, .gltf, .obj, .fbx, or .zip).'),
          responses: fileOrJsonResponse('model/gltf-binary', 'Converted .glb or .zip archive.'),
        },
      },
      '/api/v1/textures/ktx2': {
        post: {
          operationId: 'encodeKtx2',
          summary: 'Encode PNG/JPEG/WebP textures or all embedded textures inside a GLB to KTX2 (Basis Universal ETC1S/UASTC)',
          security: authSecurity,
          parameters: [
            { name: 'mode', in: 'query', schema: { type: 'string', enum: ['auto', 'etc1s', 'uastc'] } },
            { name: 'maxSize', in: 'query', schema: { type: 'integer', minimum: 16, maximum: 4096 } },
            { name: 'normalMap', in: 'query', schema: { type: 'boolean' } },
            { name: 'mipmaps', in: 'query', schema: { type: 'boolean' } },
            { name: 'quality', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 255 } },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('PNG, JPEG, WebP image or GLB model.'),
          responses: fileOrJsonResponse('image/ktx2', 'Encoded .ktx2 texture or KTX2-textured .glb.'),
        },
      },
      '/api/v1/textures/resize': {
        post: {
          operationId: 'resizeTexture',
          summary: 'Resize and re-encode PNG/JPEG/WebP textures with optional power-of-two snapping',
          security: authSecurity,
          parameters: [
            { name: 'maxSize', in: 'query', schema: { type: 'integer', minimum: 16, maximum: 4096, default: 1024 } },
            { name: 'powerOfTwo', in: 'query', schema: { type: 'boolean', default: true } },
            { name: 'format', in: 'query', schema: { type: 'string', enum: ['png', 'jpeg', 'webp'] } },
            { name: 'quality', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 88 } },
            { name: 'lossless', in: 'query', schema: { type: 'boolean', default: false } },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('PNG, JPEG, or WebP image.'),
          responses: fileOrJsonResponse('image/png', 'Resized image.'),
        },
      },
      '/api/v1/app-assets': {
        post: {
          operationId: 'buildAppAssets',
          summary: 'Generate iOS, Android, watchOS, and Play Store app icon sets from a single square master image',
          security: authSecurity,
          parameters: [
            { name: 'platforms', in: 'query', schema: { type: 'string', default: 'ios,android,watchos' } },
            { name: 'background', in: 'query', schema: { type: 'string', default: '#FFFFFF' } },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('Square PNG/JPEG/WebP master icon (at least 512x512).'),
          responses: fileOrJsonResponse('application/zip', 'ZIP containing Xcode AppIcon.appiconset and Android mipmap resources.'),
        },
      },
      '/api/v1/app-assets/screenshots': {
        post: {
          operationId: 'buildScreenshots',
          summary: 'Resize and frame screenshots for every App Store and Google Play device size',
          security: authSecurity,
          parameters: [
            { name: 'devices', in: 'query', schema: { type: 'string' }, description: `Comma-separated device ids (${Object.keys(SCREENSHOT_SIZES).join(', ')}).` },
            { name: 'fit', in: 'query', schema: { type: 'string', enum: ['cover', 'contain'], default: 'cover' } },
            { name: 'background', in: 'query', schema: { type: 'string', default: '#000000' } },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('One or more screenshot images or a ZIP of screenshots.'),
          responses: fileOrJsonResponse('application/zip', 'ZIP of resized store screenshots organized by device profile.'),
        },
      },
      '/api/v1/batch': {
        post: {
          operationId: 'runBatch',
          summary: 'Run any operation across up to 50 files (uploaded as multipart files, a ZIP, or URLs)',
          security: authSecurity,
          parameters: [
            {
              name: 'operation',
              in: 'query',
              required: true,
              schema: { type: 'string', enum: ['check', 'audit', 'optimize', 'reduce', 'game-ready', 'lods', 'convert', 'ktx2', 'resize', 'app-icons', 'app-assets', 'xcassets'] },
            },
            ...commonParams,
          ],
          requestBody: uploadRequestBody('ZIP archive, multiple multipart `files` fields, or JSON `{ "urls": [...] }`.'),
          responses: fileOrJsonResponse('application/zip', 'ZIP containing per-file results and manifest.json.'),
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Pass your `abk_live_...` key or Lemon Squeezy licence key in `Authorization: Bearer <key>`.',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Pass your `abk_live_...` key or Lemon Squeezy licence key in the `x-api-key` header.',
        },
      },
      schemas: {
        ProcessedEnvelope: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', const: true },
            report: { type: 'object' },
            quota: {
              type: 'object',
              properties: {
                limit: { type: 'integer' },
                used: { type: 'integer' },
                remaining: { type: 'integer' },
                period: { type: 'string' },
                resetsAt: { type: ['string', 'null'], format: 'date-time' },
              },
            },
            file: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                contentType: { type: 'string' },
                bytes: { type: 'integer' },
                base64: { type: 'string' },
              },
            },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
            },
          },
        },
      },
      responses: {
        ErrorResponse: {
          description: 'Structured API error response.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
          },
        },
      },
    },
    'x-assetbench': {
      products: PRODUCTS,
      advanced: ADVANCED_ENDPOINTS,
      plans: publicPlans(env),
      conversions: CONVERSIONS,
    },
  };
}
