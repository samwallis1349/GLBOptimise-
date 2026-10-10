import { Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, listTextureSlots } from '@gltf-transform/functions';
import { analyseGlb, splitGlb } from '../../../../worker/api/glb.js';

/**
 * Inspection: everything the asset table, the planner and validation need,
 * measured from the real file. Raw counts come from the Cloud API's JSON-level
 * analyser (works on compressed files without decoding them); feature checks
 * come from the decoded glTF-Transform Document.
 *
 * Returns plain JSON — no Document references survive, so a batch of
 * hundreds of inspections stays small in memory.
 */

const SUPPORTED_EXTENSIONS = new Set(ALL_EXTENSIONS.map((E) => E.EXTENSION_NAME));
const TRIANGLE_MODES = new Set([Primitive.Mode.TRIANGLES, Primitive.Mode.TRIANGLE_STRIP, Primitive.Mode.TRIANGLE_FAN]);

const issue = (severity, code, message) => ({ severity, code, message });

/** Texture dimensions, or null when the image is empty/corrupt (getSize throws on truncated headers). */
export function safeSize(texture) {
  try {
    return texture.getImage()?.byteLength ? texture.getSize() : null;
  } catch {
    return null;
  }
}

/** Texture role, from the material slots that reference it (see settings TEXTURE_ROLES). */
export function roleForTexture(document, texture) {
  const slots = listTextureSlots(texture);
  if (slots.includes('normalTexture') || slots.includes('clearcoatNormalTexture')) return 'normal';
  if (slots.includes('baseColorTexture')) {
    const blended = document
      .getRoot()
      .listMaterials()
      .some((m) => m.getBaseColorTexture() === texture && m.getAlphaMode() !== 'OPAQUE');
    return blended ? 'alpha' : 'baseColor';
  }
  if (slots.includes('emissiveTexture')) return 'emissive';
  if (slots.includes('metallicRoughnessTexture')) return 'metallicRoughness';
  if (slots.includes('occlusionTexture')) return 'occlusion';
  return 'other';
}

function animationSummary(document) {
  return document
    .getRoot()
    .listAnimations()
    .map((anim) => {
      let duration = 0;
      for (const sampler of anim.listSamplers()) {
        const input = sampler.getInput();
        if (input) duration = Math.max(duration, input.getMax([0])[0] ?? 0);
      }
      return { name: anim.getName() || '', channels: anim.listChannels().length, duration: Number(duration.toFixed(4)) };
    });
}

/** Feature summary of a decoded Document; also used by validation on outputs. */
export function documentFeatures(document) {
  const root = document.getRoot();
  let morphTargets = 0;
  let morphMeshes = 0;
  let nonTriangle = 0;
  let triangles = 0;
  let vertices = 0;
  let badIndices = 0;
  const skinnedMeshes = new Set();

  for (const node of root.listNodes()) {
    if (node.getSkin() && node.getMesh()) skinnedMeshes.add(node.getMesh());
  }
  for (const mesh of root.listMeshes()) {
    let meshTargets = 0;
    for (const prim of mesh.listPrimitives()) {
      meshTargets = Math.max(meshTargets, prim.listTargets().length);
      const pos = prim.getAttribute('POSITION');
      const count = pos ? pos.getCount() : 0;
      vertices += count;
      const indices = prim.getIndices();
      if (!TRIANGLE_MODES.has(prim.getMode())) {
        nonTriangle += 1;
        continue;
      }
      const n = indices ? indices.getCount() : count;
      triangles += prim.getMode() === Primitive.Mode.TRIANGLES ? Math.floor(n / 3) : Math.max(0, n - 2);
      if (indices) {
        const arr = indices.getArray();
        for (let i = 0; i < arr.length; i += 1) {
          if (arr[i] >= count) {
            badIndices += 1;
            break;
          }
        }
      }
    }
    if (meshTargets) {
      morphMeshes += 1;
      morphTargets += meshTargets;
    }
  }

  const skins = root.listSkins();
  const lightsExt = root.listExtensionsUsed().find((e) => e.extensionName === 'KHR_lights_punctual');
  const lights = root.listNodes().filter((n) => n.getExtension('KHR_lights_punctual')).length;

  let bounds = null;
  const scene = root.getDefaultScene() || root.listScenes()[0];
  if (scene) {
    const { min, max } = getBounds(scene);
    if (min.every(Number.isFinite) && max.every(Number.isFinite)) {
      bounds = { min: min.map((v) => round(v)), max: max.map((v) => round(v)), size: max.map((v, i) => round(v - min[i])) };
    }
  }

  return {
    scenes: root.listScenes().length,
    nodes: root.listNodes().length,
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    triangles,
    vertices,
    animations: animationSummary(document),
    skins: skins.length,
    joints: skins.reduce((n, s) => n + s.listJoints().length, 0),
    skinnedMeshes: skinnedMeshes.size,
    morphTargets,
    morphMeshes,
    cameras: root.listCameras().length,
    lights: lightsExt ? lights : 0,
    transparentMaterials: root.listMaterials().filter((m) => m.getAlphaMode() !== 'OPAQUE').length,
    nonTrianglePrimitives: nonTriangle,
    outOfRangeIndices: badIndices,
    extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
    extensionsRequired: root.listExtensionsRequired().map((e) => e.extensionName),
    meshNames: root.listMeshes().map((m) => m.getName() || ''),
    bounds,
  };
}

const round = (v) => Math.round(v * 1e5) / 1e5;

/**
 * @param {Uint8Array} bytes  a GLB (glTF inputs are packed to GLB first, see sources.js)
 * @param {{ io: import('@gltf-transform/core').PlatformIO, missing?: string[], sourceFormat?: string }} ctx
 */
export async function inspectAsset(bytes, { io, missing = [], sourceFormat = 'glb' } = {}) {
  const issues = [];
  let raw = null;
  try {
    raw = analyseGlb(bytes);
  } catch (err) {
    return { ok: false, error: err?.message || 'Not a readable GLB.', issues: [issue('error', 'unreadable', err?.message || 'Not a readable GLB.')] };
  }

  const { json } = splitGlb(bytes);
  const unknownRequired = (json.extensionsRequired || []).filter((e) => !SUPPORTED_EXTENSIONS.has(e));
  const unknownUsed = (json.extensionsUsed || []).filter((e) => !SUPPORTED_EXTENSIONS.has(e) && !unknownRequired.includes(e));
  if (unknownRequired.length) {
    issues.push(issue('error', 'unsupported-required', `Requires unsupported extension(s): ${unknownRequired.join(', ')}. The file cannot be processed safely.`));
  }
  if (unknownUsed.length) {
    issues.push(issue('warning', 'unsupported-optional', `Uses extension(s) this tool does not understand and will drop: ${unknownUsed.join(', ')}.`));
  }

  let document;
  try {
    document = await io.readBinary(bytes);
  } catch (err) {
    const draco = (json.extensionsUsed || []).includes('KHR_draco_mesh_compression');
    const message = draco
      ? `Draco-compressed geometry could not be decoded here (${err?.message || 'decoder unavailable'}).`
      : `The file could not be decoded: ${err?.message || 'unknown error'}.`;
    return { ok: false, error: message, raw, issues: [...issues, issue('error', 'decode-failed', message)] };
  }

  const features = documentFeatures(document);
  const textures = document
    .getRoot()
    .listTextures()
    .map((tex, index) => {
      const size = safeSize(tex);
      const image = tex.getImage();
      return {
        index,
        name: tex.getName() || tex.getURI() || `texture_${index}`,
        mime: tex.getMimeType() || 'unknown',
        width: size?.[0] || 0,
        height: size?.[1] || 0,
        bytes: image ? image.byteLength : 0,
        role: roleForTexture(document, tex),
      };
    });

  if (missing.length) issues.push(issue('error', 'missing-resources', `Missing resource(s): ${missing.join(', ')}. Those textures are empty in the output.`));
  if (features.nonTrianglePrimitives) issues.push(issue('info', 'non-triangle', `${features.nonTrianglePrimitives} point/line primitive(s): left untouched by simplification.`));
  if (features.outOfRangeIndices) issues.push(issue('error', 'bad-indices', `${features.outOfRangeIndices} primitive(s) reference vertices that do not exist.`));
  if (features.skins) issues.push(issue('info', 'skinned', `Skinned (${features.skins} skin, ${features.joints} joints): deforming meshes are not simplified unless you allow it.`));
  if (features.morphTargets) issues.push(issue('info', 'morph', `${features.morphTargets} morph target(s) on ${features.morphMeshes} mesh(es): protected from simplification by default.`));
  if (raw.compression.draco) issues.push(issue('info', 'draco', 'Draco input: decoded for processing; output uses Meshopt or no compression (Draco cannot be re-encoded in the browser).'));
  const unreadable = textures.filter((t) => !t.width || !t.height);
  if (unreadable.length) issues.push(issue('warning', 'unreadable-textures', `${unreadable.length} texture(s) have no readable dimensions (${unreadable.map((t) => t.name).join(', ')}). They are passed through unchanged.`));
  const huge = textures.filter((t) => Math.max(t.width, t.height) > 4096);
  if (huge.length) issues.push(issue('warning', 'huge-textures', `${huge.length} texture(s) above 4096 px: heavy on memory, and above most engines' limits.`));
  if (!features.triangles && !features.nonTrianglePrimitives) issues.push(issue('warning', 'no-geometry', 'No geometry found.'));
  if (features.bounds) {
    const largest = Math.max(...features.bounds.size);
    if (largest > 500) issues.push(issue('warning', 'scale-large', `${largest.toFixed(0)} units across: probably exported in centimetres (glTF uses metres).`));
    else if (largest > 0 && largest < 0.01) issues.push(issue('warning', 'scale-small', `Only ${largest.toFixed(4)} units across: possibly the wrong export scale.`));
  }

  document.dispose?.();

  return {
    ok: !issues.some((i) => i.code === 'unsupported-required' || i.code === 'bad-indices'),
    error: null,
    sourceFormat,
    fileBytes: bytes.byteLength,
    stats: {
      triangles: raw.triangles,
      vertices: raw.vertices,
      drawCalls: raw.drawCalls,
      meshes: features.meshes,
      materials: features.materials,
      textures: textures.length,
      maxTexture: textures.reduce((m, t) => Math.max(m, t.width, t.height), 0),
      gpuTextureBytes: raw.textureMemoryBytes,
      animationBytes: raw.animationBytes,
    },
    features,
    textures,
    compression: raw.compression,
    issues,
  };
}

/** GPU texture-memory estimate for one texture: RGBA8 + mip chain, or ~1 byte/px for KTX2 (Basis). */
export function textureGpuBytes(width, height, mime) {
  return Math.round((width * height * (mime === 'image/ktx2' ? 1 : 4) * 4) / 3);
}
