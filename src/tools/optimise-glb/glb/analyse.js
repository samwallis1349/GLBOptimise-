import { Primitive } from '@gltf-transform/core';
import { getGLPrimitiveCount, listTextureSlots } from '@gltf-transform/functions';
import { readGlb } from './createIO.js';
import { formatBytes, classifyTextureResolution } from '../utils/formatting.js';

const TRIANGLE_MODES = new Set([
  Primitive.Mode.TRIANGLES,
  Primitive.Mode.TRIANGLE_STRIP,
  Primitive.Mode.TRIANGLE_FAN,
]);

const MIME_EXT = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/ktx2': 'KTX2',
};

/**
 * @typedef {Object} GlbAnalysis
 * Real, measured information about a GLB. Every field here is derived
 * directly from the parsed document — nothing is estimated or faked.
 */

/**
 * Parses a GLB ArrayBuffer with glTF-Transform and returns a Document
 * plus a structured analysis. Throws if the file cannot be parsed.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ filename: string, bytes: number }} fileMeta
 */
export async function analyseGlb(arrayBuffer, fileMeta) {
  const document = await readGlb(arrayBuffer);
  const root = document.getRoot();

  const scenes = root.listScenes();
  const allNodes = root.listNodes();

  const meshes = root.listMeshes();
  const primitives = meshes.flatMap((m) => m.listPrimitives());

  let vertexCount = 0;
  let triangleCount = 0;
  for (const prim of primitives) {
    const positions = prim.getAttribute('POSITION');
    if (positions) vertexCount += positions.getCount();
    if (TRIANGLE_MODES.has(prim.getMode())) {
      triangleCount += getGLPrimitiveCount(prim);
    }
  }

  const materials = root.listMaterials();

  const textures = root.listTextures();
  const textureItems = textures.map((tex) => {
    const size = tex.getSize();
    const image = tex.getImage();
    const mimeType = tex.getMimeType();
    const slots = listTextureSlots(tex);
    return {
      name: tex.getName() || tex.getURI() || '(unnamed)',
      mimeType,
      format: MIME_EXT[mimeType] || mimeType || 'unknown',
      width: size ? size[0] : 0,
      height: size ? size[1] : 0,
      resolutionClass: size ? classifyTextureResolution(size[0], size[1]) : 'unknown',
      byteLength: image ? image.byteLength : 0,
      slots, // e.g. ['baseColorTexture'], ['normalTexture'], ['metallicRoughnessTexture']
    };
  });

  const animations = root.listAnimations();
  const animationItems = animations.map((anim) => {
    let maxTime = 0;
    for (const sampler of anim.listSamplers()) {
      const input = sampler.getInput();
      if (!input) continue;
      const arr = input.getArray();
      if (arr && arr.length) maxTime = Math.max(maxTime, arr[arr.length - 1]);
    }
    return {
      name: anim.getName() || '(unnamed)',
      duration: maxTime,
      channelCount: anim.listChannels().length,
    };
  });

  const skins = root.listSkins();
  let totalJoints = 0;
  const skinItems = skins.map((skin) => {
    const joints = skin.listJoints();
    totalJoints += joints.length;
    return {
      name: skin.getName() || '(unnamed)',
      jointCount: joints.length,
      jointNames: joints.map((j) => j.getName() || '(unnamed joint)'),
    };
  });

  let morphTargetCount = 0;
  let hasMorphTargets = false;
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const targets = prim.listTargets();
      if (targets.length) {
        hasMorphTargets = true;
        morphTargetCount += targets.length;
      }
    }
  }

  const cameras = root.listCameras();
  const lights = (() => {
    try {
      // KHR_lights_punctual extension nodes; not present unless registered/used.
      const ext = document.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_lights_punctual');
      return ext ? countPunctualLights(document) : 0;
    } catch {
      return 0;
    }
  })();

  const extensionsUsed = document.getRoot().listExtensionsUsed().map((e) => e.extensionName);
  const extensionsRequired = document.getRoot().listExtensionsRequired().map((e) => e.extensionName);

  const hasTransparency = materials.some((m) => {
    const mode = m.getAlphaMode();
    return mode === 'BLEND' || mode === 'MASK';
  });

  return {
    file: {
      filename: fileMeta.filename,
      bytes: fileMeta.bytes,
      formattedSize: formatBytes(fileMeta.bytes),
    },
    scene: {
      sceneCount: scenes.length,
      nodeCount: allNodes.length,
    },
    geometry: {
      meshCount: meshes.length,
      primitiveCount: primitives.length,
      vertexCount,
      triangleCount,
    },
    materials: {
      count: materials.length,
      names: materials.map((m) => m.getName() || '(unnamed)'),
      hasTransparency,
    },
    textures: {
      count: textures.length,
      items: textureItems,
    },
    animations: {
      count: animations.length,
      items: animationItems,
    },
    rigging: {
      skinCount: skins.length,
      jointCount: totalJoints,
      items: skinItems,
    },
    morphTargets: {
      present: hasMorphTargets,
      count: morphTargetCount,
    },
    other: {
      cameraCount: cameras.length,
      lightCount: lights,
      extensionsUsed,
      extensionsRequired,
    },
  };
}

function countPunctualLights(document) {
  // Walk nodes looking for the KHR_lights_punctual extension attachment.
  let count = 0;
  for (const node of document.getRoot().listNodes()) {
    const ext = node.getExtension && node.getExtension('KHR_lights_punctual');
    if (ext) count += 1;
  }
  return count;
}
