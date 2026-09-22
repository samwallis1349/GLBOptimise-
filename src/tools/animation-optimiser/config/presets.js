/**
 * Reduction presets.
 *
 * Tolerances are expressed in the units each channel is actually measured in
 * — metres for translation, degrees for rotation, a unitless ratio for scale
 * and morph weights — rather than as one abstract "quality" number, because
 * those three quantities have nothing to do with each other numerically. A
 * 1mm translation error is invisible; a 1-degree error on a forearm is not.
 *
 * The defaults are deliberately conservative. A tool that silently degrades
 * motion to win a percentage is worse than useless, so "Balanced" is tuned to
 * the point where a side-by-side A/B in the viewport shows no difference on
 * typical humanoid mocap, and anything more aggressive is an explicit choice
 * the user makes.
 */

export const PRESETS = {
  lossless: {
    id: 'lossless',
    label: 'Lossless',
    description: 'Removes only keyframes that are mathematically redundant.',
    positionTolerance: 0.00001, // 0.01mm
    rotationDegrees: 0.01,
    scaleTolerance: 0.00001,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Big savings with no visible change. Start here.',
    positionTolerance: 0.0005, // 0.5mm
    rotationDegrees: 0.1,
    scaleTolerance: 0.0005,
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    description: 'Smallest files. Check the A/B before shipping.',
    positionTolerance: 0.005, // 5mm
    rotationDegrees: 0.5,
    scaleTolerance: 0.005,
  },
};

export const DEFAULT_PRESET = 'balanced';

/** Frame-rate targets offered in the UI. `null` keeps each clip's own rate. */
export const FRAME_RATES = [
  { value: null, label: 'Keep original' },
  { value: 60, label: '60 fps' },
  { value: 30, label: '30 fps' },
  { value: 24, label: '24 fps' },
];

/** Turns a preset (plus UI toggles) into the options the engine expects. */
export function buildOptions(presetId, { targetFps, collapseConstant, removeEmptyClips, reduceKeyframes }) {
  const preset = PRESETS[presetId] ?? PRESETS[DEFAULT_PRESET];
  return {
    reduceKeyframes,
    positionTolerance: preset.positionTolerance,
    rotationTolerance: (preset.rotationDegrees * Math.PI) / 180,
    scaleTolerance: preset.scaleTolerance,
    targetFps,
    collapseConstant,
    removeEmptyClips,
  };
}
