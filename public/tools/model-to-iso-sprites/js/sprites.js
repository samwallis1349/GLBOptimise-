/**
 * Draws one sprite cell from the shared stage with the fixed 2:1 iso camera.
 * The base point (anchor) is the pixel where the world origin lands, so every
 * frame of every direction shares it. Pixel mode renders small, posterizes,
 * hardens the alpha and scales up with nearest-neighbour.
 */
import * as THREE from 'three';
import { ELEVATION, pxPerMetre } from './presets.js';

export class SpriteRenderer {
  constructor(stage) {
    this.stage = stage;
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
    const d = 40;
    this.camera.position.set((Math.cos(ELEVATION) / Math.SQRT2) * d, Math.sin(ELEVATION) * d, (Math.cos(ELEVATION) / Math.SQRT2) * d);
    this.camera.lookAt(0, 0, 0);
    this.camera.layers.set(0);
    this.out = document.createElement('canvas');
    this.small = document.createElement('canvas');
    this.cfg = null;
  }

  configure({ tileW, cell, anchor, pixel = false, pixelScale = 2, levels = 6 }) {
    const k = pixel ? Math.max(1, pixelScale) : 1;
    const size = Math.max(8, Math.round(cell / k));
    this.cfg = { tileW, cell, anchor, pixel, k, size, levels, ppm: pxPerMetre(tileW) };
    this.renderer.setSize(size, size, false);
    const s = this.cfg.ppm / k;
    const h = size / 2 / s;
    Object.assign(this.camera, { left: -h, right: h, top: h, bottom: -h });
    this.camera.setViewOffset(size, size, size / 2 - anchor.x / k, size / 2 - anchor.y / k, size, size);
    this.camera.updateProjectionMatrix();
    this.out.width = this.out.height = cell;
    this.small.width = this.small.height = size;
  }

  /** Renders the stage as it is posed now. Returns a cell × cell canvas (reused). */
  render() {
    const { cell, pixel, size, levels } = this.cfg;
    this.renderer.render(this.stage.scene, this.camera);
    const ctx = this.out.getContext('2d');
    ctx.clearRect(0, 0, cell, cell);
    if (!pixel) {
      ctx.drawImage(this.canvas, 0, 0, cell, cell);
      return this.out;
    }
    const sctx = this.small.getContext('2d', { willReadFrequently: true });
    sctx.clearRect(0, 0, size, size);
    sctx.drawImage(this.canvas, 0, 0);
    const img = sctx.getImageData(0, 0, size, size);
    posterize(img.data, levels);
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.small, 0, 0, cell, cell);
    return this.out;
  }

  dispose() { this.renderer.dispose(); }
}

/** Quantizes colour to `levels` steps per channel and makes alpha hard (0 or 255). */
export function posterize(data, levels = 6) {
  const step = 255 / Math.max(1, levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) { data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] / step) * step;
    data[i + 3] = 255;
  }
}

/** True when any pixel on the outer 1 px border is visible: the sprite was cut off. */
export function touchesEdge(ctx, size) {
  const d = ctx.getImageData(0, 0, size, size).data;
  const at = (x, y) => d[(y * size + x) * 4 + 3] > 8;
  for (let i = 0; i < size; i++) {
    if (at(i, 0) || at(i, size - 1) || at(0, i) || at(size - 1, i)) return true;
  }
  return false;
}
