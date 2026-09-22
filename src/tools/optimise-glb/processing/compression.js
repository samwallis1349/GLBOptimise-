import { meshopt } from '@gltf-transform/functions';
import { codecStatus } from '../glb/createIO.js';

const DRACO_EXTENSION = 'KHR_draco_mesh_compression';

/**
 * Mesh compression on the way out.
 *
 * Two jobs:
 *
 * 1. If the input was Draco-compressed we must drop that extension before
 *    writing. We can decode Draco in the browser but not encode it (no
 *    browser-safe encoder ships with the decoder), so re-serialising with the
 *    extension still attached would produce a broken file. Disposing the
 *    extension keeps the already-decoded geometry and writes it plainly.
 *
 * 2. Apply Meshopt compression when the preset asks for it. Meshopt has a
 *    real browser encoder, typically lands within a few percent of Draco on
 *    size, and decodes far faster at runtime — a better default for the
 *    game-engine targets this tool is aimed at.
 */
export async function runCompression(document, plan, executed, warnings) {
  const root = document.getRoot();
  const draco = root.listExtensionsUsed().find((e) => e.extensionName === DRACO_EXTENSION);

  if (draco) {
    draco.dispose();
    warnings.push(
      'The input was Draco-compressed. Draco can be decoded in the browser but not re-encoded, so the geometry was written uncompressed' +
        (plan.compression?.method === 'meshopt' ? ' and re-compressed with Meshopt instead.' : '.')
    );
    executed.push('decode Draco');
  }

  if (plan.compression?.method !== 'meshopt') return;

  if (!codecStatus.meshopt) {
    warnings.push('Meshopt compression was requested but the encoder could not be loaded, so the output is uncompressed.');
    return;
  }

  try {
    const { MeshoptEncoder } = await import('meshoptimizer');
    await MeshoptEncoder.ready;
    await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
    executed.push('meshopt compression');
  } catch (err) {
    warnings.push(`Meshopt compression failed (${err?.message || 'unknown error'}); the output is uncompressed.`);
  }
}
