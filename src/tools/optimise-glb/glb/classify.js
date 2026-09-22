/**
 * @typedef {Object} ModelClassification
 * @property {string[]} flags
 * @property {boolean} isSkinned
 * @property {boolean} isAnimated
 * @property {boolean} hasMorphTargets
 * @property {boolean} hasTransparency
 * @property {boolean} hasDataTextures
 */

export const CLASSIFICATION_FLAGS = {
  STATIC: 'STATIC',
  SKINNED: 'SKINNED',
  ANIMATED: 'ANIMATED',
  MORPH_TARGETS: 'MORPH_TARGETS',
  TRANSPARENCY: 'TRANSPARENCY',
  DATA_TEXTURES: 'DATA_TEXTURES',
};

const DATA_TEXTURE_SLOTS = new Set([
  'normalTexture',
  'metallicRoughnessTexture',
  'occlusionTexture',
  'clearcoatNormalTexture',
  'clearcoatRoughnessTexture',
  'transmissionTexture',
  'sheenRoughnessTexture',
  'specularTexture',
]);

/**
 * Classifies a model's capabilities from its real analysis result.
 * This classification is the single source of truth safety rules consult
 * before allowing any transformation — never re-derived ad hoc elsewhere.
 *
 * @param {import('./analyse.js').GlbAnalysis} analysis
 * @returns {ModelClassification}
 */
export function classifyModel(analysis) {
  const isSkinned = analysis.rigging.skinCount > 0;
  const isAnimated = analysis.animations.count > 0;
  const hasMorphTargets = analysis.morphTargets.present;
  const hasTransparency = Boolean(analysis.materials.hasTransparency);
  const hasDataTextures = analysis.textures.items.some((t) =>
    t.slots.some((slot) => DATA_TEXTURE_SLOTS.has(slot))
  );

  const flags = [];
  if (!isSkinned && !isAnimated && !hasMorphTargets) {
    flags.push(CLASSIFICATION_FLAGS.STATIC);
  }
  if (isSkinned) flags.push(CLASSIFICATION_FLAGS.SKINNED);
  if (isAnimated) flags.push(CLASSIFICATION_FLAGS.ANIMATED);
  if (hasMorphTargets) flags.push(CLASSIFICATION_FLAGS.MORPH_TARGETS);
  if (hasTransparency) flags.push(CLASSIFICATION_FLAGS.TRANSPARENCY);
  if (hasDataTextures) flags.push(CLASSIFICATION_FLAGS.DATA_TEXTURES);

  return {
    flags,
    isSkinned,
    isAnimated,
    hasMorphTargets,
    hasTransparency,
    hasDataTextures,
  };
}
