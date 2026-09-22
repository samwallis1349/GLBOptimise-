import { weld, simplify, reorder, quantize } from '@gltf-transform/functions';

/**
 * Geometry stage.
 *
 * Order matters: weld first (simplification needs shared vertices to work on),
 * then simplify, then reorder for GPU vertex-cache locality, then quantize
 * last since it changes attribute storage types.
 *
 * Every step here is gated by safetyRules.js before it arrives — this module
 * never decides on its own whether something is safe for a given model.
 */
export async function runGeometry(document, plan, executed, warnings) {
  if (plan.geometry.optimise) {
    await document.transform(weld());
    executed.push('weld vertices');
  }

  if (plan.geometry.simplify) {
    try {
      const { MeshoptSimplifier } = await import('meshoptimizer');
      await MeshoptSimplifier.ready;
      await document.transform(
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: plan.geometry.targetRatio ?? 0.5,
          error: 0.001,
        })
      );
      executed.push(`simplify geometry (target ${Math.round((plan.geometry.targetRatio ?? 0.5) * 100)}%)`);
    } catch (err) {
      warnings.push(`Geometry simplification failed (${err?.message || 'unknown error'}); geometry was left unchanged.`);
    }
  }

  if (plan.geometry.reorder) {
    try {
      const { MeshoptEncoder } = await import('meshoptimizer');
      await MeshoptEncoder.ready;
      await document.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
      executed.push('reorder for vertex cache');
    } catch (err) {
      warnings.push(`Vertex reorder failed (${err?.message || 'unknown error'}).`);
    }
  }

  if (plan.geometry.quantize) {
    try {
      await document.transform(quantize());
      executed.push('quantize vertex attributes');
    } catch (err) {
      warnings.push(`Quantization failed (${err?.message || 'unknown error'}).`);
    }
  }
}
