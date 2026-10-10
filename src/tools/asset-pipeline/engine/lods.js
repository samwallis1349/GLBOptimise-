import { PropertyType } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { reducePolys } from '../../reduce-polys/ReducePolysEngine.js';
import { collisionFromDocument } from '../../../../worker/api/collision.js';
import { deformingMeshes, triangleCount } from './geometry.js';

/**
 * LOD generation. Same rule as the Generate LODs tool: every level is
 * simplified from a FRESH parse of the geometry entering this stage, never
 * from the previous level, so "LOD2 keeps 25%" always means 25% of LOD0.
 * The simplifier is the Reduce Polys engine (meshoptimizer).
 *
 * Per-level minimum triangle counts are distributed across meshes in
 * proportion to their size. Deforming meshes are copied unchanged unless
 * deforming-mesh simplification is allowed.
 */
export async function generateLods({ document, settings, io, log }) {
  const { levels, lockBorder, error } = settings.lods;
  const snapshot = await io.writeBinary(document);
  const baseTris = triangleCount(document);
  const variants = [];
  const reports = [];

  for (let i = 0; i < levels.length; i += 1) {
    const level = levels[i];
    const keep = level.keep / 100;
    const doc = i === 0 ? document : await io.readBinary(snapshot);
    let protectedTris = 0;
    if (keep < 0.999 && baseTris > 0) {
      const deforming = deformingMeshes(doc);
      const levelFloor = level.minTriangles || 0;
      await reducePolys({
        document: doc,
        ratio: keep,
        options: {
          lockBorder,
          error,
          cleanup: true,
          ratioForMesh: (mesh, meshTris) => {
            if (deforming.has(mesh) && !settings.geometry.allowDeforming) {
              protectedTris += meshTris;
              return { skip: `Protected: ${deforming.get(mesh)} mesh` };
            }
            const floorShare = levelFloor ? (levelFloor * meshTris) / baseTris : 0;
            return Math.min(1, Math.max(keep, meshTris ? floorShare / meshTris : 1));
          },
        },
      });
    }
    const triangles = triangleCount(doc);
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
    scene?.setExtras({ ...(scene.getExtras() || {}), assetbenchLod: { level: i, keepPercent: level.keep, distance: level.distance, screenSize: level.screenSize, triangles } });
    variants.push({ level: i, doc, triangles });
    reports.push({ level: i, keepPercent: level.keep, requested: Math.round(baseTris * keep), triangles, distance: level.distance, screenSize: level.screenSize });
    const expected = protectedTris + (baseTris - protectedTris) * keep;
    if (keep < 0.999 && protectedTris && i === 1) {
      log.info(`${protectedTris.toLocaleString('en-GB')} triangles on skinned / morph-target meshes are copied unchanged into every LOD (deforming-mesh simplification is off).`);
    }
    if (keep < 0.999 && baseTris > protectedTris && triangles > Math.max(expected * 1.5, level.minTriangles || 0)) {
      log.warn(`LOD${i}: stopped at ${triangles.toLocaleString('en-GB')} triangles (asked ~${Math.round(expected).toLocaleString('en-GB')}). The error limit or locked borders are the constraint.`);
    }
  }
  for (let i = 1; i < variants.length; i += 1) {
    if (variants[i].triangles > variants[i - 1].triangles) log.warn(`LOD${i} has more triangles than LOD${i - 1}: the chain is not in decreasing order.`);
  }
  return { variants, reports };
}

/** Grouped export: every level under its own named node in one document. */
export async function groupLods(variants, baseName, lodSuffix) {
  const target = variants[0].doc;
  const targetScene = target.getRoot().getDefaultScene() || target.getRoot().listScenes()[0];
  const wrap = (scene, level) => {
    const group = target.createNode(`${baseName}${lodSuffix.replace('{i}', level)}`);
    for (const child of scene.listChildren()) {
      scene.removeChild(child);
      group.addChild(child);
    }
    return group;
  };
  const groups = [wrap(targetScene, 0)];
  for (const v of variants.slice(1)) {
    const map = mergeDocuments(target, v.doc);
    const srcScene = v.doc.getRoot().getDefaultScene() || v.doc.getRoot().listScenes()[0];
    const merged = map.get(srcScene);
    groups.push(wrap(merged, v.level));
    merged.dispose();
  }
  for (const g of groups) targetScene.addChild(g);
  // GLB holds one buffer; identical textures/materials across levels are stored once.
  await target.transform(unpartition(), dedup({ propertyTypes: [PropertyType.TEXTURE, PropertyType.MATERIAL, PropertyType.ACCESSOR], keepUniqueNames: true }), prune({ keepExtras: true, keepAttributes: true, keepSolidTextures: true, keepLeaves: true }));
  return target;
}

export async function buildCollision({ bytes, io, triangles }) {
  const doc = await io.readBinary(bytes);
  await collisionFromDocument(doc, triangles);
  return io.writeBinary(doc);
}
