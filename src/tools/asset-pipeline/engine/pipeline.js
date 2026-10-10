import { meshopt, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { inspectAsset, documentFeatures, dropDracoCompression } from './inspect.js';
import { stageEnabled } from './settings.js';
import { STAGES, checkStageOrder } from './stages.js';
import { cleanup, optimiseScene, optimiseAnimation } from './scene.js';
import { optimiseGeometry, deformingMeshes } from './geometry.js';
import { createTextureState, resizeTextures, compressTextures, flushPending, textureReport } from './textures.js';
import { generateLods, groupLods, buildCollision } from './lods.js';
import { validateOutput } from './validate.js';
import { evaluateBudgets, tightenForBudget } from './budgets.js';
import { outputNames } from './naming.js';

/**
 * Runs the configured pipeline on ONE asset and returns its outputs and a
 * full report. DOM-free: the page, a Web Worker, Node (tests), and later a
 * CLI or the REST API call this with their own `env`:
 *
 *   env.io               glTF-Transform PlatformIO with Meshopt (+ Draco decoder in the browser)
 *   env.codecs           image codecs (engine/codecs.js; the browser adds WebP + KTX2)
 *   env.encodeCache      batch-wide encoded-texture cache (optional)
 *   env.signal           AbortSignal — cancels between stages
 *   env.waitIfPaused     async () => void, awaited between stages (optional)
 *   env.onProgress       (stageId, { index, total, label }) => void
 *   env.renderThumbnail  async (glbBytes) => Uint8Array PNG | null (browser only)
 *
 * The source is never modified: it is parsed into a fresh Document and every
 * output is a new byte array.
 */

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class CancelledError extends Error {
  constructor() {
    super('Cancelled.');
    this.name = 'CancelledError';
  }
}

function createLog() {
  const entries = [];
  const push = (level) => (message, stage = null) => entries.push({ level, message, stage, t: Math.round(now()) });
  return { entries, info: push('info'), warn: push('warn'), error: push('error'), debug: () => {} };
}

const MAX_BUDGET_ATTEMPTS = 3;

/**
 * @param {{ name: string, dir?: string, bytes: Uint8Array, missing?: string[], sourceFormat?: string, inspection?: object }} source
 * @param {object} settings  normalised settings (engine/settings.js)
 * @param {object} env
 */
export async function processAsset(source, settings, env) {
  const started = now();
  const order = checkStageOrder(settings.stages);
  if (order.errors.length) throw new Error(`Pipeline order is invalid: ${order.errors.join(' ')}`);

  const inspection = source.inspection || (await inspectAsset(source.bytes, { io: env.io, missing: source.missing, sourceFormat: source.sourceFormat }));
  if (!inspection.ok) {
    return failedResult(source, inspection, inspection.error || inspection.issues.find((i) => i.severity === 'error')?.message || 'The asset cannot be processed.', started);
  }

  let current = settings;
  const attempts = [];
  for (let attempt = 1; attempt <= MAX_BUDGET_ATTEMPTS; attempt += 1) {
    const run = await runOnce(source, current, inspection, env);
    run.attempts = [...attempts, { attempt, changes: run.budgetChanges || [] }];
    const budgets = run.budgets;
    if (!budgets || budgets.status !== 'fail' || current.budgets.onExceed !== 'optimise' || run.status === 'failed') {
      return finalise(run, started);
    }
    const tightened = tightenForBudget(current, budgets, run.after?.stats || inspection.stats, deformingFromInspection(inspection));
    if (!tightened || attempt === MAX_BUDGET_ATTEMPTS) {
      run.status = 'review';
      note(run, 'warn', tightened ? `Still over budget after ${attempt} attempts: marked for manual review.` : 'Over budget, and nothing more can be reduced without breaking the minimum limits: marked for manual review.');
      return finalise(run, started);
    }
    attempts.push({ attempt, changes: tightened.changes });
    note(run, 'info', `Over budget: retrying with ${tightened.changes.join(', ')}.`);
    current = tightened.settings;
    current._budgetAttempt = attempt + 1;
  }
  throw new Error('unreachable');
}

function note(run, level, message) {
  run.log.push({ level, message, stage: 'budgets', t: Math.round(now()) });
}

function deformingFromInspection(inspection) {
  return (inspection.features?.skins || 0) > 0 || (inspection.features?.morphTargets || 0) > 0;
}

function finalise(run, started) {
  run.timing.totalMs = Math.round(now() - started);
  return run;
}

function failedResult(source, inspection, message, started) {
  return {
    name: source.name,
    dir: source.dir || '',
    status: 'failed',
    error: message,
    inspection,
    outputs: [],
    log: [{ level: 'error', message, stage: 'inspect' }],
    timing: { totalMs: Math.round(now() - started), stages: {} },
  };
}

async function runOnce(source, settings, inspection, env) {
  const log = createLog();
  const timing = { stages: {}, totalMs: 0 };
  const enabled = settings.stages.filter((s) => s.enabled);
  const total = enabled.length;
  const io = env.io;

  const document = dropDracoCompression(await io.readBinary(source.bytes));
  const inputFeatures = documentFeatures(document);
  const originals = [];
  const pixels = new Map();
  const makeTexState = () => createTextureState({ cache: env.encodeCache, pixels, keepOriginals: settings.textures.keepOriginals, originals });
  let variants = [{ level: 0, doc: document, tex: makeTexState() }];
  const reports = { stages: [], geometry: null, lods: null };

  const checkpoint = async () => {
    if (env.signal?.aborted) throw new CancelledError();
    if (env.waitIfPaused) await env.waitIfPaused();
    if (env.signal?.aborted) throw new CancelledError();
  };

  for (let i = 0; i < enabled.length; i += 1) {
    const { id } = enabled[i];
    if (id === 'inspect' || id === 'validate' || id === 'report' || id === 'export') continue; // handled after the mutating stages
    await checkpoint();
    env.onProgress?.(id, { index: i, total, label: STAGES[id].label });
    const t0 = now();
    const slog = { info: (m) => log.info(m, id), warn: (m) => log.warn(m, id), error: (m) => log.error(m, id), debug: () => {} };

    if (id !== 'compressTextures') for (const v of variants) await flushPending({ document: v.doc, codecs: env.codecs, state: v.tex, log: slog });

    const ops = [];
    try {
      switch (id) {
        case 'cleanup':
          for (const v of variants) ops.push(...(await cleanup({ document: v.doc, settings, log: slog })).ops);
          break;
        case 'scene':
          for (const v of variants) ops.push(...(await optimiseScene({ document: v.doc, settings, log: slog })).ops);
          break;
        case 'geometry': {
          // Geometry targets LOD0; LOD levels (if already cut) keep their own simplification.
          const r = await optimiseGeometry({ document: variants[0].doc, settings, log: slog });
          reports.geometry = r;
          ops.push(...r.ops);
          break;
        }
        case 'lods': {
          const { variants: docs, reports: lodReports } = await generateLods({ document: variants[0].doc, settings, io, log: slog });
          variants = docs.map((d) => ({ level: d.level, doc: d.doc, tex: d.level === 0 ? variants[0].tex : makeTexState() }));
          reports.lods = lodReports;
          ops.push(`${docs.length} levels: ${lodReports.map((l) => l.triangles.toLocaleString('en-GB')).join(' / ')} triangles`);
          break;
        }
        case 'resizeTextures':
          for (const v of variants) await resizeTextures({ document: v.doc, settings, codecs: env.codecs, state: v.tex, log: slog });
          ops.push('resize over-limit textures');
          break;
        case 'compressTextures':
          for (const v of variants) await compressTextures({ document: v.doc, settings, codecs: env.codecs, state: v.tex, log: slog });
          ops.push('encode per texture role');
          break;
        case 'animation':
          for (const v of variants) ops.push(...(await optimiseAnimation({ document: v.doc, settings, log: slog })).ops);
          break;
        default:
      }
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      log.error(`${STAGES[id].label} failed: ${err?.message || err}`, id);
      return { ...failedResult(source, inspection, `${STAGES[id].label} failed: ${err?.message || err}`, now()), log: log.entries };
    }
    timing.stages[id] = Math.round(now() - t0);
    reports.stages.push({ id, label: STAGES[id].label, ops: [...new Set(ops)], ms: timing.stages[id] });
  }

  for (const v of variants) await flushPending({ document: v.doc, codecs: env.codecs, state: v.tex, log });
  const textures = textureReport(variants[0].doc, variants[0].tex);

  // ---- export: write bytes ------------------------------------------------
  await checkpoint();
  const exportIndex = enabled.findIndex((s) => s.id === 'export');
  env.onProgress?.('export', { index: exportIndex, total, label: STAGES.export.label });
  const t0 = now();
  const names = outputNames(source, settings);
  const lodsOn = stageEnabled(settings, 'lods') && variants.length > 1;
  const transformed = settings.advanced.scale !== 1 || settings.advanced.sourceUp === 'z' || (settings.advanced.origin !== 'preserve' && !deformingFromInspection(inspection) && !inputFeatures.animations.length);

  // LOD0 bytes before transport compression: the collider is cut from these.
  const lod0Plain = settings.lods.collision && stageEnabled(settings, 'lods') && !inputFeatures.skins ? await io.writeBinary(variants[0].doc) : null;

  const encodeDoc = async (doc) => {
    if (settings.export.compression === 'meshopt') {
      await MeshoptEncoder.ready;
      await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
    } else if (settings.geometry.quantize) {
      await doc.transform(quantize());
    }
  };

  const outputs = [];
  if (lodsOn && settings.lods.grouping === 'grouped') {
    const grouped = await groupLods(variants, names.base, settings.export.lodSuffix);
    await encodeDoc(grouped);
    outputs.push({ kind: 'main', level: null, path: names.main, bytes: await io.writeBinary(grouped), doc: grouped });
  } else {
    for (const v of variants) {
      await encodeDoc(v.doc);
      outputs.push({ kind: lodsOn ? 'lod' : 'main', level: lodsOn ? v.level : null, path: lodsOn ? names.lod(v.level) : names.main, bytes: await io.writeBinary(v.doc), doc: v.doc });
    }
  }
  if (lod0Plain) {
    try {
      outputs.push({ kind: 'collision', level: null, path: names.collision, bytes: await buildCollision({ bytes: lod0Plain, io, triangles: settings.lods.collisionTriangles }) });
    } catch (err) {
      log.warn(`Collision mesh could not be built: ${err?.message || err}.`, 'lods');
    }
  } else if (settings.lods.collision && stageEnabled(settings, 'lods') && inputFeatures.skins) {
    log.info('Collision mesh skipped: skinned characters normally use capsule or primitive colliders.', 'lods');
  }

  // ---- validate -----------------------------------------------------------
  const validation = [];
  if (stageEnabled(settings, 'validate')) {
    env.onProgress?.('validate', { index: enabled.findIndex((s) => s.id === 'validate'), total, label: STAGES.validate.label });
    const tv = now();
    for (const out of outputs) {
      const kind = out.kind === 'collision' ? 'collision' : out.kind === 'lod' && out.level > 0 ? 'lod' : 'main';
      const v = await validateOutput(out.bytes, { io, input: inputFeatures, settings, kind, expect: { transformed } });
      out.validation = v.status;
      validation.push({ path: out.path, kind: out.kind, level: out.level, status: v.status, checks: v.checks });
    }
    timing.stages.validate = Math.round(now() - tv);
  }

  // The primary output (LOD0 / main), as GLB bytes, for measuring and thumbnails.
  const primary = outputs.find((o) => o.kind === 'main') || outputs.find((o) => o.kind === 'lod' && o.level === 0);
  const primaryBytes = primary.bytes;

  // Separate-texture output: re-write as .gltf + .bin + image files (validated as GLB above).
  if (settings.textures.output === 'separate') {
    for (const out of [...outputs]) {
      if (!out.doc || out.kind === 'collision') continue;
      const { json, resources } = await io.writeJSON(out.doc, { basename: names.stem(out.path) });
      const dir = names.dirOf(out.path);
      out.path = out.path.replace(/\.glb$/i, '.gltf');
      out.bytes = new TextEncoder().encode(JSON.stringify(json, null, 2));
      out.separate = true;
      for (const [uri, data] of Object.entries(resources)) outputs.push({ kind: 'resource', path: `${dir}${uri}`, bytes: data, parent: out.path, heldBack: out.validation === 'fail' });
    }
  }
  for (const out of outputs) delete out.doc;

  // Measure the primary output with the same inspector as the input.
  const after = await inspectAsset(primaryBytes, { io });
  timing.stages.export = Math.round(now() - t0);

  if (originals.length) {
    for (const o of originals) outputs.push({ kind: 'original-texture', path: `${names.originalsDir}${safeName(o.name)}.${extFor(o.mime)}`, bytes: o.bytes });
  }

  // ---- report & thumbnails --------------------------------------------------
  if (stageEnabled(settings, 'report') && settings.export.thumbnails && env.renderThumbnail) {
    try {
      const png = await env.renderThumbnail(primaryBytes);
      if (png) outputs.push({ kind: 'thumbnail', path: names.thumbnail, bytes: png });
    } catch (err) {
      log.warn(`Thumbnail failed: ${err?.message || err}.`, 'report');
    }
  }

  const budgets = settings.budgets.enabled && after.ok !== false && after.stats
    ? evaluateBudgets({ ...after.stats, fileBytes: outputs.filter((o) => o === primary || o.parent === primary.path).reduce((n, o) => n + o.bytes.byteLength, 0) }, settings.budgets.limits)
    : null;

  const failedValidation = validation.some((v) => v.status === 'fail' && (v.kind === 'main' || v.level === 0));
  let status = failedValidation ? 'failed' : 'done';
  if (budgets?.status === 'fail' && status === 'done') status = 'review';
  if (failedValidation) log.error('Validation failed: protected content was lost. Outputs are held back from the download.', 'validate');
  else if (validation.some((v) => v.status === 'fail')) log.warn('A secondary output failed validation and is held back.', 'validate');
  for (const out of outputs) if (out.validation === 'fail') out.heldBack = true;

  return {
    name: source.name,
    dir: source.dir || '',
    status,
    error: failedValidation ? 'Validation failed: protected content was lost.' : null,
    inspection,
    after,
    settingsMode: settings.mode,
    engine: settings.engine,
    stages: reports.stages,
    geometry: reports.geometry && { simplified: reports.geometry.simplified, degenerateRemoved: reports.geometry.degenerateRemoved, meshes: reports.geometry.meshReports },
    lods: reports.lods,
    textures,
    validation,
    budgets,
    budgetChanges: settings._budgetAttempt ? [`attempt ${settings._budgetAttempt}`] : [],
    outputs,
    outputBytes: outputs.filter((o) => o === primary || o.parent === primary.path).reduce((n, o) => n + o.bytes.byteLength, 0),
    // Separate-texture exports have no single GLB to preview; keep one for the viewer.
    previewGlb: primary.separate ? primaryBytes : null,
    log: log.entries,
    timing,
  };
}

const safeName = (s) => String(s).replace(/[^\w.-]+/g, '_').replace(/\.(png|jpe?g|webp|ktx2)$/i, '') || 'texture';
const extFor = (mime) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/ktx2': 'ktx2' })[mime] || 'bin';

export { deformingMeshes };
