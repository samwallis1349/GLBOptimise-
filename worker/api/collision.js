import { Primitive } from '@gltf-transform/core';
import { compactPrimitive, dedup, flatten, getGLPrimitiveCount, join, prune, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { reduce } from './mesh.js';

/**
 * Triangle-budget fitting and collision-mesh building, shared by the
 * game-ready endpoint and the browser Asset Pipeline. Kept free of the
 * KTX2/wasm imports so it bundles for the browser.
 */

export function triangleCount(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) if (prim.getMode() === Primitive.Mode.TRIANGLES) total += getGLPrimitiveCount(prim);
  }
  return total;
}

/**
 * Topology-ignoring simplification (meshoptimizer simplifySloppy). The
 * regular simplifier stops at UV seams and part outlines; far LODs and
 * collision shapes don't need either, so this always reaches the target.
 */
async function sloppyTo(document, targetTris) {
  await MeshoptSimplifier.ready;
  const total = triangleCount(document);
  if (!total) return;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      if (prim.getMode() !== Primitive.Mode.TRIANGLES || !indices || !position || position.getNormalized()) continue;
      const tris = indices.getCount() / 3;
      const target = Math.max(12, Math.floor((tris / total) * targetTris));
      if (target >= tris) continue;
      const positions = position.getArray() instanceof Float32Array ? position.getArray() : Float32Array.from(position.getArray());
      const [out] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(indices.getArray()), positions, 3, null, target * 3, 1);
      if (!out.length) continue;
      prim.setIndices(document.createAccessor().setType('SCALAR').setArray(Uint32Array.from(out)).setBuffer(indices.getBuffer()));
      compactPrimitive(prim);
    }
  }
  await document.transform(prune());
}

/** Regular simplification first; looser passes only if it stalls well short of the target. */
export async function fitTo(document, targetTris, { error = 0.01, allowSloppy = false } = {}) {
  const passes = [];
  let current = triangleCount(document);
  if (current <= targetTris) return { triangles: current, passes, warnings: [] };
  const warnings = [];
  const first = await reduce(document, targetTris / current, true, error);
  warnings.push(...first.warnings);
  current = triangleCount(document);
  passes.push('quality');
  if (current > targetTris * 1.25) {
    await reduce(document, targetTris / current, false, Math.max(error, 0.05));
    current = triangleCount(document);
    passes.push('unlocked borders');
  }
  if (allowSloppy && current > targetTris * 1.25) {
    await sloppyTo(document, targetTris);
    current = triangleCount(document);
    passes.push('coarse');
  }
  return { triangles: current, passes, warnings: current > targetTris * 1.25 ? warnings : [] };
}

/** Turns a parsed Document into a positions-only collision mesh, in place. */
export async function collisionFromDocument(document, targetTris) {
  const root = document.getRoot();
  for (const anim of root.listAnimations()) anim.dispose();
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) if (semantic !== 'POSITION') prim.setAttribute(semantic, null);
      for (const target of prim.listTargets()) target.dispose();
      prim.setMaterial(null);
    }
  }
  for (const material of root.listMaterials()) material.dispose();
  await document.transform(prune(), dedup(), flatten(), join({ keepNamed: false }), weld());
  await fitTo(document, targetTris, { error: 0.25, allowSloppy: true });
  return document;
}
