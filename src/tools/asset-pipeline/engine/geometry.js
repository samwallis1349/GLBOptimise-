import { Primitive } from '@gltf-transform/core';
import { dedup, getGLPrimitiveCount, join, normals, prune, quantize, reorder, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { reducePolys } from '../../reduce-polys/ReducePolysEngine.js';

/**
 * Geometry stage. Simplification is the site's Reduce Polys engine
 * (meshoptimizer through glTF-Transform's simplifyPrimitive), driven with a
 * per-mesh ratio so that:
 *   - per-mesh targets, minimum and maximum triangle counts are honoured;
 *   - skinned and morph-target meshes are skipped unless `allowDeforming`
 *     is on — static-mesh operations are never applied blindly to
 *     characters.
 *
 * Preservation that is inherent to the simplifier (UV seams, hard edges via
 * split normals, vertex colours, skin weights, material assignment, mesh
 * names) is reported as such in the UI rather than shown as fake toggles.
 */

export function triangleCount(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) if (prim.getMode() === Primitive.Mode.TRIANGLES) total += getGLPrimitiveCount(prim);
  }
  return total;
}

/** Meshes that deform at runtime: referenced by a skinned node, or carrying morph targets. */
export function deformingMeshes(document) {
  const set = new Map();
  for (const node of document.getRoot().listNodes()) {
    if (node.getSkin() && node.getMesh()) set.set(node.getMesh(), 'skinned');
  }
  for (const mesh of document.getRoot().listMeshes()) {
    if (!set.has(mesh) && mesh.listPrimitives().some((p) => p.listTargets().length)) set.set(mesh, 'morph targets');
  }
  return set;
}

/**
 * Removes triangles that repeat a vertex index or have (near) zero area.
 * Real, index-level work: returns how many triangles were dropped.
 */
export function removeDegenerateTriangles(document) {
  let removed = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      if (!indices || !position) continue;
      const src = indices.getArray();
      const keep = [];
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const c = [0, 0, 0];
      for (let i = 0; i + 2 < src.length; i += 3) {
        const i0 = src[i];
        const i1 = src[i + 1];
        const i2 = src[i + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;
        position.getElement(i0, a);
        position.getElement(i1, b);
        position.getElement(i2, c);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (cx * cx + cy * cy + cz * cz < 1e-24) continue;
        keep.push(i0, i1, i2);
      }
      const dropped = src.length / 3 - keep.length / 3;
      if (dropped > 0) {
        removed += dropped;
        const ArrayType = src.constructor;
        // Shared index accessors are cloned so other primitives are untouched.
        const target = indices.listParents().filter((p) => p.propertyType === 'Primitive').length > 1 ? indices.clone() : indices;
        target.setArray(new ArrayType(keep));
        prim.setIndices(target);
      }
    }
  }
  return removed;
}

/**
 * Resolves the keep-ratio for one mesh from the geometry settings.
 * Exported for the planner preview so it and the engine cannot disagree.
 */
export function meshKeepRatio(g, meshTris, modelTris) {
  if (!meshTris) return 1;
  let target;
  if (g.targetMode === 'triangles') {
    target = g.scope === 'mesh' ? g.targetTriangles : (g.targetTriangles * meshTris) / Math.max(1, modelTris);
  } else {
    target = (meshTris * g.keepPercent) / 100;
  }
  if (g.maxTriangles > 0) {
    const cap = g.scope === 'mesh' ? g.maxTriangles : (g.maxTriangles * meshTris) / Math.max(1, modelTris);
    target = Math.min(target, cap);
  }
  if (g.minTriangles > 0) {
    const floor = g.scope === 'mesh' ? g.minTriangles : (g.minTriangles * meshTris) / Math.max(1, modelTris);
    target = Math.max(target, Math.min(meshTris, floor));
  }
  return Math.max(0.001, Math.min(1, target / meshTris));
}

export async function optimiseGeometry({ document, settings, log }) {
  const g = settings.geometry;
  const result = { simplified: null, degenerateRemoved: 0, ops: [], meshReports: [] };

  if (g.dedupe) {
    await document.transform(dedup({ keepUniqueNames: true }));
    result.ops.push('deduplicate geometry');
  }
  if (g.weld) {
    await document.transform(weld());
    result.ops.push('weld duplicate vertices');
  }
  if (g.removeDegenerate) {
    result.degenerateRemoved = removeDegenerateTriangles(document);
    result.ops.push(`remove degenerate triangles (${result.degenerateRemoved})`);
  }

  const before = triangleCount(document);
  if (g.simplify && before > 0) {
    const deforming = deformingMeshes(document);
    const ratioForMesh = (mesh, meshTris) => {
      const kind = deforming.get(mesh);
      if (kind && !g.allowDeforming) return { skip: `Protected: ${kind} mesh (allow deforming-mesh simplification to change it).` };
      return meshKeepRatio(g, meshTris, before);
    };
    const run = await reducePolys({
      document,
      ratio: 1,
      options: { lockBorder: g.lockBorder, error: g.error, cleanup: false, ratioForMesh },
    });
    const after = triangleCount(document);
    result.simplified = { before, after };
    result.meshReports = run.meshReports.map(({ name, before: b, after: a, status, reason }) => ({ name, before: b, after: a, status, reason }));
    result.ops.push(`simplify (meshoptimizer, ${g.scope === 'mesh' ? 'per mesh' : 'whole model'}): ${before} → ${after} triangles`);
    const skipped = result.meshReports.filter((m) => m.status === 'Skipped');
    if (skipped.length) log.info(`${skipped.length} mesh(es) not simplified: ${[...new Set(skipped.map((m) => m.reason))].join('; ')}`);
    const stalled = result.meshReports.filter((m) => m.status === 'Unchanged');
    if (stalled.length) log.warn(`${stalled.length} mesh(es) could not be reduced within the error limit (${g.error}). Raise the error limit or unlock borders to go further.`);
    if (g.allowDeforming && deforming.size) {
      log.warn(`Simplified ${deforming.size} deforming mesh(es) (skinned or morph targets). Check deformation and blend shapes in the preview.`);
    }
  }

  if (g.recalcNormals) {
    await document.transform(normals({ overwrite: true }));
    result.ops.push('recalculate normals');
    log.warn('Normals were recalculated: authored smoothing / custom normals are replaced.');
  }

  if (g.joinPrimitives) {
    // Joins primitives that share a material inside the same mesh; names and nodes are kept.
    const draws = countPrimitives(document);
    await document.transform(join({ keepMeshes: true, keepNamed: true }));
    result.ops.push(`join compatible primitives (${draws} → ${countPrimitives(document)} draw calls)`);
  }

  if (g.reorder) {
    await MeshoptEncoder.ready;
    await document.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
    result.ops.push('reorder for vertex cache');
  }

  // Simplification leaves orphaned accessors behind.
  await document.transform(prune({ keepExtras: true, keepAttributes: true, keepSolidTextures: true, keepLeaves: true }));
  return result;
}

export function countPrimitives(document) {
  return document.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
}

export async function quantizeGeometry(document) {
  await document.transform(quantize());
}
