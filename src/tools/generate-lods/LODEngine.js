import { Primitive } from '@gltf-transform/core';
import { weld, simplifyPrimitive, getGLPrimitiveCount, prune } from '@gltf-transform/functions';
import { readGlb } from './glb/createIO.js';
import { exportGlb } from './glb/export.js';
import { analyseGeometry } from './LODAnalysis.js';

/**
 * The LOD generation engine.
 *
 * Same simplification library as Reduce Polys — **meshoptimizer**
 * (`MeshoptSimplifier`), driven per-primitive through glTF-Transform's
 * `simplifyPrimitive()` — run once per requested LOD level instead of once
 * per tool run. Two decisions are specific to generating a *chain* rather
 * than a single reduction:
 *
 * 1. Every level is simplified from a **fresh parse of the original
 *    source**, never from the previous level's output. Chaining
 *    (LOD2 from LOD1's result) would compound the simplifier's error
 *    tolerance at each step and make a later level's quality depend on
 *    decisions made for an earlier one — two independent creative
 *    decisions collapsed into an accident of pipeline order. Re-parsing is
 *    the more expensive choice but the honest one: every level's "keep 25%"
 *    means 25% of the *original* geometry, not 25% of some other level.
 * 2. A level whose keep ratio rounds to 100% is not run through the
 *    simplifier at all — it is exported as the untouched source document.
 *    Running weld+prune on an unmodified mesh would still be "correct" but
 *    would silently rewrite bytes a user asked to keep as-is (e.g. LOD0 in
 *    every built-in preset).
 *
 * This module is deliberately DOM-free and takes/returns plain data, so it
 * can be moved behind a Web Worker boundary without changes — same
 * reasoning as ReducePolysEngine.js.
 */

const LEVEL_STAGES = ['ANALYSING', 'PREPARING GEOMETRY', 'SIMPLIFYING', 'REBUILDING', 'EXPORTING'];
const COPY_STAGES = ['ANALYSING', 'COPYING SOURCE', 'EXPORTING'];

/** Lets the browser paint between meshes so the UI never locks up. */
const yieldToUI = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

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

/**
 * Simplifies a single, already-parsed Document in place to `ratio` and
 * returns its per-mesh report. Shares its core loop with
 * ReducePolysEngine.reducePolys — kept as a separate copy here rather than
 * a shared import per this tool's self-contained-tool convention (see
 * LODAnalysis.js).
 */
async function simplifyToRatio(document, ratio, options, onStage) {
  const simplifier = await getSimplifier();

  onStage('PREPARING GEOMETRY');
  // Welding merges bitwise-identical vertices, which the simplifier needs
  // to collapse edges at all; UV/normal seams stay split because the
  // comparison is exact.
  await document.transform(weld());

  onStage('SIMPLIFYING');
  const meshReports = [];
  const warnings = [];
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
        continue;
      }
      if (!prim.getAttribute('POSITION')) {
        report.status = 'Skipped';
        report.reason = 'No POSITION attribute';
        continue;
      }

      try {
        simplifyPrimitive(prim, {
          simplifier,
          ratio,
          error: options.error,
          lockBorder: options.lockBorder,
        });
        report.after += getGLPrimitiveCount(prim);
      } catch (err) {
        report.status = 'Failed';
        report.reason = err?.message || 'Simplifier error';
        report.after += before;
        warnings.push(`"${report.name}" could not be simplified: ${report.reason}`);
      }
    }

    if (report.status === 'Skipped') report.after = report.before;
    if (report.status === 'Reduced' && report.after >= report.before) {
      report.status = 'Unchanged';
      report.reason = 'Could not collapse further within the error limit';
    }
    report.reduction = report.before > 0 ? (report.before - report.after) / report.before : 0;
    meshReports.push(report);

    await yieldToUI();
  }

  onStage('REBUILDING');
  if (options.cleanup) {
    // keepAttributes/keepSolidTextures: this tool reduces geometry and must
    // not quietly rewrite materials or delete attributes the target engine
    // may still reference, even if nothing in this file happens to use them.
    await document.transform(
      prune({ keepExtras: true, keepAttributes: true, keepSolidTextures: true, keepLeaves: true })
    );
  }

  return { meshReports, warnings };
}

/**
 * @param {Object} params
 * @param {ArrayBuffer} params.originalBuffer  the untouched source GLB
 * @param {Object} params.originalStats         analyseGeometry(sourceDocument), pre-computed once
 * @param {{id: string, label: string, keep: number}[]} params.levelConfigs
 * @param {Object} [params.options]  {lockBorder, error, cleanup} — applied to every level
 * @param {(levelIndex: number, totalLevels: number, stage: string, label: string) => void} [params.onProgress]
 * @returns {Promise<{ results: Array, warnings: string[] }>}
 */
export async function generateLODs({ originalBuffer, originalStats, levelConfigs, options = {}, onProgress = () => {} }) {
  if (!levelConfigs?.length) throw new Error('At least one LOD level is required.');
  if (originalStats.triangleCount === 0) {
    throw new Error('This model contains no triangle geometry, so there is nothing to generate LODs from.');
  }

  const results = [];
  const globalWarnings = [];
  const total = levelConfigs.length;

  for (let i = 0; i < levelConfigs.length; i += 1) {
    const { id, label, keep } = levelConfigs[i];
    const ratio = Math.max(0.001, Math.min(1, keep));
    const isUnmodified = ratio >= 0.999;
    const stages = isUnmodified ? COPY_STAGES : LEVEL_STAGES;
    const stage = (name) => onProgress(i, total, name, label);

    stage(stages[0]); // ANALYSING

    if (isUnmodified) {
      stage('COPYING SOURCE');
      await yieldToUI();
      stage('EXPORTING');
      const outputBuffer = originalBuffer.slice(0);
      results.push({
        id,
        label,
        keep: 1,
        ratio: 1,
        outputBuffer,
        stats: originalStats,
        meshReports: [],
        warnings: [],
        unmodified: true,
      });
      continue;
    }

    const document = await readGlb(originalBuffer);
    const { meshReports, warnings } = await simplifyToRatio(document, ratio, options, stage);

    stage('EXPORTING');
    const outputBuffer = await exportGlb(document);
    const stats = analyseGeometry(document);

    const achieved =
      originalStats.triangleCount > 0
        ? (originalStats.triangleCount - stats.triangleCount) / originalStats.triangleCount
        : 0;
    const requestedReduction = 1 - ratio;
    const levelWarnings = [...warnings];
    if (requestedReduction > 0.05 && achieved < requestedReduction * 0.5) {
      levelWarnings.push(
        `${label}: geometry could not be reduced as far as requested (${(achieved * 100).toFixed(1)}% removed vs ${(requestedReduction * 100).toFixed(1)}% asked for).`
      );
    }

    results.push({
      id,
      label,
      keep: ratio,
      ratio,
      outputBuffer,
      stats,
      meshReports,
      warnings: levelWarnings,
      unmodified: false,
    });
    globalWarnings.push(...levelWarnings.map((w) => (w.startsWith(label) ? w : `${label}: ${w}`)));

    await yieldToUI();
  }

  // A LOD chain that isn't monotonically decreasing in triangle count is
  // still a valid export, but almost certainly not what was intended — an
  // engine consuming it as a distance-based chain expects LOD(i+1) to never
  // have more geometry than LOD(i).
  for (let i = 1; i < results.length; i += 1) {
    if (results[i].stats.triangleCount > results[i - 1].stats.triangleCount) {
      globalWarnings.push(
        `${results[i].label} has more triangles than ${results[i - 1].label} — this chain is not in decreasing order.`
      );
    }
  }

  return { results, warnings: globalWarnings };
}
