// Centralised optimisation presets. UI code reads from here; it never
// hardcodes preset values inline. See processing/buildPlan.js for how a
// preset becomes a concrete plan once safety rules have been applied.

export const PRESET_IDS = {
  SAFE: 'safe',
  GAME_READY: 'gameReady',
  TINY: 'tiny',
};

export const PRESETS = {
  // Preservation first. Only removes what is provably unused and only
  // reorganises data in ways that cannot change how the model renders.
  [PRESET_IDS.SAFE]: {
    id: PRESET_IDS.SAFE,
    label: 'Safe',
    description: 'High quality',
    cleanup: true,
    deduplicate: true,
    textures: { resize: false, maxSize: null, quality: 0.92, compress: false, toWebP: false },
    geometry: { optimise: true, simplify: false, targetRatio: 1, reorder: false, quantize: false },
    animations: { resample: true },
    compression: { method: null },
    preserve: {
      animations: true,
      skins: true,
      morphTargets: true,
      materials: true,
      uvs: true,
      vertexColours: true,
    },
  },

  // Balanced realtime target: sensible texture budget, cache-friendly vertex
  // order, Meshopt compression. No geometry loss.
  [PRESET_IDS.GAME_READY]: {
    id: PRESET_IDS.GAME_READY,
    label: 'Game Ready',
    description: 'Balanced',
    cleanup: true,
    deduplicate: true,
    textures: { resize: true, maxSize: 2048, quality: 0.82, compress: true, toWebP: true },
    geometry: { optimise: true, simplify: false, targetRatio: 0.8, reorder: true, quantize: false },
    animations: { resample: true },
    compression: { method: 'meshopt' },
    preserve: {
      animations: true,
      skins: true,
      morphTargets: true,
      materials: true,
      uvs: true,
      vertexColours: true,
    },
  },

  // Smallest practical output. Adds real geometry reduction and attribute
  // quantization — both still gated per-model by safetyRules.js.
  [PRESET_IDS.TINY]: {
    id: PRESET_IDS.TINY,
    label: 'Tiny',
    description: 'Smallest size',
    cleanup: true,
    deduplicate: true,
    textures: { resize: true, maxSize: 1024, quality: 0.68, compress: true, toWebP: true },
    geometry: { optimise: true, simplify: true, targetRatio: 0.5, reorder: true, quantize: true },
    animations: { resample: true },
    compression: { method: 'meshopt' },
    preserve: {
      animations: true,
      skins: true,
      morphTargets: true,
      materials: true,
      uvs: true,
      vertexColours: true,
    },
  },
};

export function getPreset(id) {
  return PRESETS[id] ?? PRESETS[PRESET_IDS.GAME_READY];
}

export function clonePresetPlan(id) {
  return structuredClone(getPreset(id));
}

export const DEFAULT_PRESET_ID = PRESET_IDS.GAME_READY;

export const ADVANCED_DEFAULTS = {
  onlyWhenSmaller: true,
  includeReport: false,
};
