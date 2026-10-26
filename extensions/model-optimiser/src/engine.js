/**
 * The extension's tools, run locally on the same engines as the Cloud
 * API (worker/api), so results match /api/v1 exactly. DOM-free: bundled into
 * the panel's Web Worker by build.mjs and imported directly by the tests.
 */
import { analyseGlb, evaluate, readDocument, registerDracoDecoder, splitGlb, writeDocument } from '../../../worker/api/glb.js';
import { getDracoDecoder } from '../../../worker/api/draco.js';
import { deviceMatrix } from '../../../worker/api/gameReady.js';
import { downscaleTextures, optimizeGlb, reduceGlb } from '../../../worker/api/mesh.js';
import { texturesToKtx2 } from '../../../worker/api/ktx2.js';
import { analyseAsset } from '../../../src/shared/glb/analyseGLB.js';
import { analyseRig, buildRigChecks } from '../../../src/tools/rig-inspector/RigAnalysis.js';
import { analyseAnimations, buildAnimationChecks } from '../../../src/tools/animation-inspector/AnimationAnalysis.js';
import { compareAnalyses } from '../../../src/tools/asset-compare/compare/diff.js';
import { fmtValue } from '../../../src/tools/asset-compare/compare/format.js';
import { MAX_INPUT_BYTES, modelToGlb, stem } from './inputs.js';
import { IMAGE_TOOLS, PANEL_TOOLS } from './kinds.js';
import { EXTRA_RUNNERS } from './runners.js';

export { MAX_INPUT_BYTES };

// Draco-compressed GLBs: the API's decoder, its .wasm supplied by the worker (or the tests).
registerDracoDecoder(getDracoDecoder);

/** The site's Inspect GLB analysis, read with the API's reader (the site's needs eval, which extensions forbid). */
const analyse = (bytes, name) => analyseAsset(
  { name, kind: 'glb', main: new File([bytes], name), siblings: [] },
  { readGlb: (buffer) => readDocument(new Uint8Array(buffer)) },
);

/** Each tool returns { report, output?, name? }; output is a GLB to download. */
const RUNNERS = {
  async check(bytes, { role = 'prop', engine = 'unity' }) {
    const stats = analyseGlb(bytes);
    return { report: { stats, devices: deviceMatrix(stats, role, engine), web: evaluate(stats, 'web') } };
  },

  async reduce(bytes, { keep = 0.5, acrossSeams = false }, name) {
    const { output, report } = await reduceGlb(bytes, { ratio: String(keep), acrossSeams: String(acrossSeams) });
    return { output, report, name: `${stem(name)}-reduced.glb` };
  },

  async optimise(bytes, { target = 'prop' }, name) {
    const { output, report } = await optimizeGlb(bytes, { target });
    return { output, report, name: `${stem(name)}-optimised.glb` };
  },

  async compress(bytes, { maxSize = 0 }, name) {
    const document = await readDocument(bytes);
    const warnings = [];
    const textures = await texturesToKtx2(document, { mode: 'auto', maxSize: Number(maxSize) || 0, warnings });
    if (!textures.length) warnings.push('This model has no PNG or JPEG textures to compress.');
    const output = await writeDocument(document);
    return { output, report: { textures, bytesBefore: bytes.byteLength, bytesAfter: output.byteLength, warnings }, name: `${stem(name)}-ktx2.glb` };
  },

  /** Every texture with its size, format and GPU memory: the texture editions' free check. */
  async textures(bytes) {
    const stats = analyseGlb(bytes);
    return { report: { textures: stats.textures, textureMemoryBytes: stats.textureMemoryBytes, fileBytes: stats.fileBytes } };
  },

  async resize(bytes, { maxSize = 1024 }, name) {
    const document = await readDocument(bytes);
    const warnings = [];
    const textures = await downscaleTextures(document, Number(maxSize) || 1024, warnings);
    if (!textures.length && !warnings.length) warnings.push(`Every texture is already ${maxSize} px or smaller.`);
    const output = await writeDocument(document);
    const memory = (glb) => analyseGlb(glb).textureMemoryBytes;
    return {
      output,
      report: { textures, bytesBefore: bytes.byteLength, bytesAfter: output.byteLength, memoryBefore: memory(bytes), memoryAfter: memory(output), warnings },
      name: `${stem(name)}-${maxSize}px.glb`,
    };
  },

  /** Health score, counts and issues: the inspector edition's free check. */
  async inspect(bytes, _params, name) {
    const a = await analyse(bytes, name);
    return {
      report: {
        health: a.health,
        totals: a.totals,
        fileBytes: a.file.bytes,
        gpuBytes: a.gpu.totalBytes,
        generator: a.file.generator,
        issues: a.issues.map(({ severity, title, detail }) => ({ severity, title, detail })),
      },
    };
  },

  async rig(bytes) {
    const rig = analyseRig(await readDocument(bytes));
    const { items, hasRig } = buildRigChecks(rig);
    return {
      report: {
        hasRig,
        checks: items,
        joints: rig.totalJoints,
        skins: rig.skinCount,
        maxDepth: rig.maxDepth,
        skinnedVertices: rig.skinnedVertexCount,
        roots: rig.skins.map((skin) => skin.rootName),
      },
    };
  },

  async animations(bytes) {
    const anim = analyseAnimations(await readDocument(bytes), bytes);
    const { items, hasAnimation } = buildAnimationChecks(anim);
    return {
      report: {
        hasAnimation,
        checks: items,
        keyframes: anim.totalKeyframes,
        tracks: anim.totalTracks,
        clips: anim.clips.map((c) => ({ name: c.name, duration: c.duration, frameRate: c.frameRate, loops: c.loop?.clean ?? null })),
      },
    };
  },

  /** `params.other` is the second model (B); the dropped model is A. */
  async compare(bytes, { other, otherName = 'model-b.glb' }, name) {
    if (!other) throw new Error('Choose a second model to compare against.');
    const b = (await modelToGlb(new Uint8Array(other), otherName)).bytes;
    const result = compareAnalyses(await analyse(bytes, name), await analyse(b, otherName));
    return {
      report: {
        verdict: result.verdict,
        regressions: result.regressions,
        changes: result.metrics
          .filter((m) => m.status !== 'same')
          .map((m) => ({ label: m.label, a: fmtValue(m.a, m.kind), b: fmtValue(m.b, m.kind), status: m.status })),
      },
    };
  },


  /** Iso sprites run in the panel (WebGL); this hands it a plain GLB three.js can read without Draco. */
  async 'iso-prep'(bytes) {
    const document = await readDocument(bytes);
    for (const ext of document.getRoot().listExtensionsUsed()) if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
    const output = await writeDocument(document);
    return { output, name: 'model.glb', report: { clips: document.getRoot().listAnimations().map((a, i) => a.getName() || `Clip ${i + 1}`), warnings: [] } };
  },

};

export { IMAGE_TOOLS };

const usesDraco = (glb) => {
  try { return (splitGlb(glb).json.extensionsUsed || []).includes('KHR_draco_mesh_compression'); } catch { return false; }
};

/** Every tool an edition can list: the engine's, plus those that run in the panel (PANEL_TOOLS). */
export const TOOL_IDS = [...new Set([...Object.keys(RUNNERS), ...Object.keys(EXTRA_RUNNERS), ...PANEL_TOOLS])];

/**
 * Runs a tool. Model tools accept GLB, glTF, FBX or OBJ (or a ZIP of one):
 * anything but GLB is converted to GLB first and the converter's notes are
 * added to the report's warnings.
 */
export async function runTool(tool, bytes, params = {}, name = 'model.glb') {
  const run = RUNNERS[tool] || EXTRA_RUNNERS[tool];
  if (!run) throw new Error(`Unknown tool '${tool}'.`);
  if (bytes.length > MAX_INPUT_BYTES) throw new Error('Files up to 200 MB only.');
  if (IMAGE_TOOLS.has(tool)) return run(bytes, params, name);
  const model = await modelToGlb(bytes, name);
  const result = await run(model.bytes, { ...params, inputBytes: bytes.byteLength }, name, model.from);
  const notes = [...model.notes];
  // There's no Draco encoder here: a Draco GLB comes back uncompressed (and bigger).
  if (result.output && tool !== 'iso-prep' && /\.glb$/i.test(result.name || '') && usesDraco(model.bytes)) {
    notes.push('The input was Draco-compressed; this copy is not (no Draco encoder runs here), so it may be bigger. Compress it again in your pipeline if you need to.');
  }
  if (notes.length && result.report) result.report.warnings = [...notes, ...(result.report.warnings || [])];
  return result;
}
