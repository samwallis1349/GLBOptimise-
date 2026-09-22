/**
 * Recursively releases GPU resources for an Object3D subtree: geometries,
 * materials, and any textures referenced by those materials. Required
 * before dropping a reference to a previous preview model, or Three.js
 * will leak GPU memory across model switches.
 */
export function disposeModel(root) {
  if (!root) return;

  root.traverse((node) => {
    if (node.geometry) {
      node.geometry.dispose();
    }
    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        disposeMaterial(material);
      }
    }
  });
}

function disposeMaterial(material) {
  if (!material) return;
  const textureKeys = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'emissiveMap',
    'alphaMap',
    'bumpMap',
    'displacementMap',
    'clearcoatMap',
    'clearcoatNormalMap',
    'clearcoatRoughnessMap',
    'transmissionMap',
    'thicknessMap',
    'sheenColorMap',
    'sheenRoughnessMap',
    'specularMap',
    'specularColorMap',
    'specularIntensityMap',
    'envMap',
  ];
  for (const key of textureKeys) {
    const tex = material[key];
    if (tex && typeof tex.dispose === 'function') tex.dispose();
  }
  material.dispose();
}
