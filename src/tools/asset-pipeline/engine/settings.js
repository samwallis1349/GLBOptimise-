/**
 * Asset Pipeline settings: the single JSON-serialisable shape that drives a
 * run. A "profile" is just a named copy of this object, so saved profiles,
 * imported profile files and (later) a CLI or REST call all describe a job
 * the same way.
 *
 * Nothing here touches the DOM.
 */

export const SETTINGS_VERSION = 1;

/** Texture roles, each with independent settings. See engine/textures.js for how a texture gets its role. */
export const TEXTURE_ROLES = [
  { id: 'baseColor', label: 'Base colour', colour: true },
  { id: 'alpha', label: 'Alpha / transparent colour', colour: true },
  { id: 'normal', label: 'Normal', colour: false },
  { id: 'metallicRoughness', label: 'Metallic-roughness', colour: false },
  { id: 'occlusion', label: 'Occlusion', colour: false },
  { id: 'emissive', label: 'Emissive', colour: true },
  { id: 'other', label: 'Other', colour: false },
];

/** `keep` = stay in the source format (resized if needed). KTX2/WebP depend on encoders being present. */
export const TEXTURE_FORMATS = [
  { id: 'keep', label: 'Keep format' },
  { id: 'png', label: 'PNG (lossless)' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'webp', label: 'WebP' },
  { id: 'ktx2', label: 'KTX2 / Basis' },
];

export const MAX_SIZE_CHOICES = [256, 512, 1024, 2048, 4096, 0]; // 0 = original

const role = (maxSize, format = 'keep', quality = 85) => ({ maxSize, format, quality });

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    mode: 'balanced',
    engine: 'threejs',
    stages: [
      { id: 'inspect', enabled: true },
      { id: 'cleanup', enabled: true },
      { id: 'scene', enabled: true },
      { id: 'geometry', enabled: true },
      { id: 'lods', enabled: false },
      { id: 'resizeTextures', enabled: true },
      { id: 'compressTextures', enabled: true },
      { id: 'animation', enabled: true },
      { id: 'validate', enabled: true },
      { id: 'report', enabled: true },
      { id: 'export', enabled: true },
    ],
    geometry: {
      simplify: true,
      targetMode: 'percent', // 'percent' | 'triangles'
      keepPercent: 60,
      targetTriangles: 20000,
      minTriangles: 300,
      maxTriangles: 0, // 0 = no cap
      scope: 'model', // 'model' | 'mesh'
      lockBorder: true,
      error: 0.01,
      allowDeforming: false, // simplify skinned / morph-target meshes
      weld: true,
      removeDegenerate: true,
      dedupe: true,
      recalcNormals: false,
      joinPrimitives: false,
      reorder: true,
      quantize: false,
    },
    textures: {
      roles: {
        baseColor: role(2048, 'keep', 85),
        alpha: role(2048, 'keep', 90),
        normal: role(2048, 'keep', 95),
        metallicRoughness: role(1024, 'keep', 90),
        occlusion: role(1024, 'keep', 90),
        emissive: role(1024, 'keep', 85),
        other: role(2048, 'keep', 90),
      },
      powerOfTwo: false,
      dedupe: true,
      removeUnused: true,
      lossyDataMaps: false, // allow lossy formats on normal / packed data maps
      keepOriginals: false,
      output: 'embedded', // 'embedded' | 'separate'
      ktx2: { mode: 'auto', quality: 128, mipmaps: true },
    },
    lods: {
      levels: [
        { keep: 100, minTriangles: 0, distance: 0, screenSize: 1 },
        { keep: 50, minTriangles: 0, distance: 15, screenSize: 0.5 },
        { keep: 25, minTriangles: 0, distance: 35, screenSize: 0.25 },
        { keep: 10, minTriangles: 0, distance: 70, screenSize: 0.1 },
      ],
      lockBorder: true,
      error: 0.02,
      grouping: 'separate', // 'separate' | 'grouped'
      collision: false,
      collisionTriangles: 250,
    },
    animation: {
      resample: true,
      tolerance: 0.0001,
      removeAnimations: false,
    },
    advanced: {
      scale: 1,
      sourceUp: 'y', // 'y' | 'z'
      origin: 'preserve', // 'preserve' | 'center' | 'below'
      removeEmptyNodes: true,
      removeUnusedMaterials: true,
      keepExtras: true,
      keepCameras: true,
      keepLights: true,
      mergeMeshes: false,
      instance: false,
    },
    budgets: {
      enabled: false,
      onExceed: 'review', // 'review' | 'optimise'
      minTextureSize: 256,
      limits: {
        fileMB: { warn: 10, fail: 25 },
        triangles: { warn: 50000, fail: 150000 },
        textureSize: { warn: 2048, fail: 4096 },
        gpuMB: { warn: 64, fail: 128 },
        materials: { warn: 8, fail: 16 },
        meshes: { warn: 32, fail: 128 },
        animationKB: { warn: 2048, fail: 8192 },
      },
      batch: { fileMB: 0, triangles: 0 }, // 0 = no batch limit
    },
    export: {
      compression: 'none', // 'none' | 'meshopt'
      suffix: '_optimized',
      lodSuffix: '_LOD{i}',
      folders: 'mirror', // 'mirror' | 'flat' | 'per-asset'
      manifest: true,
      reportJson: true,
      reportHtml: true,
      csv: true,
      thumbnails: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Optimisation modes — applied on top of the engine preset.
// ---------------------------------------------------------------------------

export const MODES = {
  quick: {
    label: 'Quick',
    blurb: 'Fast, conservative: clean-up, light texture caps, no simplification.',
    apply(s) {
      s.geometry.simplify = false;
      s.geometry.reorder = true;
      s.animation.resample = true;
      for (const r of Object.values(s.textures.roles)) r.maxSize = r.maxSize ? Math.max(r.maxSize, 2048) : 0;
      setStage(s, 'lods', false);
    },
  },
  balanced: {
    label: 'Balanced',
    blurb: 'Sensible defaults for general game development.',
    apply(s) {
      s.geometry.simplify = true;
      s.geometry.keepPercent = 60;
      s.geometry.error = 0.01;
      s.geometry.lockBorder = true;
    },
  },
  maximum: {
    label: 'Maximum',
    blurb: 'Aggressive reductions with stricter validation. Check the preview: visible degradation is possible.',
    destructive: true,
    apply(s) {
      s.geometry.simplify = true;
      s.geometry.keepPercent = 30;
      s.geometry.error = 0.03;
      s.geometry.lockBorder = false;
      s.geometry.joinPrimitives = true;
      s.textures.lossyDataMaps = false;
      for (const [id, r] of Object.entries(s.textures.roles)) {
        r.maxSize = id === 'baseColor' || id === 'normal' || id === 'alpha' ? 1024 : 512;
      }
      s.budgets.enabled = true;
    },
  },
};

// ---------------------------------------------------------------------------
// Engine / platform presets — starting points only, every value stays editable.
// ---------------------------------------------------------------------------

export const ENGINE_PRESETS = {
  unity: {
    label: 'Unity',
    note: 'Exports standards-compliant GLB for glTFast / UnityGLTF import. Unity compresses textures itself on import, so source formats are kept.',
    apply(s) {
      s.export.compression = 'none';
      formats(s, 'keep');
      caps(s, 2048, 1024);
      s.textures.powerOfTwo = true;
    },
  },
  unreal: {
    label: 'Unreal Engine',
    note: 'Exports GLB for Unreal’s glTF importer. Unreal does not read Meshopt or KTX2, so neither is used.',
    apply(s) {
      s.export.compression = 'none';
      formats(s, 'keep');
      caps(s, 4096, 2048);
      s.textures.powerOfTwo = true;
    },
  },
  godot: {
    label: 'Godot',
    note: 'Godot 4 imports GLB natively and re-compresses textures on import (VRAM compression).',
    apply(s) {
      s.export.compression = 'none';
      formats(s, 'keep');
      caps(s, 2048, 1024);
    },
  },
  threejs: {
    label: 'Three.js / WebGL',
    note: 'Meshopt geometry and WebP colour textures: needs MeshoptDecoder on the GLTFLoader.',
    apply(s) {
      s.export.compression = 'meshopt';
      formats(s, 'keep');
      s.textures.roles.baseColor.format = 'webp';
      s.textures.roles.emissive.format = 'webp';
      s.textures.roles.alpha.format = 'webp';
      caps(s, 2048, 1024);
    },
  },
  mobile: {
    label: 'Mobile games',
    note: 'Conservative memory and geometry budgets for mid-range phones. Adjust to your device floor.',
    apply(s) {
      s.export.compression = 'none';
      formats(s, 'keep');
      caps(s, 1024, 512);
      s.textures.powerOfTwo = true;
      s.geometry.keepPercent = Math.min(s.geometry.keepPercent, 50);
      budgets(s, { fileMB: [4, 8], triangles: [15000, 30000], textureSize: [1024, 2048], gpuMB: [16, 32], materials: [3, 6], meshes: [8, 24] });
      setStage(s, 'lods', true);
    },
  },
  web: {
    label: 'Web 3D apps',
    note: 'Small downloads first: Meshopt + WebP, modest texture caps.',
    apply(s) {
      s.export.compression = 'meshopt';
      formats(s, 'keep');
      s.textures.roles.baseColor.format = 'webp';
      s.textures.roles.emissive.format = 'webp';
      s.textures.roles.alpha.format = 'webp';
      caps(s, 1024, 1024);
      budgets(s, { fileMB: [5, 10], triangles: [100000, 250000], textureSize: [2048, 4096], gpuMB: [64, 128], materials: [12, 24], meshes: [40, 120] });
    },
  },
  vr: {
    label: 'VR applications',
    note: 'Standalone-headset budgets (every frame is drawn twice). LODs on.',
    apply(s) {
      s.export.compression = 'none';
      formats(s, 'keep');
      caps(s, 2048, 1024);
      s.textures.powerOfTwo = true;
      budgets(s, { fileMB: [8, 20], triangles: [30000, 75000], textureSize: [2048, 4096], gpuMB: [32, 64], materials: [4, 8], meshes: [12, 32] });
      setStage(s, 'lods', true);
    },
  },
  custom: {
    label: 'Custom',
    note: 'Nothing changed: start from the current values.',
    apply() {},
  },
};

function formats(s, format) {
  for (const r of Object.values(s.textures.roles)) r.format = format;
}
function caps(s, colour, data) {
  for (const [id, r] of Object.entries(s.textures.roles)) {
    r.maxSize = TEXTURE_ROLES.find((t) => t.id === id).colour || id === 'normal' ? colour : data;
  }
}
function budgets(s, table) {
  s.budgets.enabled = true;
  for (const [k, [warn, fail]] of Object.entries(table)) s.budgets.limits[k] = { warn, fail };
}
function setStage(s, id, enabled) {
  const st = s.stages.find((x) => x.id === id);
  if (st) st.enabled = enabled;
}

// ---------------------------------------------------------------------------
// Built-in reusable profiles.
// ---------------------------------------------------------------------------

export const BUILTIN_PROFILES = [
  {
    id: 'mobile-low-memory',
    name: 'Mobile Low Memory',
    build: () => compose('mobile', 'balanced', (s) => {
      caps(s, 512, 256);
      s.geometry.keepPercent = 40;
      s.budgets.limits.gpuMB = { warn: 8, fail: 16 };
    }),
  },
  {
    id: 'mobile-high-quality',
    name: 'Mobile High Quality',
    build: () => compose('mobile', 'balanced', (s) => {
      caps(s, 2048, 1024);
      s.geometry.keepPercent = 70;
    }),
  },
  {
    id: 'web-lightweight',
    name: 'Web Lightweight',
    build: () => compose('web', 'balanced', (s) => {
      caps(s, 1024, 512);
      s.geometry.keepPercent = 50;
    }),
  },
  {
    id: 'desktop-high-quality',
    name: 'Desktop High Quality',
    build: () => compose('unreal', 'quick', (s) => {
      s.geometry.simplify = false;
      caps(s, 4096, 2048);
    }),
  },
  {
    id: 'vr-conservative',
    name: 'VR Conservative',
    build: () => compose('vr', 'balanced', (s) => {
      s.geometry.keepPercent = 70;
      s.geometry.lockBorder = true;
    }),
  },
  {
    id: 'animated-characters',
    name: 'Animated Characters',
    build: () => compose('unity', 'balanced', (s) => {
      // Deforming meshes are never simplified unless explicitly allowed.
      s.geometry.allowDeforming = false;
      s.geometry.joinPrimitives = false;
      s.advanced.mergeMeshes = false;
      s.advanced.instance = false;
      s.advanced.origin = 'preserve';
      s.animation.resample = true;
      s.animation.removeAnimations = false;
      setStage(s, 'lods', false);
    }),
  },
  {
    id: 'static-props',
    name: 'Static Environment Props',
    build: () => compose('unity', 'balanced', (s) => {
      s.geometry.joinPrimitives = true;
      s.advanced.origin = 'below';
      setStage(s, 'lods', true);
      s.lods.collision = true;
    }),
  },
  {
    id: 'custom-studio',
    name: 'Custom Studio Profile',
    build: () => compose('custom', 'balanced'),
  },
];

/** Default settings → engine preset → mode → optional tweak. */
export function compose(engineId, modeId, tweak) {
  const s = defaultSettings();
  applyEngine(s, engineId);
  applyMode(s, modeId);
  tweak?.(s);
  return s;
}

export function applyEngine(s, engineId) {
  const preset = ENGINE_PRESETS[engineId];
  if (!preset) return s;
  s.engine = engineId;
  preset.apply(s);
  return s;
}

export function applyMode(s, modeId) {
  const mode = MODES[modeId];
  if (!mode) return s;
  s.mode = modeId;
  mode.apply(s);
  return s;
}

// ---------------------------------------------------------------------------
// Normalisation — every settings object (including imported profile files)
// passes through here, so the engine never sees out-of-range values.
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  for (const [k, v] of Object.entries(patch)) {
    if (Array.isArray(v)) base[k] = structuredClone(v);
    else if (v && typeof v === 'object' && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) deepMerge(base[k], v);
    else if (k in base) base[k] = v;
  }
  return base;
}

export function normaliseSettings(input) {
  const s = deepMerge(defaultSettings(), structuredClone(input || {}));
  const d = defaultSettings();

  // Stages: keep known ids, add any missing ones, pin inspect first and export last.
  const known = new Set(d.stages.map((x) => x.id));
  const seen = new Set();
  let stages = (Array.isArray(s.stages) ? s.stages : d.stages)
    .filter((x) => x && known.has(x.id) && !seen.has(x.id) && seen.add(x.id))
    .map((x) => ({ id: x.id, enabled: x.enabled !== false }));
  for (const st of d.stages) if (!seen.has(st.id)) stages.splice(stages.length - 1, 0, { ...st });
  stages = [...stages.filter((x) => x.id === 'inspect'), ...stages.filter((x) => x.id !== 'inspect' && x.id !== 'export'), ...stages.filter((x) => x.id === 'export')];
  stages[0].enabled = true;
  s.stages = stages;

  const g = s.geometry;
  g.targetMode = oneOf(g.targetMode, ['percent', 'triangles'], 'percent');
  g.keepPercent = clamp(g.keepPercent, 1, 100, 60);
  g.targetTriangles = Math.round(clamp(g.targetTriangles, 1, 1e9, 20000));
  g.minTriangles = Math.round(clamp(g.minTriangles, 0, 1e9, 0));
  g.maxTriangles = Math.round(clamp(g.maxTriangles, 0, 1e9, 0));
  g.scope = oneOf(g.scope, ['model', 'mesh'], 'model');
  g.error = clamp(g.error, 0.0001, 1, 0.01);

  const t = s.textures;
  for (const r of TEXTURE_ROLES) {
    const v = t.roles[r.id] || d.textures.roles[r.id];
    t.roles[r.id] = {
      maxSize: Math.round(clamp(v.maxSize, 0, 16384, 0)),
      format: oneOf(v.format, TEXTURE_FORMATS.map((f) => f.id), 'keep'),
      quality: Math.round(clamp(v.quality, 1, 100, 85)),
    };
  }
  t.output = oneOf(t.output, ['embedded', 'separate'], 'embedded');
  t.ktx2.mode = oneOf(t.ktx2.mode, ['auto', 'etc1s', 'uastc'], 'auto');
  t.ktx2.quality = Math.round(clamp(t.ktx2.quality, 1, 255, 128));

  const l = s.lods;
  l.levels = (Array.isArray(l.levels) && l.levels.length ? l.levels : d.lods.levels).slice(0, 6).map((lv, i) => ({
    keep: clamp(lv.keep, 1, 100, i === 0 ? 100 : 50),
    minTriangles: Math.round(clamp(lv.minTriangles, 0, 1e9, 0)),
    distance: clamp(lv.distance, 0, 1e6, 0),
    screenSize: clamp(lv.screenSize, 0, 1, 1),
  }));
  l.error = clamp(l.error, 0.0001, 1, 0.02);
  l.grouping = oneOf(l.grouping, ['separate', 'grouped'], 'separate');
  l.collisionTriangles = Math.round(clamp(l.collisionTriangles, 12, 100000, 250));

  s.animation.tolerance = clamp(s.animation.tolerance, 0, 0.1, 0.0001);

  const a = s.advanced;
  a.scale = clamp(a.scale, 0.000001, 1e6, 1);
  a.sourceUp = oneOf(a.sourceUp, ['y', 'z'], 'y');
  a.origin = oneOf(a.origin, ['preserve', 'center', 'below'], 'preserve');

  s.budgets.onExceed = oneOf(s.budgets.onExceed, ['review', 'optimise'], 'review');
  s.budgets.minTextureSize = Math.round(clamp(s.budgets.minTextureSize, 16, 4096, 256));

  const e = s.export;
  e.compression = oneOf(e.compression, ['none', 'meshopt'], 'none');
  e.folders = oneOf(e.folders, ['mirror', 'flat', 'per-asset'], 'mirror');
  e.suffix = safeSuffix(e.suffix, '_optimized');
  e.lodSuffix = safeSuffix(e.lodSuffix, '_LOD{i}');
  if (!e.lodSuffix.includes('{i}')) e.lodSuffix += '{i}';
  return s;
}

function safeSuffix(v, fallback) {
  const clean = String(v ?? '').replace(/[^\w.{}-]/g, '').slice(0, 40);
  return clean || fallback;
}

/** A profile file as exported/imported by the UI. */
export function profileFile(name, settings) {
  return { type: 'assetbench-pipeline-profile', version: SETTINGS_VERSION, name, settings: normaliseSettings(settings) };
}

export function parseProfileFile(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.type !== 'assetbench-pipeline-profile' || !data.settings) {
    throw new Error('This is not an AssetBench pipeline profile file.');
  }
  return { name: String(data.name || 'Imported profile').slice(0, 60), settings: normaliseSettings(data.settings) };
}

export function stageEnabled(settings, id) {
  return Boolean(settings.stages.find((s) => s.id === id)?.enabled);
}
