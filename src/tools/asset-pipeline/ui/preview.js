import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { Viewer } from '../../../shared/viewer/Viewer.js';

/**
 * 3D preview built on the shared Viewer (orbit/pan/zoom, wireframe and
 * overlay modes, clip playback). Adds what a pipeline needs on top:
 * KTX2-capable loading (outputs may carry Basis textures), an untextured
 * clay mode, and original-vs-optimised comparison — side by side with
 * linked cameras, or one at a time.
 */

const BASE = import.meta.env?.BASE_URL || '/';
let dracoLoader = null;
let ktx2Loader = null;

async function loaderFor(renderer) {
  const loader = new GLTFLoader();
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(`${BASE}draco/`);
  }
  loader.setDRACOLoader(dracoLoader);
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(`${BASE}basis/`);
    ktx2Loader.detectSupport(renderer);
  }
  loader.setKTX2Loader(ktx2Loader);
  await MeshoptDecoder.ready;
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export async function parseGlb(bytes, renderer) {
  const loader = await loaderFor(renderer);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise((resolve, reject) => loader.parse(buffer, '', resolve, (err) => reject(err instanceof Error ? err : new Error('Preview could not parse this file.'))));
  return { scene: gltf.scene, animations: gltf.animations || [] };
}

function materialsOf(object) {
  const seen = new Map();
  object.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || seen.has(m.uuid)) continue;
      const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'].filter((k) => m[k]).map((k) => {
        const img = m[k].image;
        return `${k.replace('Map', '') || 'base'}${img?.width ? ` ${img.width}×${img.height}` : ''}`;
      });
      seen.set(m.uuid, { name: m.name || '(unnamed)', type: m.type, transparent: m.transparent, alphaTest: m.alphaTest, doubleSided: m.side === THREE.DoubleSide, maps });
    }
  });
  return [...seen.values()];
}

class Pane {
  constructor(host, label) {
    this.el = document.createElement('div');
    this.el.className = 'ap-pane';
    this.tag = document.createElement('span');
    this.tag.className = 'ap-pane-tag';
    this.tag.textContent = label;
    this.el.append(this.tag);
    host.append(this.el);
    this.viewer = new Viewer(this.el, { grid: true });
    this.clay = null;
    this.mode = 'textured';
    this.materials = [];
    this.token = 0;
  }

  async load(bytes) {
    const token = ++this.token;
    this.restoreClay();
    if (!bytes) {
      this.viewer.clear();
      this.materials = [];
      return { animations: [] };
    }
    const { scene, animations } = await parseGlb(bytes, this.viewer.renderer);
    if (token !== this.token) return { animations: [] }; // a newer load won
    this.viewer.setModel(scene, animations);
    this.materials = materialsOf(scene);
    this.applyMode();
    return { animations };
  }

  setMode(mode) {
    this.mode = mode;
    this.applyMode();
  }

  applyMode() {
    this.restoreClay();
    if (this.mode === 'untextured') {
      this.viewer.setViewMode('shaded');
      if (!this.viewer.model) return;
      this.clay = { originals: new Map(), material: new THREE.MeshStandardMaterial({ color: 0xb9b5ad, roughness: 0.85, metalness: 0 }) };
      this.viewer.model.traverse((o) => {
        if (!o.isMesh) return;
        this.clay.originals.set(o, o.material);
        o.material = this.clay.material;
      });
    } else {
      this.viewer.setViewMode(this.mode === 'textured' ? 'shaded' : this.mode);
    }
  }

  restoreClay() {
    if (!this.clay) return;
    for (const [mesh, material] of this.clay.originals) mesh.material = material;
    this.clay.material.dispose();
    this.clay = null;
  }

  dispose() {
    this.restoreClay();
    this.viewer.dispose();
    this.el.remove();
  }
}

export class Preview {
  constructor(host) {
    this.host = host;
    this.host.classList.add('ap-viewport');
    this.optimised = new Pane(host, 'Optimised');
    this.original = new Pane(host, 'Original');
    this.compare = 'optimised'; // 'optimised' | 'original' | 'split'
    this.animations = [];
    this._linking = false;
    const link = (from, to) => from.viewer.onCameraChange(() => {
      if (this._linking || this.compare !== 'split') return;
      this._linking = true;
      from.viewer.copyCameraTo(to.viewer);
      this._linking = false;
    });
    this._unlink = [link(this.optimised, this.original), link(this.original, this.optimised)];
    this.setCompare('optimised');
  }

  /** @param {{ original: Uint8Array|null, output: Uint8Array|null }} p */
  async show({ original, output }) {
    const [a, b] = await Promise.all([this.original.load(original), this.optimised.load(output || null)]);
    this.hasOutput = Boolean(output);
    // Without an output there is only the original to show; the user's choice comes back once there is one.
    this._apply(output ? this.compare : 'original');
    this.animations = (output ? b : a).animations;
    return { animations: this.animations, materials: (output ? this.optimised : this.original).materials };
  }

  setCompare(mode) {
    this.compare = mode;
    this._apply(this.hasOutput === false ? 'original' : mode);
  }

  _apply(mode) {
    this.host.dataset.compare = mode;
    this.optimised.el.hidden = mode === 'original';
    this.original.el.hidden = mode === 'optimised';
    if (mode === 'split') this.optimised.viewer.copyCameraTo(this.original.viewer);
  }

  setMode(mode) {
    this.optimised.setMode(mode);
    this.original.setMode(mode);
  }

  playClip(index) {
    for (const pane of [this.optimised, this.original]) {
      if (index < 0) pane.viewer.stopClip();
      else if (pane.viewer.clips[index]) pane.viewer.playClip(index);
    }
  }

  resetCamera() {
    this.optimised.viewer.resetCamera();
    this.original.viewer.resetCamera();
  }

  dispose() {
    this._unlink.forEach((fn) => fn());
    this.optimised.dispose();
    this.original.dispose();
  }
}

/**
 * Off-screen thumbnail renderer: one hidden Viewer reused for every asset,
 * one render at a time.
 */
export function createThumbnailer(size = 256) {
  let viewer = null;
  let host = null;
  let chain = Promise.resolve();
  const render = async (bytes) => {
    if (!viewer) {
      host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${size}px;height:${size}px;pointer-events:none;`;
      document.body.append(host);
      viewer = new Viewer(host, { grid: false });
    }
    const { scene, animations } = await parseGlb(bytes, viewer.renderer);
    viewer.setModel(scene, animations);
    const url = viewer.capture(size, size);
    viewer.clear();
    const res = await fetch(url);
    return new Uint8Array(await res.arrayBuffer());
  };
  return {
    render: (bytes) => {
      const next = chain.then(() => render(bytes));
      chain = next.catch(() => {});
      return next;
    },
    dispose() {
      viewer?.dispose();
      host?.remove();
      viewer = null;
    },
  };
}
