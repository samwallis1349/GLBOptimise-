/**
 * The extension's tools, run locally on the same engines as the Cloud
 * API (worker/api), so results match /api/v1 exactly. DOM-free: bundled into
 * the panel's Web Worker by build.mjs and imported directly by the tests.
 */
import { analyseGlb, evaluate, readDocument, writeDocument } from '../../../worker/api/glb.js';
import { deviceMatrix } from '../../../worker/api/gameReady.js';
import { downscaleTextures, optimizeGlb, reduceGlb } from '../../../worker/api/mesh.js';
import { texturesToKtx2 } from '../../../worker/api/ktx2.js';

export const MAX_INPUT_BYTES = 200 * 1048576;

const stem = (name) => String(name || 'model').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'model';

function assertGlb(bytes) {
  const glb = bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
  if (!glb) throw new Error('That is not a binary glTF (.glb) file.');
  if (bytes.length > MAX_INPUT_BYTES) throw new Error('Models up to 200 MB only.');
}

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
};

export const TOOL_IDS = Object.keys(RUNNERS);

export async function runTool(tool, bytes, params = {}, name = 'model.glb') {
  const run = RUNNERS[tool];
  if (!run) throw new Error(`Unknown tool '${tool}'.`);
  assertGlb(bytes);
  return run(bytes, params, name);
}
