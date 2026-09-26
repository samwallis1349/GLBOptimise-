import * as THREE from 'three';

/**
 * Points `camera` (and optional OrbitControls) at `object` so it's centred
 * and fully visible, whatever its scale or origin.
 * @returns {{ center: THREE.Vector3, radius: number } | null}
 */
export function frameModel(camera, object, controls = null, direction = new THREE.Vector3(1, 0.65, 1)) {
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) return null;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.001);
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.3;
  camera.position.copy(sphere.center).add(direction.clone().normalize().multiplyScalar(distance));
  camera.near = Math.max(distance / 100, 0.0005);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.copy(sphere.center);
    controls.update();
  } else {
    camera.lookAt(sphere.center);
  }
  return { center: sphere.center, radius, box };
}
