/**
 * Pipeline stage catalogue and ordering rules.
 *
 * `locked` stages cannot move (inspect is always first, export always last).
 * `after` lists stages that must run earlier when both are enabled — a
 * violation is an error and blocks the run. `prefersAfter` is advisory: the
 * order is allowed but the output changes, so the user gets a warning.
 */
export const STAGES = {
  inspect: {
    label: 'Inspect asset',
    blurb: 'Read every file, count geometry and textures, flag unsupported or missing data.',
    locked: true,
    required: true,
  },
  cleanup: {
    label: 'Remove unused resources',
    blurb: 'Prune unreferenced data and deduplicate identical accessors, meshes, materials and textures.',
  },
  scene: {
    label: 'Optimise scene graph',
    blurb: 'Scale / axis / origin changes, empty-node removal, mesh merging and instancing (Advanced settings).',
  },
  geometry: {
    label: 'Optimise geometry',
    blurb: 'Weld, remove degenerate triangles, simplify with meshoptimizer, reorder for the vertex cache.',
  },
  lods: {
    label: 'Generate LODs',
    blurb: 'Simplify fresh copies of the geometry entering this stage into an LOD chain.',
    prefersAfter: ['geometry'],
  },
  resizeTextures: {
    label: 'Resize textures',
    blurb: 'Downscale textures over each role’s size limit. Smaller textures are never upscaled.',
  },
  compressTextures: {
    label: 'Compress textures',
    blurb: 'Re-encode per texture role (PNG, JPEG, WebP or KTX2), keeping data maps lossless by default.',
    after: ['resizeTextures'],
  },
  animation: {
    label: 'Optimise animations',
    blurb: 'Remove keyframes that are exactly interpolable from their neighbours.',
  },
  validate: {
    label: 'Validate output',
    blurb: 'Re-open every output and check structure, references and that protected features survived.',
    after: ['cleanup', 'scene', 'geometry', 'lods', 'resizeTextures', 'compressTextures', 'animation'],
  },
  report: {
    label: 'Reports & thumbnails',
    blurb: 'Per-asset JSON report, thumbnails and batch summaries.',
    after: ['validate'],
  },
  export: {
    label: 'Export assets',
    blurb: 'Write final GLB files with the chosen naming and folder layout.',
    locked: true,
    required: true,
  },
};

export const STAGE_IDS = Object.keys(STAGES);

/** Stages that modify the asset. Validation must come after all of them to mean anything. */
export const MUTATING = ['cleanup', 'scene', 'geometry', 'lods', 'resizeTextures', 'compressTextures', 'animation'];

/**
 * @param {{id: string, enabled: boolean}[]} stages ordered
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkStageOrder(stages) {
  const errors = [];
  const warnings = [];
  const enabled = stages.filter((s) => s.enabled).map((s) => s.id);
  const pos = (id) => enabled.indexOf(id);

  if (stages[0]?.id !== 'inspect') errors.push('Inspect asset must be the first stage.');
  if (stages[stages.length - 1]?.id !== 'export') errors.push('Export assets must be the last stage.');

  for (const id of enabled) {
    const def = STAGES[id];
    for (const before of def.after || []) {
      if (pos(before) !== -1 && pos(before) > pos(id)) {
        errors.push(`${def.label} must run after ${STAGES[before].label}.`);
      }
    }
    for (const before of def.prefersAfter || []) {
      if (pos(before) !== -1 && pos(before) > pos(id)) {
        warnings.push(`${def.label} runs before ${STAGES[before].label}: LODs will be cut from unoptimised geometry, and LOD0 will still be optimised afterwards.`);
      }
    }
  }

  if (pos('lods') !== -1) {
    const lodPos = pos('lods');
    const later = ['resizeTextures', 'compressTextures', 'animation'].filter((id) => pos(id) > lodPos);
    if (later.length) {
      warnings.push(`Stages after Generate LODs (${later.map((id) => STAGES[id].label).join(', ')}) run once per LOD level. Identical textures are encoded once and reused.`);
    }
  }
  if (pos('validate') === -1) {
    warnings.push('Validate output is disabled: outputs will be written without re-opening and checking them.');
  }
  if (pos('compressTextures') !== -1 && pos('resizeTextures') === -1) {
    warnings.push('Compress textures runs without Resize textures: role size limits are ignored.');
  }
  return { errors, warnings };
}
