/**
 * The shared 3D stage: the model inside three wrapper groups, lights, the
 * outline shells, the contact shadow and the animation mixer. The sprite
 * renderer and the live preview both draw this same scene, so the preview
 * shows exactly what gets exported. Preview-only helpers live on layer 1.
 *
 *   turn   (rotation for the direction being drawn)
 *   └ units  (unit scale + "model faces" correction)
 *     └ center (moves the footprint centre to the origin, feet to y = 0)
 *       └ model  (never modified: bones and nodes keep their own transforms)
 */
import * as THREE from 'three';
import { facingRotation } from './presets.js';
import { makeInPlace } from '../../character-workshop/js/agent.js';

const OUTLINE_COLOR = 0x1b1410;

/** Rest pose keyed by node, so outline shells added later can't shift it. */
function snapshotRestPose(root) {
  const map = new Map();
  root.traverse((o) => { if (!o.userData.isOutline) map.set(o, [o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  return map;
}
function applyRestPose(root, snapshot) {
  if (!root || !snapshot) return;
  for (const [o, s] of snapshot) { o.position.copy(s[0]); o.quaternion.copy(s[1]); o.scale.copy(s[2]); }
  root.updateMatrixWorld(true);
}

function outlineMaterial(thickness) {
  const mat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  mat.userData.thickness = { value: thickness };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uThick = mat.userData.thickness;
    shader.vertexShader = 'uniform float uThick;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      'vec3 transformed = vec3( position ) + normalize( normal ) * uThick;',
    );
  };
  return mat;
}

export class Stage {
  constructor() {
    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x5a4a3a, 1.5);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(-3, 8, 5);
    this.rim = new THREE.DirectionalLight(0xffe2b8, 0.6);
    this.rim.position.set(6, 3, -2);
    this.scene.add(this.hemi, this.sun, this.rim);

    this.turn = new THREE.Group();
    this.units = new THREE.Group();
    this.center = new THREE.Group();
    this.turn.add(this.units); this.units.add(this.center);
    this.scene.add(this.turn);

    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.shadow.renderOrder = -1;
    this.scene.add(this.shadow);

    this.model = null;
    this.mixer = null;
    this.restPose = null;
    this.rawBox = new THREE.Box3();
    this.scale = 1;
    this.outlines = [];
    this.inPlaceCache = new Map();
    this.style = { outline: 0, ppm: 90, lighting: 'soft', shadow: true };
  }

  setModel(root) {
    this.clearModel();
    this.model = root;
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.center.add(root);
    this.restPose = snapshotRestPose(root);
    this.mixer = new THREE.AnimationMixer(root);
    this.center.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    // Bounds in the model's own units, measured with every wrapper at identity.
    this.turn.rotation.set(0, 0, 0); this.units.scale.setScalar(1); this.units.rotation.set(0, 0, 0);
    this.scene.updateMatrixWorld(true);
    this.rawBox = new THREE.Box3().setFromObject(root);
    const c = this.rawBox.getCenter(new THREE.Vector3());
    this.center.position.set(-c.x, -this.rawBox.min.y, -c.z);
    this.rebuildOutlines();
  }

  clearModel() {
    this.removeOutlines();
    if (this.mixer) { this.mixer.stopAllAction(); if (this.model) this.mixer.uncacheRoot(this.model); }
    if (this.model) this.center.remove(this.model);
    this.model = null; this.mixer = null; this.restPose = null; this.inPlaceCache.clear();
  }

  /** Raw model height (in its own units). */
  get rawHeight() { return this.rawBox.isEmpty() ? 0 : this.rawBox.max.y - this.rawBox.min.y; }

  /** scale: model units → metres. facingDeg: extra turn if the model doesn't face +Z. */
  setUnits(scale, facingDeg = 0) {
    this.scale = scale > 0 ? scale : 1;
    this.units.scale.setScalar(this.scale);
    this.units.rotation.y = THREE.MathUtils.degToRad(facingDeg);
    this.updateOutlineThickness();
    this.updateShadow();
  }

  /** Height and furthest horizontal reach from the base point, in metres. */
  metrics() {
    if (this.rawBox.isEmpty()) return { height: 1, reach: 0.5 };
    const s = this.rawBox.getSize(new THREE.Vector3());
    return { height: s.y * this.scale, reach: Math.hypot(s.x / 2, s.z / 2) * this.scale };
  }

  /**
   * Height and reach (m) across the rest pose and sampled frames of the given
   * clips, measured on the skinned vertices, so swinging arms and weapons fit.
   */
  measure(clips = [], inPlace = true, samples = 8) {
    if (!this.model) return this.metrics();
    const turn = this.turn.rotation.y;
    this.turn.rotation.y = 0;
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    const meshes = [];
    this.model.traverse((o) => { if (o.isMesh && !o.userData.isOutline && o.visible !== false) meshes.push(o); });
    let height = 0, reach = 0;
    const take = () => {
      this.scene.updateMatrixWorld(true);
      for (const m of meshes) {
        if (m.isSkinnedMesh) { m.skeleton?.update(); m.computeBoundingBox(); tmp.copy(m.boundingBox); }
        else { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); tmp.copy(m.geometry.boundingBox); }
        if (tmp.isEmpty()) continue;
        tmp.applyMatrix4(m.matrixWorld);
        box.union(tmp);
        height = Math.max(height, tmp.max.y);
        for (const x of [tmp.min.x, tmp.max.x]) for (const z of [tmp.min.z, tmp.max.z]) reach = Math.max(reach, Math.hypot(x, z));
      }
    };
    this.pose(null); take();
    for (const clip of clips) {
      for (let i = 0; i < samples; i++) { this.pose(clip, (clip.duration * i) / samples, inPlace); take(); }
    }
    this.pose(null);
    this.turn.rotation.y = turn;
    this.scene.updateMatrixWorld(true);
    if (!(height > 0)) return this.metrics();
    // Corners of an axis-aligned box overstate the reach of a round body a little; that's spare room.
    return { height, reach: Math.max(0.05, reach * 0.9) };
  }

  setStyle(style) {
    Object.assign(this.style, style);
    const flat = this.style.lighting === 'flat';
    this.hemi.intensity = flat ? 2.6 : 1.5;
    this.sun.intensity = flat ? 0.55 : 2.2;
    this.rim.intensity = flat ? 0.2 : 0.6;
    this.updateShadow();
    this.updateOutlineThickness();
  }

  setDirection(dir) { this.turn.rotation.y = facingRotation(dir); }

  /** Poses the model: a clip at a time, or the rest pose when clip is null. */
  pose(clip, time = 0, inPlace = false) {
    if (!this.mixer) return;
    this.mixer.stopAllAction();
    if (!clip) { applyRestPose(this.model, this.restPose); return; }
    applyRestPose(this.model, this.restPose);
    let playable = clip;
    if (inPlace) {
      if (!this.inPlaceCache.has(clip)) this.inPlaceCache.set(clip, makeInPlace(clip, this.model).clip);
      playable = this.inPlaceCache.get(clip) ?? clip;
    }
    const action = this.mixer.clipAction(playable);
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    action.time = Math.min(time, playable.duration);
    this.mixer.update(0);
  }

  /** How far a clip's root travels sideways (m); 0 when it already loops in place. */
  rootTravel(clip) {
    if (!clip || !this.model) return 0;
    const r = makeInPlace(clip, this.model);
    if (!r.clip || !r.node) return 0;
    const ws = r.node.parent ? r.node.parent.getWorldScale(new THREE.Vector3()).x : 1;
    return (r.distance * ws) / (this.turn.getWorldScale(new THREE.Vector3()).x || 1);
  }

  // ---- outline shells (inverted hull, pushed out along normals; skinned shells share the skeleton)
  rebuildOutlines() {
    this.removeOutlines();
    if (!this.model) return;
    const meshes = [];
    this.model.traverse((o) => { if (o.isMesh && !o.userData.isOutline && o.geometry?.getAttribute('normal')) meshes.push(o); });
    for (const mesh of meshes) {
      const mat = outlineMaterial(0);
      let shell;
      if (mesh.isSkinnedMesh) {
        shell = new THREE.SkinnedMesh(mesh.geometry, mat);
        shell.bind(mesh.skeleton, mesh.bindMatrix);
        shell.bindMode = mesh.bindMode;
      } else {
        shell = new THREE.Mesh(mesh.geometry, mat);
      }
      shell.userData.isOutline = true;
      shell.frustumCulled = false;
      shell.renderOrder = -0.5;
      mesh.add(shell);
      this.outlines.push({ shell, mesh, mat });
    }
    this.updateOutlineThickness();
  }

  removeOutlines() {
    for (const { shell, mat } of this.outlines) { shell.removeFromParent(); mat.dispose(); }
    this.outlines = [];
  }

  updateOutlineThickness() {
    if (!this.outlines.length) return;
    this.scene.updateMatrixWorld(true);
    const worldT = this.style.outline > 0 ? this.style.outline / this.style.ppm : 0;
    const v = new THREE.Vector3();
    for (const o of this.outlines) {
      const ws = o.mesh.getWorldScale(v).x || 1;
      o.mat.userData.thickness.value = worldT / ws;
      o.shell.visible = worldT > 0;
    }
  }

  updateShadow() {
    const { reach } = this.metrics();
    this.shadow.visible = !!this.style.shadow && !!this.model;
    this.shadow.scale.set(Math.max(0.15, reach * 0.75), Math.max(0.15, reach * 0.75), 1);
  }
}
