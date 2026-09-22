/**
 * Reduction presets. The number is the fraction of geometry KEPT, not
 * removed — the UI states this explicitly because the inverse reading is
 * the obvious way to misunderstand the control.
 */
export const REDUCTION_PRESETS = {
  light: { id: 'light', label: 'Light', keep: 0.75, blurb: '75% kept' },
  medium: { id: 'medium', label: 'Medium', keep: 0.5, blurb: '50% kept' },
  heavy: { id: 'heavy', label: 'Heavy', keep: 0.25, blurb: '25% kept' },
  custom: { id: 'custom', label: 'Custom', keep: null, blurb: 'Your value' },
};

export const DEFAULT_PRESET_ID = 'medium';

/** Advanced defaults. Only parameters meshoptimizer genuinely honours. */
export const ADVANCED_DEFAULTS = {
  lockBorder: true,
  error: 0.01,
  cleanup: true,
};

/**
 * What the simplifier can and cannot be told to do. Rendered in the
 * Advanced panel so nothing is presented as a toggle unless it really is
 * one — the rest is shown as inherent behaviour with an explanation.
 */
export const PRESERVATION_FACTS = [
  {
    label: 'Material boundaries',
    state: 'inherent',
    note: 'Each primitive carries one material and is simplified separately.',
  },
  {
    label: 'UV seams',
    state: 'inherent',
    note: 'Welding is bitwise-exact, so seam vertices stay split and never merge.',
  },
  { label: 'Normals', state: 'inherent', note: 'Carried through and recomputed per collapsed vertex.' },
  { label: 'Skinning (joints & weights)', state: 'inherent', note: 'Carried through by meshoptimizer.' },
  { label: 'Morph targets', state: 'inherent', note: 'Targets are resized in step with the base mesh.' },
  { label: 'Vertex colours', state: 'inherent', note: 'Carried through as a vertex attribute.' },
  { label: 'Animations', state: 'inherent', note: 'Geometry reduction does not touch animation tracks.' },
  {
    label: 'Points / lines / strips',
    state: 'unsupported',
    note: 'The simplifier handles indexed triangle lists only — these are skipped, never altered.',
  },
];
