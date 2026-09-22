import { readGlb } from './createIO.js';
import { exportGlb } from './export.js';
import { validateOptimisedGlb } from './validate.js';
import { analyseGlb } from './analyse.js';
import { classifyModel } from './classify.js';
import { buildOptimisationPlan } from '../processing/buildPlan.js';
import { runCleanup } from '../processing/cleanup.js';
import { runTextures } from '../processing/textures.js';
import { runGeometry } from '../processing/geometry.js';
import { runCompression } from '../processing/compression.js';
import { buildOperationReport } from '../processing/operationReport.js';
import { compareAnalyses } from './statistics.js';

/**
 * Runs the full, real optimisation pipeline for one model:
 *
 *   analyse -> classify -> build plan -> cleanup -> textures -> geometry
 *   -> export -> reload -> validate -> compare
 *
 * Every stage reports progress via onProgress(stageLabel). Nothing here
 * is timed/faked — each stage only resolves once its real work is done.
 *
 * @param {Object} params
 * @param {ArrayBuffer} params.originalBuffer
 * @param {import('./analyse.js').GlbAnalysis} params.originalAnalysis
 * @param {string} params.presetId
 * @param {Object|null} params.advancedOverrides
 * @param {boolean} params.onlyWhenSmaller
 * @param {(stage: string) => void} [params.onProgress]
 */
export async function optimiseModel({
  originalBuffer,
  originalAnalysis,
  presetId,
  advancedOverrides = null,
  onlyWhenSmaller = true,
  onProgress = () => {},
}) {
  const filename = originalAnalysis.file.filename;
  const executed = [];
  const warnings = [];

  onProgress('Checking model…');
  const classification = classifyModel(originalAnalysis);
  const { plan, requested, skipped } = buildOptimisationPlan(presetId, classification, advancedOverrides);

  onProgress('Cleaning…');
  const document = await readGlb(originalBuffer);
  await runCleanup(document, plan, executed, warnings);

  onProgress('Optimising textures…');
  await runTextures(document, plan, executed, warnings);

  onProgress('Optimising geometry…');
  await runGeometry(document, plan, executed, warnings);

  onProgress('Compressing…');
  await runCompression(document, plan, executed, warnings);

  onProgress('Writing GLB…');
  const candidateBuffer = await exportGlb(document);

  onProgress('Validating…');
  const validation = await validateOptimisedGlb(
    candidateBuffer,
    originalAnalysis,
    classification,
    filename.replace(/\.glb$/i, '_optimised.glb')
  );

  if (validation.status === 'FAIL') {
    return {
      success: false,
      classification,
      report: buildOperationReport({
        modelName: filename,
        preset: presetId,
        requested,
        executed,
        skipped,
        warnings,
        validation,
      }),
      validation,
      buffer: null,
      analysis: null,
      comparison: null,
      usedOriginalFallback: false,
    };
  }

  let finalBuffer = candidateBuffer;
  let finalAnalysis = validation.analysis;
  let usedOriginalFallback = false;

  if (onlyWhenSmaller && candidateBuffer.byteLength >= originalBuffer.byteLength) {
    usedOriginalFallback = true;
    finalBuffer = originalBuffer;
    finalAnalysis = originalAnalysis;
    warnings.push(
      'Optimisation completed successfully, but the resulting file was larger than the original. The original file was kept instead.'
    );
  }

  onProgress('Complete');

  const comparison = compareAnalyses(originalAnalysis, finalAnalysis);

  return {
    success: true,
    classification,
    report: buildOperationReport({
      modelName: filename,
      preset: presetId,
      requested,
      executed,
      skipped,
      warnings,
      validation,
    }),
    validation,
    buffer: finalBuffer,
    analysis: finalAnalysis,
    comparison,
    usedOriginalFallback,
  };
}
