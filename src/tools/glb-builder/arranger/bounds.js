import * as THREE from 'three';

const _v = new THREE.Vector3();

/**
 * World-space bounding box of an object's visible meshes.
 *
 * precise = true walks every vertex (including skinning and morph targets via
 * getVertexPosition), so the box hugs the visible surface even when the object
 * is rotated. Used for Snap to Floor and gap arrangement, where "touching" and
 * "0.5 m apart" must mean the actual mesh, not a loose transformed AABB.
 */
export function worldBox(object, precise = false, target = new THREE.Box3()) {
  target.makeEmpty();
  object.updateWorldMatrix(true, true);
  const visit = (node) => {
    if (!node.visible) return;
    if ((node.isMesh || node.isPoints || node.isLine) && node.geometry?.attributes?.position) {
      const geometry = node.geometry;
      if (precise) {
        const count = geometry.attributes.position.count;
        const step = count > 400000 ? Math.ceil(count / 400000) : 1;
        for (let i = 0; i < count; i += step) {
          node.getVertexPosition ? node.getVertexPosition(i, _v) : _v.fromBufferAttribute(geometry.attributes.position, i);
          target.expandByPoint(_v.applyMatrix4(node.matrixWorld));
        }
      } else {
        let box;
        if (node.isSkinnedMesh) {
          node.computeBoundingBox();
          box = node.boundingBox;
        } else {
          if (!geometry.boundingBox) geometry.computeBoundingBox();
          box = geometry.boundingBox;
        }
        target.union(_box.copy(box).applyMatrix4(node.matrixWorld));
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(object);
  return target;
}

const _box = new THREE.Box3();
