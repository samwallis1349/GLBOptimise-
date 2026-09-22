import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Loads a GLB from an in-memory ArrayBuffer using Three.js's own GLTFLoader —
 * deliberately independent of the glTF-Transform read path, since this is also
 * how AssetBench checks that an *exported* file is genuinely loadable by a real
 * renderer (see glb/validate.js).
 *
 * The loader needs the Draco and Meshopt decoders wired up for the same reason
 * the reader does: without them it refuses compressed files, and since our own
 * "Game Ready" and "Tiny" presets emit Meshopt-compressed GLBs, validation
 * would reject every compressed output as broken when it was in fact fine.
 *
 * Decoders are loaded from bundled local assets — no CDN, works offline.
 */
let loaderPromise = null;

async function createLoader() {
  const loader = new GLTFLoader();

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL || '/'}draco/`);
  loader.setDRACOLoader(dracoLoader);

  try {
    const { MeshoptDecoder } = await import('meshoptimizer');
    await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
  } catch (err) {
    console.warn('[AssetBench] Meshopt decoder unavailable for preview/validation.', err);
  }

  return loader;
}

function getLoader() {
  if (!loaderPromise) loaderPromise = createLoader();
  return loaderPromise;
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<import('three').Group>}
 */
export async function loadGlbForPreview(arrayBuffer) {
  const loader = await getLoader();
  return new Promise((resolve, reject) => {
    // parse() needs its own copy since some loader paths detach/transfer buffers.
    const copy = arrayBuffer.slice(0);
    loader.parse(
      copy,
      '',
      (gltf) => resolve(gltf.scene),
      (error) => reject(error instanceof Error ? error : new Error('Failed to parse GLB for preview.'))
    );
  });
}
