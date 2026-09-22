import * as THREE from 'three';
import { Viewer } from './viewer/Viewer.js';
import { loadGlbForPreview } from './viewer/loadModel.js';

const ACCENT = 0xffb547;

/**
 * Wraps the plain Viewer with a skeleton overlay: a THREE.SkeletonHelper for
 * the bone lines, plus a small sphere per bone so the hierarchy list can
 * flash one on click. Built once per load from whichever Bone nodes the
 * loaded scene actually contains — Rig Inspector never plays an animation,
 * so bones sit at their bind pose and the overlay is built once rather than
 * updated every frame.
 */
export class RigViewer {
  constructor(host) {
    this.viewer = new Viewer(host);
    this.helper = null;
    this.markerGroup = null;
    this.bones = [];
    this.meshVisible = true;
    this.skeletonVisible = true;
  }

  get hasSkeleton() {
    return this.bones.length > 0;
  }

  async load(arrayBuffer) {
    this._clearOverlay();
    const scene = await loadGlbForPreview(arrayBuffer);
    this.viewer.setModel(scene);
    this._buildOverlay(scene);
    this._applyVisibility();
    return scene;
  }

  _buildOverlay(scene) {
    scene.updateMatrixWorld(true);
    const bones = [];
    scene.traverse((node) => {
      if (node.isBone) bones.push(node);
    });
    if (!bones.length) return;

    const helper = new THREE.SkeletonHelper(scene);
    helper.material.vertexColors = false;
    helper.material.color = new THREE.Color(ACCENT);
    helper.material.transparent = true;
    helper.material.opacity = 0.9;
    helper.material.depthTest = false;
    helper.renderOrder = 998;
    this.viewer.scene.add(helper);

    const radius = this._estimateJointRadius(scene);
    const geometry = new THREE.SphereGeometry(radius, 10, 8);
    const markerGroup = new THREE.Group();
    markerGroup.userData.byName = new Map();

    for (const bone of bones) {
      const material = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95, depthTest: false });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.renderOrder = 999;
      markerGroup.add(sphere);
      markerGroup.userData.byName.set(bone.name, sphere);
    }
    this.viewer.scene.add(markerGroup);

    this.helper = helper;
    this.markerGroup = markerGroup;
    this.bones = bones;
    this._syncMarkerPositions();
  }

  _estimateJointRadius(scene) {
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return 0.01;
    const diag = box.getSize(new THREE.Vector3()).length();
    return Math.max(diag * 0.012, 0.004);
  }

  _syncMarkerPositions() {
    if (!this.markerGroup) return;
    const pos = new THREE.Vector3();
    for (const bone of this.bones) {
      bone.getWorldPosition(pos);
      this.markerGroup.userData.byName.get(bone.name)?.position.copy(pos);
    }
  }

  setMeshVisible(visible) {
    this.meshVisible = visible;
    this._applyVisibility();
  }

  setSkeletonVisible(visible) {
    this.skeletonVisible = visible;
    this._applyVisibility();
  }

  _applyVisibility() {
    if (this.viewer.currentModel) {
      this.viewer.currentModel.traverse((node) => {
        if (node.isMesh) node.visible = this.meshVisible;
      });
    }
    if (this.helper) this.helper.visible = this.skeletonVisible;
    if (this.markerGroup) this.markerGroup.visible = this.skeletonVisible;
  }

  setWireframeMode(mode) {
    this.viewer.setWireframeMode(mode);
  }

  setGridVisible(visible) {
    this.viewer.setGridVisible(visible);
  }

  resetCamera() {
    this.viewer.resetCamera();
  }

  /** Briefly flashes one joint's marker white and oversized, by joint name. */
  highlightJoint(name) {
    const sphere = this.markerGroup?.userData.byName.get(name);
    if (!sphere) return;
    clearTimeout(sphere.userData.flashTimer);
    sphere.material.color.setHex(0xffffff);
    sphere.scale.setScalar(2.6);
    sphere.userData.flashTimer = setTimeout(() => {
      sphere.material.color.setHex(ACCENT);
      sphere.scale.setScalar(1);
    }, 1400);
  }

  _clearOverlay() {
    if (this.helper) {
      this.viewer.scene.remove(this.helper);
      this.helper.dispose?.();
      this.helper = null;
    }
    if (this.markerGroup) {
      this.viewer.scene.remove(this.markerGroup);
      this.markerGroup.traverse((node) => {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      });
      this.markerGroup = null;
    }
    this.bones = [];
  }

  clear() {
    this._clearOverlay();
    this.viewer.clear();
  }

  dispose() {
    this._clearOverlay();
    this.viewer.dispose();
  }
}
