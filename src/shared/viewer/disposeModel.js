/**
 * Releases GPU resources for an Object3D subtree: geometries, materials and
 * every texture those materials reference. Call before dropping a preview
 * model, or Three.js leaks GPU memory across model switches.
 */
export function disposeModel(root) {
  if (!root) return;
  root.traverse((node) => {
    node.geometry?.dispose();
    if (node.material) {
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) disposeMaterial(material);
    }
  });
}

export function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose();
}
