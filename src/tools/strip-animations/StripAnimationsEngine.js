import { prune } from '@gltf-transform/functions';

/**
 * Removes the animation clips at the given stable indices (positions in
 * `document.getRoot().listAnimations()` at analysis time) and prunes any
 * resources that become genuinely unused as a result.
 *
 * Indices, not names, are what drive removal — clip names can collide, so a
 * name-based removal could delete the wrong clip or all clips sharing a
 * name. The caller is expected to have captured `removeIndices` from the
 * same `analyseAnimations()` pass that produced the indices, against the
 * SAME document instance, before any other mutation happens.
 *
 * The rig itself (skins, joints, inverse-bind matrices, bones) is never
 * touched directly — only Animation properties are disposed. `prune()` runs
 * afterwards with `keepLeaves: true`, which protects bone/joint nodes (which
 * are typically leaves once their driving animation is gone) from being
 * swept away as "unused", along with `keepAttributes`/`keepSolidTextures`/
 * `keepExtras` so meshes, materials, textures and morph targets that are
 * still referenced anywhere are never removed. This mirrors the safe-prune
 * configuration already used by Reduce Polys and Compress Textures.
 */
export async function stripAnimations(document, removeIndices) {
  const root = document.getRoot();
  const toRemove = new Set(removeIndices);
  if (toRemove.size === 0) {
    return { removedCount: 0, remainingCount: root.listAnimations().length };
  }

  const animations = root.listAnimations();
  const targets = animations.filter((_, index) => toRemove.has(index));

  for (const animation of targets) {
    // Dispose channels/samplers explicitly first, then the animation itself
    // — .dispose() on the Animation already detaches its channels, but doing
    // it in this order guarantees no dangling sampler references remain even
    // if channels were shared (they are not, per the glTF spec, but this
    // keeps the operation defensive rather than relying on that assumption).
    for (const channel of animation.listChannels()) {
      channel.dispose();
    }
    for (const sampler of animation.listSamplers()) {
      sampler.dispose();
    }
    animation.dispose();
  }

  await document.transform(
    prune({
      keepExtras: true,
      keepAttributes: true,
      keepSolidTextures: true,
      keepLeaves: true,
    }),
  );

  return {
    removedCount: targets.length,
    remainingCount: root.listAnimations().length,
  };
}
