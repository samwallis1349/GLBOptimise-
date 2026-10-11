import { getGLPrimitiveCount, meshopt } from '@gltf-transform/functions';
import { Primitive } from '@gltf-transform/core';
import { MeshoptEncoder } from 'meshoptimizer';
import { reducePolys } from '../../src/tools/reduce-polys/ReducePolysEngine.js';
import { LOD_CHAIN_PRESETS } from '../../src/tools/generate-lods/presets.js';
import { ApiError } from './http.js';
import { analyseGlb, evaluate, readDocument, writeDocument } from './glb.js';
import { compileIntent } from './intent.js';
import { DECODABLE, decodeImage, encodeAnyImage, fitSize, resize } from './images.js';

/**
 * 3D engine for the API. Geometry reduction is the site's own Reduce Polys
 * engine (meshoptimizer via glTF-Transform), imported unchanged; LOD chains
 * re-run it from a fresh parse per level, the same rule Generate LODs uses.
 */

function clampRatio(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1) throw new ApiError(400, 'invalid_ratio', 'ratio must be a number greater than 0 and at most 1 (fraction of triangles to keep).');
  return Math.max(0.01, n);
}

export function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase());
}

/** Explicit flags win over anything compiled from `target`. */
export function resolveSettings(params, beforeStats) {
  const compiled = compileIntent(params.target ?? '');
  const settings = {
    target: compiled.target,
    explanation: compiled.explanation,
    lockBorder: bool(params.lockBorder, compiled.lockBorder),
    compress: bool(params.compress, compiled.compress),
    maxTextureSize: compiled.maxTextureSize,
    ratio: 1,
  };
  if (params.ratio !== undefined && params.ratio !== '') {
    settings.ratio = clampRatio(params.ratio);
    settings.explanation = [...settings.explanation, `Explicit ratio: keep ${Math.round(settings.ratio * 100)}% of triangles.`];
  } else if (beforeStats.triangles > compiled.triangleBudget) {
    settings.ratio = Math.max(0.01, compiled.triangleBudget / beforeStats.triangles);
    settings.explanation = [...settings.explanation, `Model has ${beforeStats.triangles.toLocaleString('en-GB')} triangles, budget ${compiled.triangleBudget.toLocaleString('en-GB')} → keep ${(settings.ratio * 100).toFixed(1)}%.`];
  } else {
    settings.explanation = [...settings.explanation, 'Triangle count is already inside the budget, so geometry is left as is.'];
  }
  if (params.maxTextureSize !== undefined && params.maxTextureSize !== '') {
    const n = Number(params.maxTextureSize);
    if (![0, 128, 256, 512, 1024, 2048, 4096].includes(n)) throw new ApiError(400, 'invalid_max_texture_size', 'maxTextureSize must be one of 0 (leave textures), 128, 256, 512, 1024, 2048, 4096.');
    settings.maxTextureSize = n;
  }
  return settings;
}

/** Downscales embedded PNG/JPEG textures to fit maxSize, snapping to powers of two. */
/** Material slots whose texture is seen as colour; every other slot holds data (normals, roughness, AO…). */
const COLOUR_SLOTS = new Set(['baseColorTexture', 'emissiveTexture', 'sheenColorTexture', 'specularColorTexture', 'diffuseTexture']);

/** Every material slot (core and extension) each texture is used in, read from the property graph. */
export function textureSlots(document) {
  const graph = document.getGraph();
  const slots = new Map();
  for (const texture of document.getRoot().listTextures()) {
    slots.set(texture, new Set(graph.listParentEdges(texture).map((edge) => edge.getName()).filter((name) => /Texture$/.test(name))));
  }
  return slots;
}

/** True when lossy compression would damage the texture: normal or packed data maps. */
export function isDataTexture(slots) {
  return [...slots].some((slot) => !COLOUR_SLOTS.has(slot));
}

/**
 * Shrinks textures to `maxSize` (and to powers of two) in their own format:
 * PNG stays PNG, JPEG stays JPEG, WebP stays WebP. WebP normal and data maps
 * are written lossless, so lighting and packed channels are not damaged.
 */
export async function downscaleTextures(document, maxSize, warnings) {
  const changed = [];
  if (!maxSize) return changed;
  const slots = textureSlots(document);
  for (const texture of document.getRoot().listTextures()) {
    const mime = texture.getMimeType();
    const size = texture.getSize();
    const bytes = texture.getImage();
    if (!size || !bytes) continue;
    const [w, h] = size;
    const npot = (w & (w - 1)) || (h & (h - 1));
    if (Math.max(w, h) <= maxSize && !npot) continue;
    const label = texture.getName() || texture.getURI() || 'unnamed';
    if (!DECODABLE.has(mime)) {
      warnings.push(`Texture "${label}" is ${mime}, which is already GPU-compressed or not supported; it was left at ${w}x${h}.`);
      continue;
    }
    try {
      const target = fitSize(w, h, maxSize, true);
      if (target.width === w && target.height === h) continue;
      const lossless = isDataTexture(slots.get(texture) || new Set());
      const out = await encodeAnyImage(resize(await decodeImage(bytes), target.width, target.height), mime, { lossless });
      texture.setImage(out);
      changed.push({ name: texture.getName() || null, format: mime.replace('image/', ''), from: `${w}x${h}`, to: `${target.width}x${target.height}`, ...(mime === 'image/webp' ? { lossless } : {}) });
    } catch (err) {
      warnings.push(`Texture "${label}" was left unchanged: ${err?.message || 'resize failed'}.`);
    }
  }
  return changed;
}

export async function compressMeshopt(document) {
  await MeshoptEncoder.ready;
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
}

export async function reduce(document, ratio, lockBorder, error = ratio < 0.2 ? 0.05 : 0.01, acrossSeams = false) {
  return reducePolys({ document, ratio, options: { lockBorder, error, cleanup: true, acrossSeams } });
}

export async function optimizeGlb(bytes, params) {
  const before = analyseGlb(bytes);
  const settings = resolveSettings(params, before);
  const document = await readDocument(bytes);
  const warnings = [];
  const steps = [];

  let meshReports = [];
  if (settings.ratio < 0.999 && before.triangles === 0) throw new ApiError(422, 'no_geometry', 'This model contains no triangle geometry to reduce.');
  if (settings.ratio < 0.999) {
    const result = await reduce(document, settings.ratio, settings.lockBorder);
    meshReports = result.meshReports;
    warnings.push(...result.warnings);
    steps.push(`simplify geometry to ${(settings.ratio * 100).toFixed(1)}% (meshoptimizer)`);
  }
  const textures = await downscaleTextures(document, settings.maxTextureSize, warnings);
  if (textures.length) steps.push(`resize ${textures.length} texture(s) to ≤${settings.maxTextureSize}px, power of two`);
  if (settings.compress) {
    await compressMeshopt(document);
    steps.push('Meshopt compression');
  }

  const output = await writeDocument(document);
  await readDocument(output); // the output must re-parse before it is returned
  const after = analyseGlb(output);

  const report = {
    settings,
    steps,
    before: { stats: before, evaluation: evaluate(before, settings.target) },
    after: { stats: after, evaluation: evaluate(after, settings.target) },
    reduction: {
      triangles: before.triangles ? Number((1 - after.triangles / before.triangles).toFixed(4)) : 0,
      fileBytes: before.fileBytes ? Number((1 - after.fileBytes / before.fileBytes).toFixed(4)) : 0,
    },
    textures,
    meshes: meshReports.map(({ name, before: b, after: a, status, reason }) => ({ name, before: b, after: a, status, reason })),
    warnings,
  };
  report.summaryText = auditText(report);
  return { output, report };
}

/**
 * Geometry-only reduction: no texture or compression changes. Keep either a
 * fraction (`ratio`, default 0.5) or a triangle count (`triangles`, which
 * wins when both are sent).
 *
 * meshoptimizer stops early when collapsing more would move the surface
 * further than its error limit. Unless the caller pins `error`, the limit is
 * loosened step by step (re-reducing from the original each time) until the
 * result lands within 10% of the target or the cap (0.1) is reached; beyond
 * that quality drops fast for little gain. If it is still short (usually a
 * mesh with UV seams on most edges), the engine's acrossSeams pass runs from
 * the original — automatically for untextured models, and for textured ones
 * only with acrossSeams=true, since it stretches the texture.
 */
const countTriangles = (document) => document.getRoot().listMeshes()
  .flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getMode() === Primitive.Mode.TRIANGLES ? getGLPrimitiveCount(p) : 0), 0);

const REDUCE_ERROR_STEPS = [0.01, 0.05, 0.1];

export async function reduceGlb(bytes, params) {
  const before = analyseGlb(bytes);
  if (!before.triangles) throw new ApiError(422, 'no_geometry', 'This model contains no triangle geometry to reduce.');

  let ratio = 0.5;
  let targetTriangles = null;
  if (params.triangles !== undefined && params.triangles !== '') {
    targetTriangles = Number(params.triangles);
    if (!Number.isInteger(targetTriangles) || targetTriangles <= 0) {
      throw new ApiError(400, 'invalid_triangles', 'triangles must be a whole number greater than 0.');
    }
    ratio = Math.max(0.01, Math.min(1, targetTriangles / before.triangles));
  } else if (params.ratio !== undefined && params.ratio !== '') {
    ratio = clampRatio(params.ratio);
  }
  const lockBorder = bool(params.lockBorder, false);
  // Collapsing across UV seams streaks textures (checked visually on real
  // assets), so by default it only runs on untextured models.
  const textured = before.textures.length > 0;
  const acrossSeams = params.acrossSeams === undefined || params.acrossSeams === '' || params.acrossSeams === 'auto'
    ? !textured
    : bool(params.acrossSeams, false);

  let errorSteps = REDUCE_ERROR_STEPS.filter((e) => e >= (ratio < 0.2 ? 0.05 : 0.01));
  if (params.error !== undefined && params.error !== '') {
    const e = Number(params.error);
    if (!Number.isFinite(e) || e <= 0 || e > 1) throw new ApiError(400, 'invalid_error', 'error must be a number greater than 0 and at most 1 (max surface deviation as a fraction of mesh size).');
    errorSteps = [e];
  }

  const goal = Math.ceil(before.triangles * ratio * 1.1);
  const warnings = [];
  let meshReports = [];
  let output;
  let after;
  let errorUsed = null;
  let seamMode = false;
  if (ratio >= 0.999) {
    warnings.push('Model is already at or under the requested triangle count; geometry left unchanged.');
    output = await writeDocument(await readDocument(bytes));
    after = analyseGlb(output);
  } else {
    let lastWarnings = [];
    for (const error of errorSteps) {
      const document = await readDocument(bytes);
      const result = await reduce(document, ratio, lockBorder, error);
      output = await writeDocument(document);
      after = analyseGlb(output);
      meshReports = result.meshReports;
      lastWarnings = result.warnings;
      errorUsed = error;
      if (after.triangles <= goal) break;
    }
    if (after.triangles > goal && !lockBorder && acrossSeams) {
      // Still short: try collapsing across UV seams (engine option acrossSeams),
      // again with the tightest error limit that reaches the target.
      let best = null;
      for (const error of errorSteps) {
        const document = await readDocument(bytes);
        await reduce(document, ratio, false, error, true);
        const triangles = countTriangles(document);
        if (!best || triangles < best.triangles) best = { document, triangles, error };
        if (triangles <= goal) break;
      }
      if (best.triangles < after.triangles) {
        output = await writeDocument(best.document);
        after = analyseGlb(output);
        errorUsed = best.error;
        seamMode = true;
        lastWarnings = lastWarnings.filter((w) => !w.startsWith('Geometry could not be reduced'));
        meshReports = [];
        if (after.triangles > goal) lastWarnings.push(`Reduced to ${after.triangles.toLocaleString('en-GB')} triangles; the mesh could not go further without visible damage.`);
      }
    }
    if (after.triangles > goal && !seamMode && textured && !lockBorder) {
      lastWarnings.push('This model has UV seams on most edges, so it cannot go lower without smearing its texture. Pass acrossSeams=true to force it (fine for collision, distant LODs or re-texturing).');
    }
    warnings.push(...lastWarnings);
    if (errorUsed > errorSteps[0]) warnings.push(`Error limit raised to ${errorUsed} to reach the target; check fine detail. Pass error= to cap it.`);
    if (seamMode && textured) warnings.push('Collapsed across UV seams to reach the target, so the texture will be stretched in places.');
  }
  await readDocument(output); // the output must re-parse before it is returned

  return {
    output,
    report: {
      settings: { ratio: Number(ratio.toFixed(4)), targetTriangles, lockBorder, error: errorUsed, acrossSeams: seamMode },
      before: { triangles: before.triangles, fileBytes: before.fileBytes },
      after: { triangles: after.triangles, fileBytes: output.byteLength },
      reduction: {
        triangles: Number((1 - after.triangles / before.triangles).toFixed(4)),
        fileBytes: before.fileBytes ? Number((1 - output.byteLength / before.fileBytes).toFixed(4)) : 0,
      },
      meshes: meshReports.map(({ name, before: b, after: a, status, reason }) => ({ name, before: b, after: a, status, reason })),
      warnings,
    },
  };
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const mb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Plain-text performance certificate for client deliverables. */
export function auditText(report) {
  const { before, after, settings } = report;
  const lines = [
    `AssetBench Cloud performance report: ${after.evaluation.targetName}`,
    '',
    `Triangles   ${before.stats.triangles.toLocaleString('en-GB').padStart(12)}  →  ${after.stats.triangles.toLocaleString('en-GB').padStart(12)}   (${pct(report.reduction.triangles)} fewer)`,
    `File size   ${mb(before.stats.fileBytes).padStart(12)}  →  ${mb(after.stats.fileBytes).padStart(12)}   (${pct(report.reduction.fileBytes)} smaller)`,
    `Texture mem ${mb(before.stats.textureMemoryBytes).padStart(12)}  →  ${mb(after.stats.textureMemoryBytes).padStart(12)}`,
    `Draw calls  ${String(before.stats.drawCalls).padStart(12)}  →  ${String(after.stats.drawCalls).padStart(12)}`,
    '',
    `Mobile score ${before.evaluation.score}/100 (${before.evaluation.verdict}) → ${after.evaluation.score}/100 (${after.evaluation.verdict})`,
    '',
    'Steps: ' + (report.steps.length ? report.steps.join('; ') : 'none needed'),
    'Why: ' + settings.explanation.join(' '),
  ];
  const open = after.evaluation.checks.filter((c) => c.status !== 'pass');
  if (open.length) {
    lines.push('', 'Still outside budget:');
    for (const c of open) lines.push(`  - ${c.name}: ${c.value.toLocaleString('en-GB')} (budget ${c.budget.toLocaleString('en-GB')}). Try: ${c.fix[0]}`);
  }
  if (report.warnings.length) lines.push('', 'Warnings:', ...report.warnings.map((w) => `  - ${w}`));
  return lines.join('\n');
}

export function parseLevels(params) {
  if (params.levels) {
    const keeps = String(params.levels).split(',').map((s) => Number(s.trim()));
    if (!keeps.length || keeps.length > 6 || keeps.some((k) => !Number.isFinite(k) || k <= 0 || k > 1)) {
      throw new ApiError(400, 'invalid_levels', 'levels must be 1–6 comma-separated fractions between 0 and 1, e.g. "1,0.5,0.25".');
    }
    return keeps;
  }
  const preset = LOD_CHAIN_PRESETS[params.preset || 'standard'];
  if (!preset?.levels) throw new ApiError(400, 'invalid_preset', 'preset must be standard, aggressive or minimal (or pass levels).');
  return preset.levels.map((l) => l.keep);
}

export async function generateLodChain(bytes, params) {
  const keeps = parseLevels(params);
  const before = analyseGlb(bytes);
  if (before.triangles === 0) throw new ApiError(422, 'no_geometry', 'This model contains no triangle geometry.');
  const lockBorder = bool(params.lockBorder, true);
  const compress = bool(params.compress, true);
  await readDocument(bytes); // fail fast on Draco / unreadable input

  const levels = [];
  const warnings = [];
  for (let i = 0; i < keeps.length; i += 1) {
    const keep = keeps[i];
    let output;
    let levelWarnings = [];
    if (keep >= 0.999 && !compress) {
      output = bytes;
    } else {
      // Fresh parse per level: every level is a fraction of the original, never of the previous level.
      const document = await readDocument(bytes);
      if (keep < 0.999) levelWarnings = (await reduce(document, keep, lockBorder)).warnings;
      if (compress) await compressMeshopt(document);
      output = await writeDocument(document);
    }
    const stats = analyseGlb(output);
    levels.push({ file: `lod${i}.glb`, keep, triangles: stats.triangles, fileBytes: stats.fileBytes, output });
    warnings.push(...levelWarnings.map((w) => `LOD${i}: ${w}`));
  }
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i].triangles > levels[i - 1].triangles) warnings.push(`LOD${i} has more triangles than LOD${i - 1}; the chain is not in decreasing order.`);
  }
  return { levels, report: { source: { triangles: before.triangles, fileBytes: before.fileBytes }, compress, lockBorder, levels: levels.map(({ output, ...rest }) => rest), warnings } };
}
