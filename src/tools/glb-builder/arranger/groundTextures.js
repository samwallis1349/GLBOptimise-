import * as THREE from 'three';

/**
 * Premade ground surfaces, generated on a canvas so the tool ships no image
 * files. Every mark is drawn with wrap-around copies, so each texture tiles
 * seamlessly under THREE.RepeatWrapping.
 */

const SIZE = 512;
const cache = new Map();

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Calls draw(x, y) at the point and at each wrapped copy the mark could reach. */
function wrapped(x, y, reach, draw) {
  for (const dx of [-SIZE, 0, SIZE]) {
    if (x + dx < -reach || x + dx > SIZE + reach) continue;
    for (const dy of [-SIZE, 0, SIZE]) {
      if (y + dy < -reach || y + dy > SIZE + reach) continue;
      draw(x + dx, y + dy);
    }
  }
}

function blobs(ctx, rand, { count, min, max, colors, alpha }) {
  for (let i = 0; i < count; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const r = min + rand() * (max - min);
    ctx.globalAlpha = alpha[0] + rand() * (alpha[1] - alpha[0]);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    wrapped(x, y, r, (px, py) => {
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
}

function speckle(ctx, rand, count, colors, size = 1.5, alpha = [0.3, 0.8]) {
  for (let i = 0; i < count; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const s = 0.5 + rand() * size;
    ctx.globalAlpha = alpha[0] + rand() * (alpha[1] - alpha[0]);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
}

function strokes(ctx, rand, { count, length, width, colors, alpha, bend = 0.4 }) {
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const a = -Math.PI / 2 + (rand() - 0.5) * 1.6;
    const l = length * (0.5 + rand());
    const ex = x + Math.cos(a) * l;
    const ey = y + Math.sin(a) * l;
    const cx = (x + ex) / 2 + (rand() - 0.5) * l * bend;
    const cy = (y + ey) / 2 + (rand() - 0.5) * l * bend;
    ctx.strokeStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha[0] + rand() * (alpha[1] - alpha[0]);
    ctx.lineWidth = width * (0.5 + rand());
    wrapped(x, y, l, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(cx - x + px, cy - y + py, ex - x + px, ey - y + py);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

function cracks(ctx, rand, { count, steps, color, width }) {
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = rand() * SIZE;
    let y = rand() * SIZE;
    let a = rand() * Math.PI * 2;
    const points = [[x, y]];
    for (let s = 0; s < steps; s++) {
      a += (rand() - 0.5) * 1.1;
      x += Math.cos(a) * 12;
      y += Math.sin(a) * 12;
      points.push([x, y]);
    }
    const ox = points[0][0];
    const oy = points[0][1];
    ctx.lineWidth = width * (0.6 + rand() * 0.8);
    wrapped(ox, oy, steps * 12, (px, py) => {
      ctx.beginPath();
      points.forEach(([qx, qy], k) => (k ? ctx.lineTo(qx - ox + px, qy - oy + py) : ctx.moveTo(px, py)));
      ctx.stroke();
    });
  }
}

const RECIPES = {
  dust(ctx, rand) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blobs(ctx, rand, { count: 90, min: 20, max: 70, colors: ['#9c7a52', '#7a5c3e', '#a3845c'], alpha: [0.12, 0.3] });
    speckle(ctx, rand, 9000, ['#5e4630', '#b8966a', '#6d5238'], 1.6);
    blobs(ctx, rand, { count: 60, min: 1.5, max: 4, colors: ['#5c452f', '#b09070'], alpha: [0.5, 0.9] });
  },
  sand(ctx, rand) {
    ctx.fillStyle = '#c9ac7c';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blobs(ctx, rand, { count: 70, min: 30, max: 90, colors: ['#d6bb8b', '#bb9c6c', '#dcc295'], alpha: [0.15, 0.3] });
    strokes(ctx, rand, { count: 120, length: 90, width: 3, colors: ['#b8986a', '#e0c89c'], alpha: [0.08, 0.18], bend: 0.2 });
    speckle(ctx, rand, 12000, ['#a88a5e', '#e8d4ae', '#9c7f55'], 1.2);
  },
  cracked(ctx, rand) {
    ctx.fillStyle = '#9b7652';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blobs(ctx, rand, { count: 80, min: 25, max: 70, colors: ['#a8835c', '#8a6746', '#b08b62'], alpha: [0.2, 0.4] });
    speckle(ctx, rand, 6000, ['#6f5236', '#c09b70'], 1.4);
    cracks(ctx, rand, { count: 34, steps: 16, color: 'rgba(52,34,20,0.85)', width: 2.4 });
    cracks(ctx, rand, { count: 40, steps: 7, color: 'rgba(60,40,24,0.6)', width: 1.2 });
  },
  grass(ctx, rand) {
    ctx.fillStyle = '#7d6a44';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blobs(ctx, rand, { count: 80, min: 20, max: 60, colors: ['#6b5a36', '#8f7a4c', '#6e6a3a'], alpha: [0.2, 0.4] });
    speckle(ctx, rand, 5000, ['#4f412a', '#a08a5a'], 1.5);
    strokes(ctx, rand, { count: 2600, length: 14, width: 1.4, colors: ['#b29a5c', '#c8b070', '#8e7c46', '#9f9456', '#d1bb7f'], alpha: [0.45, 0.9] });
  },
  dirt(ctx, rand) {
    ctx.fillStyle = '#5b4331';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blobs(ctx, rand, { count: 120, min: 14, max: 60, colors: ['#4a3526', '#6b5039', '#3f2d20'], alpha: [0.2, 0.45] });
    speckle(ctx, rand, 10000, ['#2e2118', '#7d6148', '#4d3a2a'], 2);
    blobs(ctx, rand, { count: 140, min: 1.5, max: 4.5, colors: ['#7a6450', '#35271c'], alpha: [0.5, 0.9] });
  },
  gravel(ctx, rand) {
    ctx.fillStyle = '#6d6a64';
    ctx.fillRect(0, 0, SIZE, SIZE);
    speckle(ctx, rand, 6000, ['#4b4945', '#8a8680'], 2);
    blobs(ctx, rand, { count: 1600, min: 3, max: 8, colors: ['#8b8680', '#5d5a55', '#a29d95', '#716c64', '#4a4743'], alpha: [0.75, 1] });
    blobs(ctx, rand, { count: 500, min: 1, max: 2.5, colors: ['#2f2d2a', '#b5b0a7'], alpha: [0.5, 0.9] });
  },
  concrete(ctx, rand) {
    ctx.fillStyle = '#8e8d88';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blobs(ctx, rand, { count: 90, min: 30, max: 90, colors: ['#96958f', '#84837e', '#9c9a93'], alpha: [0.15, 0.3] });
    speckle(ctx, rand, 16000, ['#6e6d69', '#a9a7a0', '#7c7b76'], 1.2);
    ctx.strokeStyle = 'rgba(50,50,48,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 1); ctx.lineTo(SIZE, 1);
    ctx.moveTo(1, 0); ctx.lineTo(1, SIZE);
    ctx.stroke();
    cracks(ctx, rand, { count: 5, steps: 8, color: 'rgba(60,60,58,0.35)', width: 1 });
  },
  asphalt(ctx, rand) {
    ctx.fillStyle = '#2e2f31';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blobs(ctx, rand, { count: 80, min: 30, max: 80, colors: ['#343538', '#28292b', '#38393b'], alpha: [0.2, 0.4] });
    speckle(ctx, rand, 20000, ['#55565a', '#1d1e20', '#6b6c70', '#44454a'], 1.6);
    cracks(ctx, rand, { count: 6, steps: 10, color: 'rgba(15,15,16,0.6)', width: 1.4 });
  },
};

function finish(texture) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** @returns {THREE.CanvasTexture} cached per surface id */
export function getGroundTexture(id) {
  if (cache.has(id)) return cache.get(id);
  const recipe = RECIPES[id];
  if (!recipe) return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  recipe(ctx, rng([...id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)));
  const texture = finish(new THREE.CanvasTexture(canvas));
  texture.name = `ground_${id}`;
  cache.set(id, texture);
  return texture;
}

/** Loads a user image as a repeating ground texture. */
export async function loadCustomGroundTexture(file) {
  const bitmap = await createImageBitmap(file);
  // Draw onto a canvas so GLTFExporter can re-encode it if the ground is exported.
  const canvas = document.createElement('canvas');
  const max = 2048;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const texture = finish(new THREE.CanvasTexture(canvas));
  texture.name = file.name.replace(/\.[^.]+$/, '') || 'ground_custom';
  return texture;
}

export function disposeGroundTextures() {
  cache.forEach((texture) => texture.dispose());
  cache.clear();
}
