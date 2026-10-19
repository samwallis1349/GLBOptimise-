/**
 * Frees the GPU resources of a model that is no longer shown: geometries,
 * materials and every texture they reference. Safe to call on shared
 * resources more than once.
 */
import { materialsOf, texturesOf } from './inspect.js';

export function disposeObject(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of materialsOf(o)) {
      materials.add(m);
      for (const [, t] of texturesOf(m)) textures.add(t);
    }
    if (o.isSkinnedMesh && o.skeleton?.boneTexture) o.skeleton.dispose();
  });
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => { t.image?.close?.(); t.dispose(); });
  materials.forEach((m) => m.dispose());
  root.removeFromParent();
}
