import { store } from '../app/state.js';

const RESOLUTIONS = [
  { value: 'original', label: 'Original' },
  { value: '4096', label: '4096' },
  { value: '2048', label: '2048' },
  { value: '1024', label: '1024' },
  { value: '512', label: '512' },
];

/** @returns {() => void} unsubscribe, so the tool can clean up on unmount */
export function initAdvancedPanel() {
  const body = document.getElementById('advanced-body');
  body.innerHTML = buildMarkup();

  const els = {
    maxResolution: body.querySelector('#adv-max-resolution'),
    quality: body.querySelector('#adv-quality'),
    qualityValue: body.querySelector('#adv-quality-value'),
    compress: body.querySelector('#adv-compress'),
    preserveTransparency: body.querySelector('#adv-preserve-transparency'),
    geomOptimise: body.querySelector('#adv-geom-optimise'),
    geomSimplify: body.querySelector('#adv-geom-simplify'),
    targetPercent: body.querySelector('#adv-target-percent'),
    targetPercentValue: body.querySelector('#adv-target-percent-value'),
    removeUnused: body.querySelector('#adv-remove-unused'),
    deduplicate: body.querySelector('#adv-deduplicate'),
    preserveAnimations: body.querySelector('#adv-preserve-animations'),
    preserveSkins: body.querySelector('#adv-preserve-skins'),
    preserveMorph: body.querySelector('#adv-preserve-morph'),
    preserveMaterials: body.querySelector('#adv-preserve-materials'),
    preserveUvs: body.querySelector('#adv-preserve-uvs'),
    preserveVertexColours: body.querySelector('#adv-preserve-vcolours'),
    compressionEnabled: body.querySelector('#adv-compression-enabled'),
    onlyWhenSmaller: body.querySelector('#adv-only-when-smaller'),
    includeReport: body.querySelector('#adv-include-report'),
  };

  function patchAdvanced(patch) {
    store.update((s) => {
      s.advanced = deepMerge(s.advanced, patch);
    });
  }

  els.maxResolution.addEventListener('change', () =>
    patchAdvanced({ textures: { maxResolution: els.maxResolution.value } })
  );
  els.quality.addEventListener('input', () => {
    const q = Number(els.quality.value) / 100;
    els.qualityValue.textContent = els.quality.value;
    patchAdvanced({ textures: { quality: q } });
  });
  els.compress.addEventListener('change', () => patchAdvanced({ textures: { compress: els.compress.checked } }));
  els.preserveTransparency.addEventListener('change', () =>
    patchAdvanced({ textures: { preserveTransparency: els.preserveTransparency.checked } })
  );

  els.geomOptimise.addEventListener('change', () =>
    patchAdvanced({ geometry: { optimise: els.geomOptimise.checked } })
  );
  els.geomSimplify.addEventListener('change', () =>
    patchAdvanced({ geometry: { simplify: els.geomSimplify.checked } })
  );
  els.targetPercent.addEventListener('input', () => {
    els.targetPercentValue.textContent = `${els.targetPercent.value}%`;
    patchAdvanced({ geometry: { targetPercent: Number(els.targetPercent.value) } });
  });

  els.removeUnused.addEventListener('change', () =>
    patchAdvanced({ data: { removeUnused: els.removeUnused.checked } })
  );
  els.deduplicate.addEventListener('change', () =>
    patchAdvanced({ data: { deduplicate: els.deduplicate.checked } })
  );

  [
    ['preserveAnimations', 'animations'],
    ['preserveSkins', 'skins'],
    ['preserveMorph', 'morphTargets'],
    ['preserveMaterials', 'materials'],
    ['preserveUvs', 'uvs'],
    ['preserveVertexColours', 'vertexColours'],
  ].forEach(([key, field]) => {
    els[key].addEventListener('change', () => patchAdvanced({ preserve: { [field]: els[key].checked } }));
  });

  els.onlyWhenSmaller.addEventListener('change', () =>
    store.update((s) => {
      s.advanced.onlyWhenSmaller = els.onlyWhenSmaller.checked;
    })
  );
  els.includeReport.addEventListener('change', () =>
    store.update((s) => {
      s.advanced.includeReport = els.includeReport.checked;
    })
  );

  function render(state) {
    const a = state.advanced;
    els.maxResolution.value = a.textures.maxResolution;
    els.quality.value = Math.round(a.textures.quality * 100);
    els.qualityValue.textContent = String(Math.round(a.textures.quality * 100));
    els.compress.checked = a.textures.compress;
    els.preserveTransparency.checked = a.textures.preserveTransparency;
    els.geomOptimise.checked = a.geometry.optimise;
    els.geomSimplify.checked = a.geometry.simplify;
    els.targetPercent.value = a.geometry.targetPercent;
    els.targetPercentValue.textContent = `${a.geometry.targetPercent}%`;
    els.removeUnused.checked = a.data.removeUnused;
    els.deduplicate.checked = a.data.deduplicate;
    els.preserveAnimations.checked = a.preserve.animations;
    els.preserveSkins.checked = a.preserve.skins;
    els.preserveMorph.checked = a.preserve.morphTargets;
    els.preserveMaterials.checked = a.preserve.materials;
    els.preserveUvs.checked = a.preserve.uvs;
    els.preserveVertexColours.checked = a.preserve.vertexColours;
    els.compressionEnabled.checked = a.compression.enabled;
    els.onlyWhenSmaller.checked = a.onlyWhenSmaller;
    els.includeReport.checked = a.includeReport;
  }

  const unsubscribe = store.subscribe(render);
  render(store.get());
  return unsubscribe;
}

function deepMerge(target, patch) {
  const out = { ...target };
  for (const key of Object.keys(patch)) {
    if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])) {
      out[key] = { ...target[key], ...patch[key] };
    } else {
      out[key] = patch[key];
    }
  }
  return out;
}

function buildMarkup() {
  return `
    <div>
      <div class="advanced-group-title">Textures</div>
      <div class="field-row">
        <span>Maximum resolution</span>
        <select class="select" id="adv-max-resolution">
          ${RESOLUTIONS.map((r) => `<option value="${r.value}">${r.label}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <span>Texture quality</span>
        <span style="display:flex; align-items:center; gap:8px;">
          <input class="slider" type="range" id="adv-quality" min="10" max="100" step="1" data-tooltip="Ignored without a Sharp encoder in this build" />
          <span id="adv-quality-value" style="font-variant-numeric: tabular-nums; width: 28px; text-align:right;"></span>
        </span>
      </div>
      <div class="field-row"><span>Compress textures</span><label class="switch"><input type="checkbox" id="adv-compress" /><span class="switch-track"></span></label></div>
      <div class="field-row"><span>Preserve transparency</span><label class="switch"><input type="checkbox" id="adv-preserve-transparency" /><span class="switch-track"></span></label></div>
    </div>

    <div>
      <div class="advanced-group-title">Geometry</div>
      <div class="field-row"><span>Optimise mesh data (weld)</span><label class="switch"><input type="checkbox" id="adv-geom-optimise" /><span class="switch-track"></span></label></div>
      <div class="field-row"><span>Simplify geometry</span><label class="switch"><input type="checkbox" id="adv-geom-simplify" data-tooltip="Not yet implemented — always skipped with a reason in the report" /><span class="switch-track"></span></label></div>
      <div class="field-row">
        <span>Target geometry percentage</span>
        <span style="display:flex; align-items:center; gap:8px;">
          <input class="slider" type="range" id="adv-target-percent" min="10" max="100" step="5" />
          <span id="adv-target-percent-value" style="font-variant-numeric: tabular-nums; width: 32px; text-align:right;"></span>
        </span>
      </div>
    </div>

    <div>
      <div class="advanced-group-title">Data</div>
      <div class="field-row"><span>Remove unused resources</span><label class="switch"><input type="checkbox" id="adv-remove-unused" /><span class="switch-track"></span></label></div>
      <div class="field-row"><span>Deduplicate resources</span><label class="switch"><input type="checkbox" id="adv-deduplicate" /><span class="switch-track"></span></label></div>
    </div>

    <div>
      <div class="advanced-group-title">Preserve</div>
      <div class="field-row"><span>Animations</span><label class="switch"><input type="checkbox" id="adv-preserve-animations" /><span class="switch-track"></span></label></div>
      <div class="field-row"><span>Rig / skins</span><label class="switch"><input type="checkbox" id="adv-preserve-skins" /><span class="switch-track"></span></label></div>
      <div class="field-row"><span>Morph targets</span><label class="switch"><input type="checkbox" id="adv-preserve-morph" /><span class="switch-track"></span></label></div>
      <div class="field-row"><span>Materials</span><label class="switch"><input type="checkbox" id="adv-preserve-materials" /><span class="switch-track"></span></label></div>
      <div class="field-row"><span>UVs</span><label class="switch"><input type="checkbox" id="adv-preserve-uvs" /><span class="switch-track"></span></label></div>
      <div class="field-row"><span>Vertex colours</span><label class="switch"><input type="checkbox" id="adv-preserve-vcolours" /><span class="switch-track"></span></label></div>
    </div>

    <div>
      <div class="advanced-group-title">Advanced Compression</div>
      <div class="field-row">
        <span data-tooltip="Meshopt/Draco are architected for but not wired into this build">Enable mesh compression</span>
        <label class="switch"><input type="checkbox" id="adv-compression-enabled" disabled /><span class="switch-track"></span></label>
      </div>
    </div>

    <div>
      <div class="advanced-group-title">Output</div>
      <div class="checkbox-row" style="padding: 4px 0;"><input type="checkbox" id="adv-only-when-smaller" /><label for="adv-only-when-smaller">Only use optimised version when smaller</label></div>
      <div class="checkbox-row" style="padding: 4px 0;"><input type="checkbox" id="adv-include-report" /><label for="adv-include-report">Include optimisation report (meshkit-report.json in ZIP)</label></div>
    </div>
  `;
}
