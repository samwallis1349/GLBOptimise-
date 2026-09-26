import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { exportModel, prepareExportRoot } from '../../convert-files/processing/exportModel.js';
import { ARRANGER_CONFIG } from '../config.js';

/**
 * Builds an export root from scene instances and writes it out.
 *
 * Each instance is cloned (sharing geometry/materials, so this is cheap) with
 * its wrapper transform intact, which is what makes the reopened file match
 * the viewport arrangement. Animation tracks are rewritten to target the
 * cloned node's uuid — PropertyBinding.findNode matches uuids too — so two
 * copies of the same character each keep their own clips instead of every
 * clip resolving to the first "mixamorigHips" in the file.
 */

function bindClipsTo(root, clips, prefix) {
  const byName = new Map();
  root.traverse((node) => { if (!byName.has(node.name)) byName.set(node.name, node); });
  return clips.map((clip) => {
    const tracks = [];
    for (const track of clip.tracks) {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      const node = byName.get(parsed.nodeName);
      if (!node) continue;
      const copy = track.clone();
      if (track.name.startsWith(parsed.nodeName)) copy.name = node.uuid + track.name.slice(parsed.nodeName.length);
      tracks.push(copy);
    }
    return new THREE.AnimationClip(prefix ? `${prefix}|${clip.name}` : clip.name, clip.duration, tracks);
  }).filter((clip) => clip.tracks.length);
}

function buildRoot(instances, { ground, sceneName, prefixClips }) {
  const root = new THREE.Group();
  const clips = [];
  let textureCount = 0;
  for (const instance of instances) {
    const copy = cloneSkinned(instance.object);
    copy.name = instance.name;
    copy.visible = true;
    copy.userData = { assetbenchSource: instance.source.filename };
    root.add(copy);
    clips.push(...bindClipsTo(copy, instance.source.clips, prefixClips ? instance.name : ''));
    copy.traverse((node) => {
      for (const material of [node.material].flat().filter(Boolean)) {
        for (const value of Object.values(material)) if (value?.isTexture) textureCount += 1;
      }
    });
  }
  if (ground) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ground.size, ground.size), ground.material.clone());
    mesh.name = 'Ground';
    mesh.rotation.x = -Math.PI / 2;
    root.add(mesh);
  }
  prepareExportRoot(root, sceneName);
  return { root, clips, textureCount };
}

function safeBase(name) {
  return (name || 'scene').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'scene';
}

/**
 * @param {object[]} instances scene instances ({ object, name, source })
 * @param {{ format: 'glb'|'gltf'|'obj', ground?: { size: number, material: THREE.Material }, name: string, prefixClips?: boolean }} options
 * @returns {Promise<{ blob: Blob, filename: string, lost: string[] }>}
 */
export async function exportInstances(instances, { format, ground, name, prefixClips = false }) {
  const base = safeBase(name);
  const { root, clips, textureCount } = buildRoot(instances, { ground, sceneName: base, prefixClips });
  try {
    if (format === 'glb') {
      const buffer = await new GLTFExporter().parseAsync(root, {
        binary: true,
        animations: clips,
        onlyVisible: true,
        embedImages: true,
        maxTextureSize: ARRANGER_CONFIG.maxExportTextureSize,
      });
      return { blob: new Blob([buffer], { type: 'model/gltf-binary' }), filename: `${base}.glb`, lost: [] };
    }
    return await exportModel(root, { format, base, clips, textureCount });
  } finally {
    root.traverse((node) => {
      if (node.name === 'Ground' && node.isMesh) {
        node.geometry.dispose();
        node.material.dispose();
      }
    });
  }
}
