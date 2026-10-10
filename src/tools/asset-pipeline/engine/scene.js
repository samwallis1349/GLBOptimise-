import { PropertyType } from '@gltf-transform/core';
import { center, dedup, flatten, instance, join, prune, resample } from '@gltf-transform/functions';

/**
 * Clean-up, scene-graph and animation stages. Small on purpose: each is a
 * thin, explicit wrapper over a glTF-Transform function, with the safety
 * gates (animated / skinned content) decided here rather than left to the
 * library's defaults.
 */

export async function cleanup({ document, settings, log }) {
  const ops = [];
  const a = settings.advanced;

  if (!a.keepCameras) {
    const cams = document.getRoot().listCameras();
    if (cams.length) {
      for (const cam of cams) cam.dispose();
      ops.push(`remove ${cams.length} camera(s)`);
    }
  }
  if (!a.keepLights) {
    const ext = document.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_lights_punctual');
    if (ext) {
      ext.dispose();
      ops.push('remove lights');
    }
  }

  const dedupTypes = [];
  if (settings.geometry.dedupe) dedupTypes.push(PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.SKIN);
  if (settings.textures.dedupe) dedupTypes.push(PropertyType.TEXTURE);
  dedupTypes.push(PropertyType.MATERIAL);
  await document.transform(dedup({ propertyTypes: dedupTypes, keepUniqueNames: true }));
  ops.push('deduplicate identical resources');

  const pruneTypes = [PropertyType.NODE, PropertyType.SKIN, PropertyType.MESH, PropertyType.CAMERA, PropertyType.PRIMITIVE, PropertyType.PRIMITIVE_TARGET, PropertyType.ACCESSOR, PropertyType.BUFFER];
  if (a.removeUnusedMaterials) pruneTypes.push(PropertyType.MATERIAL);
  if (settings.textures.removeUnused) pruneTypes.push(PropertyType.TEXTURE);
  const counts = snapshot(document);
  await document.transform(
    prune({
      propertyTypes: pruneTypes,
      keepLeaves: !a.removeEmptyNodes,
      keepExtras: a.keepExtras,
      keepAttributes: true,
      keepSolidTextures: true,
    })
  );
  const after = snapshot(document);
  const removed = Object.entries(counts)
    .map(([k, v]) => [k, v - after[k]])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k}`);
  ops.push(removed.length ? `remove unused: ${removed.join(', ')}` : 'remove unused resources (none found)');
  log.debug?.(ops.join('; '));
  return { ops };
}

function snapshot(document) {
  const r = document.getRoot();
  return { nodes: r.listNodes().length, meshes: r.listMeshes().length, materials: r.listMaterials().length, textures: r.listTextures().length, accessors: r.listAccessors().length };
}

/** Rotation of -90° about X: converts a Z-up source to glTF's Y-up. */
const Z_TO_Y = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

function multiplyQuat(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
function rotateVec(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

function animatedNodes(document) {
  const set = new Set();
  for (const anim of document.getRoot().listAnimations()) for (const ch of anim.listChannels()) if (ch.getTargetNode()) set.add(ch.getTargetNode());
  return set;
}

export async function optimiseScene({ document, settings, log }) {
  const ops = [];
  const a = settings.advanced;
  const root = document.getRoot();
  const animated = animatedNodes(document);
  const hasSkins = root.listSkins().length > 0;

  // Scale / axis conversion. Applied to each scene root's own transform so
  // the hierarchy is unchanged; an animated root would have its transform
  // overwritten by the clip, so those get a new parent node instead.
  if (a.scale !== 1 || a.sourceUp === 'z') {
    const q = a.sourceUp === 'z' ? Z_TO_Y : [0, 0, 0, 1];
    const s = a.scale;
    for (const scene of root.listScenes()) {
      for (const node of scene.listChildren()) {
        if (animated.has(node)) {
          const wrapper = document.createNode(`${node.getName() || 'root'}_conversion`).setRotation(q).setScale([s, s, s]);
          scene.removeChild(node);
          wrapper.addChild(node);
          scene.addChild(wrapper);
          log.warn(`"${node.getName() || 'root'}" is animated, so the conversion was put on a new parent node (hierarchy changed by one level).`);
          continue;
        }
        const t = node.getTranslation();
        const r = node.getRotation();
        const sc = node.getScale();
        node.setTranslation(rotateVec(q, t).map((v) => v * s));
        node.setRotation(multiplyQuat(q, r));
        node.setScale(sc.map((v) => v * s));
      }
    }
    if (a.scale !== 1) ops.push(`scale ×${a.scale}`);
    if (a.sourceUp === 'z') ops.push('convert Z-up → Y-up');
  }

  if (a.origin !== 'preserve') {
    if (animated.size || hasSkins) {
      log.warn(`Origin was not moved: the asset is ${hasSkins ? 'skinned' : 'animated'} and moving root transforms would offset its animation.`);
    } else {
      await document.transform(center({ pivot: a.origin === 'below' ? 'below' : 'center' }));
      ops.push(a.origin === 'below' ? 'origin → base centre' : 'origin → bounds centre');
    }
  }

  if (a.mergeMeshes) {
    if (animated.size || hasSkins) {
      log.warn('Merge compatible meshes was skipped: the asset is animated or skinned, and merging would break node animation or skinning.');
    } else {
      const before = root.listMeshes().length;
      await document.transform(flatten(), join({ keepMeshes: false, keepNamed: false }), prune({ keepExtras: a.keepExtras }));
      ops.push(`merge compatible meshes (${before} → ${root.listMeshes().length})`);
      log.warn('Meshes were merged: node hierarchy and mesh names changed.');
    }
  }

  if (a.instance) {
    const before = root.listNodes().length;
    await document.transform(instance({ min: 2 }));
    const after = root.listNodes().length;
    if (after < before) {
      ops.push(`instance repeated meshes (EXT_mesh_gpu_instancing, ${before} → ${after} nodes)`);
      log.warn('GPU instancing (EXT_mesh_gpu_instancing) requires engine support: three.js, Babylon and glTFast read it; Unreal’s importer does not.');
    } else ops.push('instance repeated meshes (none found)');
  }
  return { ops };
}

export async function optimiseAnimation({ document, settings, log }) {
  const anims = document.getRoot().listAnimations();
  if (!anims.length) return { ops: ['no animations'] };
  if (settings.animation.removeAnimations) {
    for (const anim of anims) anim.dispose();
    await document.transform(prune({ propertyTypes: [PropertyType.ACCESSOR] }));
    log.warn(`Removed ${anims.length} animation clip(s).`);
    return { ops: [`remove ${anims.length} animation clip(s)`] };
  }
  if (!settings.animation.resample) return { ops: [] };
  const keys = countKeys(document);
  await document.transform(resample({ tolerance: settings.animation.tolerance }));
  await document.transform(prune({ propertyTypes: [PropertyType.ACCESSOR] }));
  return { ops: [`remove redundant keyframes (${keys} → ${countKeys(document)})`] };
}

function countKeys(document) {
  let n = 0;
  for (const anim of document.getRoot().listAnimations()) for (const s of anim.listSamplers()) n += s.getInput()?.getCount() || 0;
  return n;
}
