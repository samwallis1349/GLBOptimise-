import * as THREE from 'three';

/** Built-in demo model (animated treasure chest) so the viewer isn't empty on first visit. */

function woodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#7a4a26';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = y % 64 ? '#6c3f1f' : '#84522b';
    g.fillRect(0, y, 256, 30);
    g.fillStyle = '#3e2412';
    g.fillRect(0, y + 30, 256, 2);
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = 'rgba(40,20,8,.25)';
      g.beginPath();
      const yy = y + 3 + Math.random() * 24;
      g.moveTo(0, yy);
      g.bezierCurveTo(80, yy + 4, 170, yy - 4, 256, yy + 1);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.name = 'chest_wood';
  return tex;
}

export function sampleChest() {
  const wood = new THREE.MeshStandardMaterial({ name: 'Wood', map: woodTexture(), roughness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ name: 'Gold', color: 0xd9a431, metalness: 0.9, roughness: 0.3 });
  const iron = new THREE.MeshStandardMaterial({ name: 'Iron', color: 0x3b3f45, metalness: 0.7, roughness: 0.5 });
  const lift = 0.06;

  const root = new THREE.Group();
  root.name = 'TreasureChest';

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), wood);
  body.name = 'Body';
  body.position.y = 0.35 + lift;
  root.add(body);

  const hinge = new THREE.Group();
  hinge.name = 'Lid';
  hinge.position.set(0, 0.7 + lift, -0.4);
  root.add(hinge);

  const lidGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 16, 1, false, 0, Math.PI);
  lidGeo.rotateZ(Math.PI / 2);
  lidGeo.rotateX(Math.PI / 2);
  const lid = new THREE.Mesh(lidGeo, wood);
  lid.name = 'LidShell';
  lid.position.z = 0.4;
  lid.rotation.x = -Math.PI / 2;
  hinge.add(lid);

  for (const x of [-0.45, 0.45]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.82), gold);
    band.name = 'Band';
    band.position.set(x, 0.35 + lift, 0);
    root.add(band);

    const lidBand = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.1, 16, 1, false, 0, Math.PI), gold);
    lidBand.name = 'LidBand';
    lidBand.geometry.rotateZ(Math.PI / 2);
    lidBand.geometry.rotateX(Math.PI / 2);
    lidBand.rotation.x = -Math.PI / 2;
    lidBand.position.set(x, 0, 0.4);
    hinge.add(lidBand);
  }

  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), iron);
  lock.name = 'Lock';
  lock.position.set(0, 0.62 + lift, 0.42);
  root.add(lock);

  const footGeo = new THREE.BoxGeometry(0.12, 0.06, 0.12);
  for (const [x, z] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) {
    const foot = new THREE.Mesh(footGeo, iron);
    foot.name = 'Foot';
    foot.position.set(x, 0.03, z);
    root.add(foot);
  }

  const closed = new THREE.Quaternion();
  const open = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.1);
  const track = new THREE.QuaternionKeyframeTrack('Lid.quaternion', [0, 0.6, 1.6, 2.4], [...closed.toArray(), ...open.toArray(), ...open.toArray(), ...closed.toArray()]);

  return { model: root, clips: [new THREE.AnimationClip('LidOpen', 2.4, [track])] };
}
