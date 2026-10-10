import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { documentFeatures, safeSize } from './inspect.js';

/**
 * Post-export validation. Every output is re-opened from its written bytes
 * (never trusted because the write succeeded) and compared against the
 * input's features. Lost protected content is a FAIL: the asset is held
 * back from the download and flagged for review.
 */

const SUPPORTED = new Set(ALL_EXTENSIONS.map((E) => E.EXTENSION_NAME));
const DURATION_TOLERANCE = 0.05;

/**
 * @param {Uint8Array} bytes
 * @param {object} ctx
 * @param {import('@gltf-transform/core').PlatformIO} ctx.io
 * @param {object} ctx.input           documentFeatures() of the source
 * @param {object} ctx.settings
 * @param {'main'|'lod'|'collision'} [ctx.kind]
 * @param {{ transformed: boolean }} [ctx.expect]
 */
export async function validateOutput(bytes, { io, input, settings, kind = 'main', expect = {} }) {
  const checks = [];
  const add = (status, name, message) => checks.push({ status, name, message });

  let document;
  try {
    document = await io.readBinary(bytes);
    add('pass', 'parse', `Re-opened ${bytes.byteLength.toLocaleString('en-GB')} bytes as valid glTF 2.0.`);
  } catch (err) {
    add('fail', 'parse', `The output could not be re-opened: ${err?.message || 'unknown error'}.`);
    return { status: 'fail', checks, features: null };
  }
  const out = documentFeatures(document);

  const unsupported = out.extensionsRequired.filter((e) => !SUPPORTED.has(e));
  if (unsupported.length) add('fail', 'extensions', `Requires unknown extension(s): ${unsupported.join(', ')}.`);
  else if (out.extensionsRequired.length) add('info', 'extensions', `Requires ${out.extensionsRequired.join(', ')}: the loading engine must support ${out.extensionsRequired.length > 1 ? 'these' : 'this'}.`);

  if (!out.scenes) add('fail', 'scene', 'The output has no scene.');
  if (input.meshes && !out.meshes) add('fail', 'meshes', 'Every mesh was lost.');
  else if (input.triangles && !out.triangles) add('fail', 'geometry', 'The output has no triangles left.');
  else add('pass', 'geometry', `${out.meshes} mesh(es), ${out.triangles.toLocaleString('en-GB')} triangles.`);

  if (out.outOfRangeIndices) add('fail', 'indices', `${out.outOfRangeIndices} primitive(s) reference vertices that do not exist.`);
  else add('pass', 'indices', 'All index buffers reference existing vertices.');

  if (kind === 'collision') return finish(checks, out);

  // Protected features.
  const wantAnims = !settings.animation.removeAnimations;
  if (wantAnims && input.animations.length) {
    if (out.animations.length !== input.animations.length) {
      add('fail', 'animations', `Animation clips changed: ${input.animations.length} → ${out.animations.length}.`);
    } else {
      const renamed = input.animations.filter((a, i) => a.name !== out.animations[i].name);
      const drift = input.animations.filter((a, i) => Math.abs(a.duration - out.animations[i].duration) > DURATION_TOLERANCE);
      if (renamed.length) add('fail', 'animations', `Animation names changed: ${renamed.map((a) => a.name || '(unnamed)').join(', ')}.`);
      else if (drift.length) add('warn', 'animations', `${drift.length} clip duration(s) shifted by more than ${DURATION_TOLERANCE}s.`);
      else add('pass', 'animations', `${out.animations.length} clip(s) preserved with names and durations.`);
    }
  }
  if (input.skins) {
    if (out.skins !== input.skins || out.joints !== input.joints) add('fail', 'skinning', `Skins/joints changed: ${input.skins}/${input.joints} → ${out.skins}/${out.joints}.`);
    else add('pass', 'skinning', `${out.skins} skin(s), ${out.joints} joint(s) preserved.`);
  }
  if (input.morphTargets) {
    if (out.morphTargets < input.morphTargets) add('fail', 'morph-targets', `Morph targets lost: ${input.morphTargets} → ${out.morphTargets}.`);
    else add('pass', 'morph-targets', `${out.morphTargets} morph target(s) preserved.`);
  }
  if (input.transparentMaterials && out.transparentMaterials < input.transparentMaterials && !(input.materials > out.materials)) {
    add('fail', 'transparency', `Transparent materials dropped: ${input.transparentMaterials} → ${out.transparentMaterials}.`);
  } else if (input.transparentMaterials) add('pass', 'transparency', 'Alpha modes preserved.');
  if (input.materials && !out.materials) add('fail', 'materials', 'Every material was lost.');
  if (settings.advanced.keepCameras && input.cameras && out.cameras < input.cameras) add('fail', 'cameras', `Cameras lost: ${input.cameras} → ${out.cameras}.`);
  if (settings.advanced.keepLights && input.lights && out.lights < input.lights) add('fail', 'lights', `Lights lost: ${input.lights} → ${out.lights}.`);

  const tex = document.getRoot().listTextures();
  const unreadable = tex.filter((t) => !safeSize(t));
  if (unreadable.length) add('warn', 'textures', `${unreadable.length} texture(s) have no readable dimensions.`);
  else if (tex.length) add('pass', 'textures', `${tex.length} texture(s) decode headers with valid dimensions.`);

  if (!settings.advanced.mergeMeshes && kind === 'main') {
    const lost = input.meshNames.filter((n) => n && !out.meshNames.includes(n));
    if (lost.length) add('warn', 'names', `${lost.length} mesh name(s) changed or merged (${lost.slice(0, 4).join(', ')}${lost.length > 4 ? '…' : ''}).`);
  }

  // Shape check: unless a deliberate transform was applied, the bounds must not move.
  if (!expect.transformed && input.bounds && out.bounds) {
    const diag = (b) => Math.hypot(...b.size);
    const change = Math.abs(diag(out.bounds) - diag(input.bounds)) / Math.max(1e-9, diag(input.bounds));
    const limit = kind === 'lod' ? 0.25 : 0.1;
    if (change > limit) add('warn', 'bounds', `Overall size changed by ${(change * 100).toFixed(1)}%: simplification may have eroded the silhouette.`);
    else add('pass', 'bounds', `Bounds within ${(change * 100).toFixed(1)}% of the source.`);
  }

  return finish(checks, out);
}

function finish(checks, features) {
  const status = checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'pass';
  return { status, checks, features };
}
