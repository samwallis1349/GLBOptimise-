/**
 * Read-only inspection of a loaded model: counts, rig detection, textures and
 * a snapshot of every node's rest transform. Nothing here modifies the model.
 */
import * as THREE from 'three';

export const TEXTURE_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap',
  'bumpMap', 'displacementMap', 'lightMap', 'specularMap', 'envMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
  'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'specularIntensityMap', 'specularColorMap', 'anisotropyMap',
];

export function materialsOf(object) {
  return Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
}

export function texturesOf(material) {
  return TEXTURE_SLOTS.map((slot) => [slot, material[slot]]).filter(([, t]) => t && t.isTexture);
}

function triangleCount(geometry, mode) {
  const index = geometry.index;
  const pos = geometry.getAttribute('position');
  const count = index ? index.count : pos ? pos.count : 0;
  if (mode === 'strip' || mode === 'fan') return Math.max(0, count - 2);
  return Math.floor(count / 3);
}

/** Returns a plain statistics object for the UI, validation and round-trip checks. */
export function inspectModel(root, clips = []) {
  const meshes = [];
  const skinned = [];
  const bones = new Set();
  const skinBones = new Set();
  const materials = new Set();
  const textures = new Set();
  const textureNames = [];
  let triangles = 0;
  let vertices = 0;
  let morphTargets = 0;
  let nanVertices = 0;
  let emptyMeshes = 0;
  let unsupportedMaterials = 0;
  let nonPbrMaterials = 0;
  let hasPoints = false;

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (obj.isBone) bones.add(obj);
    if (obj.isPoints || obj.isLine) hasPoints = true;
    if (!obj.isMesh) return;
    meshes.push(obj);
    const g = obj.geometry;
    const pos = g?.getAttribute('position');
    if (!pos || pos.count === 0) emptyMeshes++;
    else {
      vertices += pos.count;
      const tris = triangleCount(g, obj.drawMode) * (obj.isInstancedMesh ? obj.count : 1);
      triangles += tris;
      // Sample positions for NaN/Infinity (all of them for small meshes).
      const step = Math.max(1, Math.floor(pos.count / 5000));
      for (let i = 0; i < pos.count; i += step) {
        if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) { nanVertices++; break; }
      }
    }
    if (g?.morphAttributes?.position) morphTargets += g.morphAttributes.position.length;
    if (obj.isSkinnedMesh) {
      skinned.push(obj);
      obj.skeleton?.bones.forEach((b) => { if (b) { bones.add(b); skinBones.add(b); } });
    }
    for (const m of materialsOf(obj)) {
      if (materials.has(m)) continue;
      materials.add(m);
      if (m.isShaderMaterial || m.isRawShaderMaterial) unsupportedMaterials++;
      else if (!m.isMeshStandardMaterial && !m.isMeshBasicMaterial) nonPbrMaterials++;
      for (const [slot, t] of texturesOf(m)) {
        if (textures.has(t)) continue;
        textures.add(t);
        textureNames.push({ slot, name: t.name || t.image?.src?.split('/').pop()?.slice(0, 60) || slot, missingImage: !t.image });
      }
    }
  });

  const skinnedInfo = skinned.map((mesh) => {
    const g = mesh.geometry;
    return {
      name: mesh.name || '(unnamed)',
      hasSkeleton: !!mesh.skeleton && mesh.skeleton.bones.length > 0,
      boneCount: mesh.skeleton?.bones.length ?? 0,
      hasSkinAttributes: !!g?.getAttribute('skinIndex') && !!g?.getAttribute('skinWeight'),
      missingBones: mesh.skeleton ? mesh.skeleton.bones.filter((b) => !b).length : 0,
    };
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());

  return {
    meshCount: meshes.length,
    skinnedMeshCount: skinned.length,
    skinnedInfo,
    boneCount: bones.size,
    skinBoneCount: skinBones.size,
    boneNames: [...bones].map((b) => b.name),
    hasSkeleton: bones.size > 0,
    triangles,
    vertices,
    materialCount: materials.size,
    textureCount: textures.size,
    textureNames,
    morphTargets,
    nanVertices,
    emptyMeshes,
    unsupportedMaterials,
    nonPbrMaterials,
    hasPoints,
    clipCount: clips.length,
    clips: clips.map(clipSummary),
    size: { x: size.x, y: size.y, z: size.z },
  };
}

export function clipSummary(clip) {
  return { name: clip.name || '(unnamed clip)', duration: clip.duration, tracks: clip.tracks.length };
}

/**
 * Checks which tracks of a clip can bind to a node in `root`. Used to judge
 * whether an external animation pack fits the current character and to warn
 * before export about tracks that would be dropped.
 */
export function trackBinding(clip, root) {
  const names = new Set();
  root.traverse((o) => { if (o.name) names.add(o.name); });
  let bound = 0;
  const unbound = [];
  for (const track of clip.tracks) {
    let nodeName;
    try { nodeName = THREE.PropertyBinding.parseTrackName(track.name).nodeName; } catch { nodeName = null; }
    if (nodeName && (names.has(nodeName) || nodeName === root.name)) bound++;
    else unbound.push(track.name);
  }
  return { total: clip.tracks.length, bound, unbound };
}

/** Records every node's local transform in traversal order. */
export function snapshotRestPose(root) {
  const nodes = [];
  root.traverse((o) => nodes.push([o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  return nodes;
}

/** Restores a snapshot onto `root` (or a structural clone of it). */
export function applyRestPose(root, snapshot) {
  let i = 0;
  root.traverse((o) => {
    const s = snapshot[i++];
    if (!s) return;
    o.position.copy(s[0]); o.quaternion.copy(s[1]); o.scale.copy(s[2]);
  });
  root.updateMatrixWorld(true);
}

/** Bounding box of the bind/rest pose in world space, ignoring skinning deformation. */
export function restBounds(object) {
  return new THREE.Box3().setFromObject(object, false);
}
