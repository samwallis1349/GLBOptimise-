/**
 * Rig analysis — reads the glTF-Transform Document directly rather than the
 * Three.js scene (see RigViewer.js for that side), because skin/joint/weight
 * data is easiest to validate straight from the raw accessors before Three.js
 * has folded any of it into runtime Bone/Skeleton objects.
 *
 * Every number here is measured from the parsed document, never estimated.
 */

/** Builds a child -> parent lookup once, since glTF-Transform only exposes children. */
function buildParentMap(document) {
  const map = new Map();
  for (const node of document.getRoot().listNodes()) {
    for (const child of node.listChildren()) map.set(child, node);
  }
  return map;
}

function depthOf(node, parentMap) {
  let depth = 0;
  let cur = node;
  const seen = new Set();
  while (parentMap.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = parentMap.get(cur);
    depth += 1;
  }
  return depth;
}

function ultimateRoot(node, parentMap) {
  let cur = node;
  const seen = new Set();
  while (parentMap.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = parentMap.get(cur);
  }
  return cur;
}

/**
 * @param {import('@gltf-transform/core').Document} document
 */
export function analyseRig(document) {
  const root = document.getRoot();
  const skins = root.listSkins();
  const parentMap = buildParentMap(document);

  const skinReports = [];
  let totalJoints = 0;
  let maxDepth = 0;
  const globalNameCounts = new Map();

  for (const skin of skins) {
    const joints = skin.listJoints();
    const jointSet = new Set(joints);
    const skeletonRoot = skin.getSkeleton();
    const nameCounts = new Map();

    const jointEntries = joints.map((joint) => {
      const name = joint.getName() || '(unnamed joint)';
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
      globalNameCounts.set(name, (globalNameCounts.get(name) || 0) + 1);
      const depth = depthOf(joint, parentMap);
      maxDepth = Math.max(maxDepth, depth);
      return {
        name,
        depth,
        childCount: joint.listChildren().filter((c) => jointSet.has(c)).length,
      };
    });
    jointEntries.sort((a, b) => a.depth - b.depth);

    const roots = new Set(joints.map((j) => ultimateRoot(j, parentMap)));
    const duplicateNames = [...nameCounts.entries()].filter(([, n]) => n > 1).map(([name]) => name);
    const shallowest = jointEntries.reduce(
      (min, j) => (min === null || j.depth < min.depth ? j : min),
      null
    );

    totalJoints += joints.length;

    skinReports.push({
      name: skin.getName() || '(unnamed skin)',
      jointCount: joints.length,
      hasExplicitSkeletonRoot: Boolean(skeletonRoot),
      rootName: skeletonRoot ? skeletonRoot.getName() || '(unnamed)' : shallowest?.name || null,
      disconnectedGroups: roots.size,
      duplicateNames,
      joints: jointEntries,
    });
  }

  // Skinning weight validation, across every skinned primitive in the file.
  let skinnedVertexCount = 0;
  let unweightedVertexCount = 0;
  let misnormalizedVertexCount = 0;
  let eightInfluenceVertexCount = 0;
  let skinnedPrimitiveCount = 0;
  const meshEntries = [];

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const weights0 = prim.getAttribute('WEIGHTS_0');
      const joints0 = prim.getAttribute('JOINTS_0');
      if (!weights0 || !joints0) continue;

      skinnedPrimitiveCount += 1;
      const weights1 = prim.getAttribute('WEIGHTS_1');
      const count = weights0.getCount();
      let unweighted = 0;
      let misnormalized = 0;
      let eightInfluence = 0;
      const w0 = [0, 0, 0, 0];
      const w1 = [0, 0, 0, 0];

      for (let i = 0; i < count; i += 1) {
        weights0.getElement(i, w0);
        let sum = w0[0] + w0[1] + w0[2] + w0[3];
        if (weights1) {
          weights1.getElement(i, w1);
          const extra = w1[0] + w1[1] + w1[2] + w1[3];
          sum += extra;
          if (extra > 0.0005) eightInfluence += 1;
        }
        if (sum < 0.0005) unweighted += 1;
        else if (Math.abs(sum - 1) > 0.02) misnormalized += 1;
      }

      skinnedVertexCount += count;
      unweightedVertexCount += unweighted;
      misnormalizedVertexCount += misnormalized;
      eightInfluenceVertexCount += eightInfluence;

      meshEntries.push({
        name: mesh.getName() || '(unnamed mesh)',
        vertexCount: count,
        unweighted,
        misnormalized,
        usesEightInfluences: eightInfluence > 0,
      });
    }
  }

  const globalDuplicateNames = [...globalNameCounts.entries()].filter(([, n]) => n > 1).map(([name]) => name);

  return {
    skinCount: skins.length,
    totalJoints,
    maxDepth,
    skinnedPrimitiveCount,
    skinnedVertexCount,
    unweightedVertexCount,
    misnormalizedVertexCount,
    eightInfluenceVertexCount,
    globalDuplicateNames,
    skins: skinReports,
    meshEntries,
    animationCount: root.listAnimations().length,
  };
}

/**
 * Turns the analysis into the MODEL CHECK list. Every line reflects a real
 * property of the parsed file — nothing here is a guess, and a file with no
 * skin at all is reported as such rather than silently showing an empty
 * skeleton panel.
 */
export function buildRigChecks(analysis) {
  const items = [];

  if (analysis.skinCount === 0) {
    items.push({ level: 'error', text: 'No skeletal rig (skin) found in this file — nothing to inspect.' });
    return { items, hasRig: false };
  }

  items.push({
    level: 'ok',
    text: `${analysis.skinCount} skin${analysis.skinCount === 1 ? '' : 's'} found, ${analysis.totalJoints} joint${
      analysis.totalJoints === 1 ? '' : 's'
    } total`,
  });

  items.push({
    level: 'ok',
    text: `${analysis.skinnedPrimitiveCount} skinned primitive${
      analysis.skinnedPrimitiveCount === 1 ? '' : 's'
    }, ${analysis.skinnedVertexCount.toLocaleString()} skinned vertices`,
  });

  if (analysis.unweightedVertexCount === 0) {
    items.push({ level: 'ok', text: 'Every skinned vertex has at least one non-zero joint weight' });
  } else {
    items.push({
      level: 'error',
      text: `${analysis.unweightedVertexCount.toLocaleString()} vertex(es) have zero total joint weight — they will not deform with the rig`,
    });
  }

  if (analysis.misnormalizedVertexCount === 0) {
    items.push({ level: 'ok', text: 'Joint weights sum to 1.0 on every vertex' });
  } else {
    items.push({
      level: 'warn',
      text: `${analysis.misnormalizedVertexCount.toLocaleString()} vertex(es) have weights that do not sum to 1.0 — expect minor deformation drift`,
    });
  }

  if (analysis.eightInfluenceVertexCount > 0) {
    items.push({
      level: 'ok',
      text: `Uses 8-influence skinning (WEIGHTS_0 + WEIGHTS_1) on ${analysis.eightInfluenceVertexCount.toLocaleString()} vertex(es) — confirm the target engine supports more than 4 joints per vertex`,
    });
  }

  const skinsWithDupes = analysis.skins.filter((s) => s.duplicateNames.length > 0);
  if (skinsWithDupes.length === 0) {
    items.push({ level: 'ok', text: 'No duplicate joint names within any skin' });
  } else {
    const total = skinsWithDupes.reduce((n, s) => n + s.duplicateNames.length, 0);
    items.push({
      level: 'warn',
      text: `${total} joint name${total === 1 ? '' : 's'} duplicated within a skin — engines that key bones by name may misbehave`,
    });
  }

  const disconnected = analysis.skins.filter((s) => s.disconnectedGroups > 1);
  if (disconnected.length === 0) {
    items.push({ level: 'ok', text: "Every skin's joints form a single connected hierarchy" });
  } else {
    items.push({
      level: 'warn',
      text: `${disconnected.length} skin(s) have joints split across more than one disconnected hierarchy`,
    });
  }

  const noExplicitRoot = analysis.skins.filter((s) => !s.hasExplicitSkeletonRoot);
  if (noExplicitRoot.length > 0) {
    items.push({
      level: 'warn',
      text: `${noExplicitRoot.length} skin(s) have no explicit skeleton root — the root shown here is inferred from the shallowest joint`,
    });
  }

  if (analysis.totalJoints > 200) {
    items.push({
      level: 'warn',
      text: `${analysis.totalJoints} joints is a lot for realtime skinning — mobile/VR targets typically budget well under this`,
    });
  }

  if (analysis.animationCount > 0) {
    items.push({
      level: 'ok',
      text: `${analysis.animationCount} animation clip${analysis.animationCount === 1 ? '' : 's'} reference this rig (not played back here — see Animation Inspector)`,
    });
  }

  return { items, hasRig: true };
}
