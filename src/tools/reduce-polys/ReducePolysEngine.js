import { Primitive } from '@gltf-transform/core';
import { weld, simplifyPrimitive, getGLPrimitiveCount, prune } from '@gltf-transform/functions';
import { analyseGeometry } from './ReducePolysAnalysis.js';

/**
 * The polygon reduction engine.
 *
 * Simplification library: **meshoptimizer** (`MeshoptSimplifier`), driven
 * per-primitive through glTF-Transform's `simplifyPrimitive()`. Working at
 * the primitive level rather than calling the document-wide `simplify()`
 * transform is deliberate — it is what makes a per-mesh breakdown and
 * per-mesh skipping possible, and it keeps material boundaries intact
 * because each primitive carries exactly one material.
 *
 * This module is deliberately DOM-free and takes/returns plain data, so it
 * can be moved behind a Web Worker boundary without changes: the only inputs
 * are a Document (or an ArrayBuffer via `reducePolysFromBuffer`) plus
 * options, and the only outputs are a Document/bytes plus statistics.
 */

let simplifierPromise = null;
async function getSimplifier() {
  if (!simplifierPromise) {
    simplifierPromise = import('meshoptimizer').then(async ({ MeshoptSimplifier }) => {
      await MeshoptSimplifier.ready;
      return MeshoptSimplifier;
    });
  }
  return simplifierPromise;
}

/** Lets the browser paint between meshes so the UI never locks up. */
const yieldToUI = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

export const DEFAULT_OPTIONS = {
  /** meshoptimizer: lock vertices on open boundaries so borders don't shrink. */
  lockBorder: true,
  /** meshoptimizer: max error as a fraction of mesh radius. */
  error: 0.01,
  /** Remove resources left unreferenced after reduction. */
  cleanup: true,
};

/**
 * @param {Object} params
 * @param {import('@gltf-transform/core').Document} params.document  mutated in place
 * @param {number} [params.ratio]            0–1 fraction of geometry to keep
 * @param {number} [params.targetTriangles]  absolute target; overrides ratio
 * @param {Object} [params.options]
 * @param {(stage: string, detail?: Object) => void} [params.onProgress]
 */
export async function reducePolys({
  document,
  ratio,
  targetTriangles,
  options = {},
  onProgress = () => {},
}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings = [];
  const operationReport = { requested: [], executed: [], skipped: [] };

  onProgress('ANALYSING MODEL');
  const originalStats = analyseGeometry(document);

  if (originalStats.triangleCount === 0) {
    throw new Error('This model contains no triangle geometry, so there is nothing to reduce.');
  }

  // An absolute triangle target is expressed to the simplifier as a ratio.
  // The result is approximate: topology and the error limit both constrain
  // how far a mesh can actually collapse.
  let effectiveRatio = ratio;
  if (Number.isFinite(targetTriangles) && targetTriangles > 0) {
    effectiveRatio = Math.min(1, targetTriangles / originalStats.triangleCount);
    operationReport.requested.push(`target ${targetTriangles.toLocaleString()} triangles`);
  } else {
    operationReport.requested.push(`keep ${Math.round((effectiveRatio ?? 1) * 100)}% of geometry`);
  }
  effectiveRatio = Math.max(0.001, Math.min(1, effectiveRatio ?? 1));

  const simplifier = await getSimplifier();

  // Welding merges bitwise-identical vertices. The simplifier needs shared
  // vertices to collapse edges at all; UV/normal seams stay split because
  // the comparison is exact, which is why seams survive.
  onProgress('PREPARING GEOMETRY');
  await document.transform(weld());
  operationReport.executed.push('weld vertices');

  onProgress('SIMPLIFYING');
  const meshReports = [];
  const root = document.getRoot();
  const meshes = root.listMeshes();

  for (let m = 0; m < meshes.length; m += 1) {
    const mesh = meshes[m];
    const report = {
      name: mesh.getName() || '(unnamed mesh)',
      before: 0,
      after: 0,
      status: 'Reduced',
      reason: null,
    };

    for (const prim of mesh.listPrimitives()) {
      const before = prim.getMode() === Primitive.Mode.TRIANGLES ? getGLPrimitiveCount(prim) : 0;
      report.before += before;

      if (prim.getMode() !== Primitive.Mode.TRIANGLES) {
        report.status = 'Skipped';
        report.reason = 'Not an indexed triangle list';
        operationReport.skipped.push({ mesh: report.name, reason: report.reason });
        continue;
      }
      if (!prim.getAttribute('POSITION')) {
        report.status = 'Skipped';
        report.reason = 'No POSITION attribute';
        operationReport.skipped.push({ mesh: report.name, reason: report.reason });
        continue;
      }

      try {
        simplifyPrimitive(prim, {
          simplifier,
          ratio: effectiveRatio,
          error: opts.error,
          lockBorder: opts.lockBorder,
        });
        report.after += getGLPrimitiveCount(prim);
      } catch (err) {
        report.status = 'Failed';
        report.reason = err?.message || 'Simplifier error';
        report.after += before;
        warnings.push(`"${report.name}" could not be simplified: ${report.reason}`);
        operationReport.skipped.push({ mesh: report.name, reason: report.reason });
      }
    }

    if (report.status === 'Skipped') report.after = report.before;
    if (report.status === 'Reduced' && report.after >= report.before) {
      report.status = 'Unchanged';
      report.reason = 'Could not collapse further within the error limit';
    }
    report.reduction = report.before > 0 ? (report.before - report.after) / report.before : 0;
    meshReports.push(report);

    onProgress('SIMPLIFYING', { mesh: m + 1, total: meshes.length, name: report.name });
    await yieldToUI();
  }
  operationReport.executed.push(`simplify geometry (meshoptimizer, ratio ${effectiveRatio.toFixed(3)})`);

  onProgress('REBUILDING');
  if (opts.cleanup) {
    // keepAttributes: a polygon-reduction tool has no business deleting the
    // user's UVs, vertex colours or tangents just because no texture happens
    // to reference them in this file — they may be referenced by the engine
    // the asset is bound for. keepSolidTextures for the same reason: this
    // tool reduces geometry and must not quietly rewrite materials.
    await document.transform(
      prune({ keepExtras: true, keepAttributes: true, keepSolidTextures: true, keepLeaves: true })
    );
    operationReport.executed.push('remove resources orphaned by reduction');
  }

  const reducedStats = analyseGeometry(document);

  // Honest warnings about the outcome.
  const achieved =
    originalStats.triangleCount > 0
      ? (originalStats.triangleCount - reducedStats.triangleCount) / originalStats.triangleCount
      : 0;
  const requestedReduction = 1 - effectiveRatio;
  if (requestedReduction > 0.05 && achieved < requestedReduction * 0.5) {
    warnings.push(
      `Geometry could not be reduced as far as requested (${(achieved * 100).toFixed(1)}% removed vs ${(requestedReduction * 100).toFixed(1)}% asked for). The error limit or preservation settings are the constraint.`
    );
  }
  if (achieved <= 0.001) {
    warnings.push('Geometry could not be reduced significantly with the current preservation settings.');
  }

  return {
    outputDocument: document,
    originalStats,
    reducedStats,
    meshReports,
    operationReport,
    warnings,
    effectiveRatio,
  };
}

/**
 * Worker-ready entry point: bytes in, bytes out, no live objects crossing
 * the boundary. The UI uses this so the same code path would run unchanged
 * inside a Web Worker.
 */
export async function reducePolysFromBuffer(arrayBuffer, params, io) {
  const document = await io.readBinary(new Uint8Array(arrayBuffer));
  const result = await reducePolys({ ...params, document });
  const bytes = await io.writeBinary(result.outputDocument);
  return {
    ...result,
    outputBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}
