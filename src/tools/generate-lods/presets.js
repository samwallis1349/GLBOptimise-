/**
 * LOD chain presets. Each level's number is the fraction of geometry KEPT
 * relative to the *original* model, not the previous level — every level is
 * generated independently from the source (see LODEngine.js for why), so
 * "LOD2 keeps 25%" always means 25% of LOD0, never 25% of LOD1.
 *
 * `id` on a level is stable across edits (used as a React-free "key" for
 * re-rendering rows); `label` is what the level is called in the UI and in
 * downloaded filenames.
 */
function levels(...keeps) {
  return keeps.map((keep, i) => ({ id: `lod${i}`, label: `LOD${i}`, keep }));
}

export const LOD_CHAIN_PRESETS = {
  standard: {
    id: 'standard',
    label: 'Standard',
    blurb: '4 levels · 100/50/25/10%',
    levels: levels(1, 0.5, 0.25, 0.1),
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    blurb: '4 levels · 100/35/15/5%',
    levels: levels(1, 0.35, 0.15, 0.05),
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    blurb: '2 levels · 100/50%',
    levels: levels(1, 0.5),
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    blurb: 'Your chain',
    levels: null,
  },
};

export const DEFAULT_PRESET_ID = 'standard';

/** Advanced defaults. Only parameters meshoptimizer genuinely honours. Applied to every level. */
export const ADVANCED_DEFAULTS = {
  lockBorder: true,
  error: 0.01,
  cleanup: true,
};

/**
 * What the simplifier can and cannot be told to do — identical facts to
 * Reduce Polys, since Generate LODs runs the same meshoptimizer engine, just
 * once per level instead of once per run.
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
  { label: 'Morph targets', state: 'inherent', note: 'Targets are resized in step with each level’s mesh.' },
  { label: 'Vertex colours', state: 'inherent', note: 'Carried through as a vertex attribute.' },
  { label: 'Animations', state: 'inherent', note: 'Geometry reduction does not touch animation tracks.' },
  {
    label: 'Points / lines / strips',
    state: 'unsupported',
    note: 'The simplifier handles indexed triangle lists only — these are skipped, never altered, in every level.',
  },
];

/**
 * Heuristic-only suggested switch-distance multiplier, expressed as a
 * multiple of the model's own bounding radius (see LODAnalysis.js
 * `computeBoundingRadius`). This is not derived from a perceptual study —
 * it is a starting point to tune per scene and per engine, exactly like the
 * illustrative density preview in Reduce Polys is never presented as a
 * measured result. Lower `keep` returns a larger multiplier: a coarser mesh
 * needs to occupy less of the screen before its simplification stops being
 * visible, so it can switch in further away.
 * @param {number} keep 0–1
 */
export function suggestedDistanceMultiplier(keep) {
  const k = Math.max(0.01, Math.min(1, keep));
  return Math.round((3 / Math.sqrt(k)) * 10) / 10;
}
