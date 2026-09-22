import { Primitive } from '@gltf-transform/core';
import { getGLPrimitiveCount } from '@gltf-transform/functions';

/**
 * Geometry analysis for LOD generation.
 *
 * A near-identical copy of Reduce Polys's ReducePolysAnalysis.js — both
 * tools drive the same meshoptimizer simplifier and need the same picture
 * of what can and cannot be simplified. Kept as its own copy rather than a
 * shared import for the same reason Reduce Polys itself is self-contained
 * (see the project README's "known divergence" note); `computeBoundingRadius`
 * below is the one addition specific to this tool.
 *
 * Every number here is measured from the parsed document. Nothing is
 * estimated except where explicitly labelled as a suggestion or target.
 */

const TRIANGLE_MODES = new Set([
  Primitive.Mode.TRIANGLES,
  Primitive.Mode.TRIANGLE_STRIP,
  Primitive.Mode.TRIANGLE_FAN,
]);

const MODE_NAMES = {
  [Primitive.Mode.POINTS]: 'POINTS',
  [Primitive.Mode.LINES]: 'LINES',
  [Primitive.Mode.LINE_LOOP]: 'LINE_LOOP',
  [Primitive.Mode.LINE_STRIP]: 'LINE_STRIP',
  [Primitive.Mode.TRIANGLES]: 'TRIANGLES',
  [Primitive.Mode.TRIANGLE_STRIP]: 'TRIANGLE_STRIP',
  [Primitive.Mode.TRIANGLE_FAN]: 'TRIANGLE_FAN',
};

/**
 * @param {import('@gltf-transform/core').Document} document
 */
export function analyseGeometry(document) {
  const root = document.getRoot();
  const meshes = [];

  let triangleCount = 0;
  let vertexCount = 0;
  let primitiveCount = 0;
  let nonTriangleCount = 0;
  let missingNormals = 0;
  let missingUVs = 0;

  for (const mesh of root.listMeshes()) {
    const entry = {
      name: mesh.getName() || '(unnamed mesh)',
      triangles: 0,
      vertices: 0,
      primitives: [],
      reducible: false,
      skipReason: null,
    };

    mesh.listPrimitives().forEach((prim, index) => {
      primitiveCount += 1;
      const mode = prim.getMode();
      const isTriangles = TRIANGLE_MODES.has(mode);
      // meshoptimizer's simplifier operates on indexed triangle lists only.
      const simplifiable = mode === Primitive.Mode.TRIANGLES;
      const position = prim.getAttribute('POSITION');
      const verts = position ? position.getCount() : 0;
      const tris = isTriangles ? getGLPrimitiveCount(prim) : 0;

      if (!isTriangles) nonTriangleCount += 1;
      if (!prim.getAttribute('NORMAL')) missingNormals += 1;
      if (!prim.getAttribute('TEXCOORD_0')) missingUVs += 1;

      triangleCount += tris;
      vertexCount += verts;
      entry.triangles += tris;
      entry.vertices += verts;

      entry.primitives.push({
        index,
        mode: MODE_NAMES[mode] || String(mode),
        simplifiable,
        triangles: tris,
        vertices: verts,
        hasPosition: Boolean(position),
        hasNormal: Boolean(prim.getAttribute('NORMAL')),
        hasUV: Boolean(prim.getAttribute('TEXCOORD_0')),
        hasColour: Boolean(prim.getAttribute('COLOR_0')),
        hasJoints: Boolean(prim.getAttribute('JOINTS_0')),
        morphTargets: prim.listTargets().length,
        material: prim.getMaterial()?.getName() || null,
        skipReason: !position
          ? 'No POSITION attribute'
          : !simplifiable
            ? `Unsupported primitive mode (${MODE_NAMES[mode] || mode})`
            : null,
      });
    });

    entry.reducible = entry.primitives.some((p) => p.simplifiable && p.hasPosition);
    if (!entry.reducible) {
      entry.skipReason =
        entry.primitives.find((p) => p.skipReason)?.skipReason || 'No simplifiable geometry';
    }
    meshes.push(entry);
  }

  const materials = root.listMaterials();
  const skins = root.listSkins();
  const animations = root.listAnimations();
  let morphTargetCount = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) morphTargetCount += prim.listTargets().length;
  }

  return {
    triangleCount,
    vertexCount,
    meshCount: root.listMeshes().length,
    primitiveCount,
    materialCount: materials.length,
    meshes,
    capabilities: {
      isSkinned: skins.length > 0,
      isAnimated: animations.length > 0,
      hasMorphTargets: morphTargetCount > 0,
      hasVertexColours: root.listMeshes().some((m) =>
        m.listPrimitives().some((p) => p.getAttribute('COLOR_0'))
      ),
      hasTransparency: materials.some((m) => ['BLEND', 'MASK'].includes(m.getAlphaMode())),
      multipleMaterials: materials.length > 1,
      nonTriangleCount,
      missingNormals,
      missingUVs,
      skinCount: skins.length,
      animationCount: animations.length,
      morphTargetCount,
    },
  };
}

/**
 * Turns the analysis into the MODEL CHECK list, shown once before any LOD
 * has been generated. Every line reflects a real property of the parsed
 * model, and anything that cannot be simplified is reported as skipped
 * rather than quietly dropped from every level.
 */
export function buildSafetyReport(analysis) {
  const items = [];
  const c = analysis.capabilities;

  if (analysis.triangleCount === 0) {
    items.push({ level: 'error', text: 'No triangle geometry found — there is nothing to generate LODs from.' });
    return { items, canProceed: false };
  }

  const reducibleMeshes = analysis.meshes.filter((m) => m.reducible).length;
  items.push({
    level: 'ok',
    text: `${reducibleMeshes} of ${analysis.meshCount} mesh${analysis.meshCount === 1 ? '' : 'es'} can be simplified`,
  });

  if (c.missingNormals === 0) items.push({ level: 'ok', text: 'Normals detected on every primitive' });
  else items.push({ level: 'warn', text: `${c.missingNormals} primitive(s) have no normals — shading may change` });

  if (c.missingUVs === 0) items.push({ level: 'ok', text: 'UVs detected — seams are preserved by the simplifier' });
  else items.push({ level: 'warn', text: `${c.missingUVs} primitive(s) have no UVs` });

  if (c.multipleMaterials) {
    items.push({
      level: 'ok',
      text: `${analysis.materialCount} materials — boundaries preserved in every level (each is simplified separately)`,
    });
  }

  if (c.isSkinned) {
    items.push({
      level: 'ok',
      text: `Skinned mesh detected (${c.skinCount} skin) — joints and weights are carried through every level`,
    });
  }
  if (c.isAnimated) {
    items.push({
      level: 'ok',
      text: `${c.animationCount} animation(s) — untouched in every level, geometry reduction does not alter them`,
    });
  }
  if (c.hasMorphTargets) {
    items.push({
      level: 'ok',
      text: `${c.morphTargetCount} morph target(s) — resized in step with each level's base mesh`,
    });
  }
  if (c.hasVertexColours) items.push({ level: 'ok', text: 'Vertex colours detected — carried through' });
  if (c.hasTransparency) items.push({ level: 'ok', text: 'Transparent materials detected — untouched' });

  if (c.nonTriangleCount > 0) {
    items.push({
      level: 'warn',
      text: `${c.nonTriangleCount} primitive(s) are points/lines/strips and will be skipped in every level, not reduced`,
    });
  }

  if (analysis.triangleCount < 1000) {
    items.push({
      level: 'warn',
      text: `This model already has a low triangle count (${analysis.triangleCount.toLocaleString()}). A long LOD chain may provide little benefit.`,
    });
  }

  return { items, canProceed: reducibleMeshes > 0 };
}

/**
 * Approximate bounding-sphere radius of the document's geometry, in the
 * model's own local units — computed from raw POSITION data across every
 * mesh, ignoring node/scene-graph transforms (the same simplification the
 * rest of this tool's geometry analysis makes). It powers the suggested
 * switch-distance panel; it is not a substitute for a real scene-space
 * bounding volume and is labelled as an estimate everywhere it is shown.
 * @param {import('@gltf-transform/core').Document} document
 * @returns {number}
 */
export function computeBoundingRadius(document) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (!position) continue;
      const arr = position.getArray();
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i], y = arr[i + 1], z = arr[i + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }

  if (!Number.isFinite(minX)) return 0;
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
}

export { Primitive, getGLPrimitiveCount };
