/**
 * Live preview: the same stage and the same iso camera angle as the sprite
 * renderer, drawn larger, with a 1 m tile grid, a reference person and a
 * crate for scale (helpers live on layer 1, so they never reach the sprites).
 */
import * as THREE from 'three';
import { ELEVATION, pxPerMetre } from './presets.js';

const ORIGIN_Y = 0.68; // where the base point sits, as a share of the view height

function onLayer1(obj) { obj.traverse((o) => o.layers.set(1)); return obj; }

function referencePerson() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8f8b83, transparent: true, opacity: 0.55, roughness: 0.9 });
  const add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); };
  add(0.13, 0.82, 0.16, -0.1, 0.41, 0);
  add(0.13, 0.82, 0.16, 0.1, 0.41, 0);
  add(0.44, 0.62, 0.24, 0, 1.13, 0);
  add(0.1, 0.6, 0.12, -0.28, 1.12, 0);
  add(0.1, 0.6, 0.12, 0.28, 1.12, 0);
  add(0.22, 0.26, 0.24, 0, 1.6, 0);
  g.name = 'Reference person 1.75 m';
  return g;
}

function crate() {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const box = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6b4f2e, transparent: true, opacity: 0.7, roughness: 0.9 }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.6 }));
  box.add(edges);
  box.position.y = 0.35;
  g.add(box);
  g.name = 'Crate 0.7 m';
  return g;
}

export class Preview {
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
    const d = 40;
    this.camera.position.set((Math.cos(ELEVATION) / Math.SQRT2) * d, Math.sin(ELEVATION) * d, (Math.cos(ELEVATION) / Math.SQRT2) * d);
    this.camera.lookAt(0, 0, 0);
    this.camera.layers.enable(0); this.camera.layers.enable(1);
    this.zoom = 1;
    this.W = 1; this.H = 1; this.ppm = 100;

    this.helpers = new THREE.Group();
    const grid = new THREE.GridHelper(12, 12, 0x3a3833, 0x26251f);
    grid.position.y = -0.001;
    const tile = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)]),
      new THREE.LineBasicMaterial({ color: 0xffb547 }),
    );
    tile.position.y = 0.001;
    const tileFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.08, depthWrite: false }));
    tileFill.rotation.x = -Math.PI / 2;
    this.person = referencePerson(); this.person.position.set(-1.5, 0, 1.5);
    this.crate = crate(); this.crate.position.set(1.5, 0, -1.5);
    this.helpers.add(grid, tileFill, tile, this.person, this.crate);
    onLayer1(this.helpers);
    stage.scene.add(this.helpers);
  }

  setHelpers({ grid = true, refs = true } = {}) {
    this.helpers.children.forEach((c) => { c.visible = c === this.person || c === this.crate ? refs : grid; });
  }

  /** Fits the view to the model height and the reference objects. */
  resize(modelHeight = 1.8) {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const W = Math.max(50, Math.floor(r.width)), H = Math.max(50, Math.floor(r.height));
    if (W !== this.W || H !== this.H) { this.renderer.setSize(W, H, false); this.W = W; this.H = H; }
    const fit = Math.min(W / 7.2, (H * ORIGIN_Y * 0.9) / Math.max(1.9, modelHeight * 1.05));
    this.ppm = fit * this.zoom;
    const hw = W / 2 / this.ppm, hh = H / 2 / this.ppm;
    Object.assign(this.camera, { left: -hw, right: hw, top: hh, bottom: -hh });
    // Put the world origin at (W/2, H * ORIGIN_Y).
    this.camera.setViewOffset(W, H, 0, H / 2 - H * ORIGIN_Y, W, H);
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.stage.scene, this.camera); }

  /** Where the export cell sits in the preview, in CSS pixels. */
  cellBox({ cell, anchor, tileW }) {
    const z = this.ppm / pxPerMetre(tileW);
    return { left: this.W / 2 - anchor.x * z, top: this.H * ORIGIN_Y - anchor.y * z, size: cell * z, scale: z };
  }

  dispose() { this.helpers.removeFromParent(); this.renderer.dispose(); }
}
