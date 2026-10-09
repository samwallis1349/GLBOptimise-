import { Document, NodeIO } from '@gltf-transform/core';
import { encode } from 'fast-png';

/** Builds test assets in memory so the repo needs no binary fixtures. */

export function pngBytes(width, height, { alpha = false } = {}) {
  const channels = alpha ? 4 : 3;
  const data = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      data[i] = (x * 255) / width; data[i + 1] = (y * 255) / height; data[i + 2] = ((x ^ y) & 16) ? 200 : 40;
      if (alpha) data[i + 3] = Math.hypot(x - width / 2, y - height / 2) < width / 2.2 ? 255 : 0;
    }
  }
  return encode({ width, height, data, channels, depth: 8 });
}

/** UV sphere with `segments`² quads (~2·segments² triangles) and an optional texture. */
export async function sphereGlb(segments = 120, { textureSize = null, parts = 1, lift = 0 } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const material = doc.createMaterial('Skin');
  if (textureSize) {
    const tex = doc.createTexture('albedo').setImage(pngBytes(textureSize[0], textureSize[1])).setMimeType('image/png');
    material.setBaseColorTexture(tex);
  }
  // Each part is its own mesh + node sharing one material: a typical kitbashed prop.
  for (let p = 0; p < parts; p += 1) {
    const mesh = buildSphere(doc, buffer, segments, material);
    scene.addChild(doc.createNode(`Part${p}`).setMesh(mesh).setTranslation([p * 2.2, lift, 0]));
  }
  return new NodeIO().writeBinary(doc);
}

function buildSphere(doc, buffer, segments, material) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let y = 0; y <= segments; y += 1) {
    for (let x = 0; x <= segments; x += 1) {
      const u = x / segments;
      const v = y / segments;
      const theta = u * Math.PI * 2;
      const phi = v * Math.PI;
      positions.push(Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi));
      uvs.push(u, v);
    }
  }
  for (let y = 0; y < segments; y += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = y * (segments + 1) + x;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
  prim.setMaterial(material);
  return doc.createMesh('Sphere').addPrimitive(prim);
}

/** Minimal in-memory stand-in for a Workers KV namespace. */
export function memoryKv() {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const hit = store.get(key);
      if (!hit) return null;
      return type === 'json' ? JSON.parse(hit.value) : hit.value;
    },
    async getWithMetadata(key) {
      const hit = store.get(key);
      return { value: hit?.value ?? null, metadata: hit?.metadata ?? null };
    },
    async put(key, value, opts = {}) { store.set(key, { value: String(value), metadata: opts.metadata ?? null }); },
    async delete(key) { store.delete(key); },
    async list({ prefix = '' } = {}) {
      return { keys: [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true };
    },
  };
}
