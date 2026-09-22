// Minimal observable store. No framework — just a plain object with
// change notification, since the whole app is a handful of panels
// reacting to a single source of truth.

import { DEFAULT_PRESET_ID, ADVANCED_DEFAULTS } from '../config/presets.js';

/**
 * @typedef {Object} ModelEntry
 * @property {string} id
 * @property {File} file
 * @property {string} name
 * @property {number} bytes
 * @property {'waiting'|'analysing'|'ready'|'optimising'|'validating'|'complete'|'warning'|'failed'|'cancelled'|'skipped'} status
 * @property {string|null} statusMessage
 * @property {import('../glb/analyse.js').GlbAnalysis|null} analysis
 * @property {import('../glb/classify.js').ModelClassification|null} classification
 * @property {ArrayBuffer|null} originalBuffer
 * @property {ArrayBuffer|null} optimisedBuffer
 * @property {import('../glb/analyse.js').GlbAnalysis|null} optimisedAnalysis
 * @property {Object|null} operationReport
 * @property {Object|null} validation
 * @property {string} presetOverride  -- '' means "use global preset"
 */

function createInitialState() {
  return {
    models: /** @type {ModelEntry[]} */ ([]),
    selectedModelId: null,
    globalPreset: DEFAULT_PRESET_ID,
    advanced: { ...ADVANCED_DEFAULTS, ...defaultAdvancedOptions() },
    advancedOpen: false,
    processing: {
      active: false,
      cancelled: false,
      currentIndex: -1,
      total: 0,
      stage: '',
    },
    theme: 'dark',
  };
}

function defaultAdvancedOptions() {
  return {
    textures: {
      maxResolution: 'original', // 'original' | 4096 | 2048 | 1024 | 512
      quality: 0.82,
      compress: true,
      preserveTransparency: true,
    },
    geometry: {
      optimise: true,
      simplify: false,
      targetPercent: 80,
    },
    data: {
      removeUnused: true,
      deduplicate: true,
    },
    preserve: {
      animations: true,
      skins: true,
      morphTargets: true,
      materials: true,
      uvs: true,
      vertexColours: true,
    },
    compression: {
      enabled: false,
      method: 'meshopt', // 'meshopt' | 'draco'
    },
  };
}

class Store {
  constructor() {
    this.state = createInitialState();
    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this._emit();
  }

  update(fn) {
    fn(this.state);
    this._emit();
  }

  _emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  getSelectedModel() {
    return this.state.models.find((m) => m.id === this.state.selectedModelId) ?? null;
  }

  getModel(id) {
    return this.state.models.find((m) => m.id === id) ?? null;
  }

  patchModel(id, patch) {
    const models = this.state.models.map((m) => (m.id === id ? { ...m, ...patch } : m));
    this.set({ models });
  }
}

export const store = new Store();

let idCounter = 0;
export function nextModelId() {
  idCounter += 1;
  return `model-${Date.now()}-${idCounter}`;
}
