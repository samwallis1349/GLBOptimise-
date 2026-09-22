import { readGlb } from './glb/createIO.js';
import { loadGlbForPreview } from './viewer/loadModel.js';
import { analyseTextures } from './CompressTexturesAnalysis.js';

/**
 * Proves the written GLB is genuinely loadable before the tool claims success.
 *
 * Two independent readers are used on purpose: glTF-Transform (structure,
 * texture payloads, material wiring) and Three.js (a real renderer actually
 * decoding and uploading every texture, including transcoding KTX2). A file
 * that satisfies only one of those is not a file worth shipping.
 */
export async function validateCompression({ outputBuffer, originalStats, filename }) {
  const checks = [];
  const pass = (message) => checks.push({ status: 'PASS', message });
  const warn = (message) => checks.push({ status: 'WARNING', message });
  const fail = (message) => checks.push({ status: 'FAIL', message });

  let stats = null;

  // ---- 1. Structural re-read -------------------------------------------
  let doc;
  try {
    doc = await readGlb(outputBuffer);
    pass('Output re-opens as a valid GLB.');
  } catch (err) {
    fail(`The output could not be re-opened: ${err?.message || 'unknown error'}.`);
    return { status: 'FAIL', checks, stats: null };
  }

  const root = doc.getRoot();
  stats = analyseTextures(doc);

  // ---- 2. Nothing went missing -----------------------------------------
  if (stats.textureCount === originalStats.textureCount) {
    pass(`All ${stats.textureCount} texture${stats.textureCount === 1 ? '' : 's'} still present.`);
  } else {
    fail(`Texture count changed from ${originalStats.textureCount} to ${stats.textureCount}.`);
  }

  if (stats.materialCount === originalStats.materialCount) {
    pass(`All ${stats.materialCount} material${stats.materialCount === 1 ? '' : 's'} still present.`);
  } else {
    fail(`Material count changed from ${originalStats.materialCount} to ${stats.materialCount}.`);
  }

  // ---- 3. Every texture still has real image data -----------------------
  const empty = stats.items.filter((t) => t.bytes === 0);
  if (empty.length) {
    fail(`${empty.length} texture(s) have no image data: ${empty.map((t) => t.name).join(', ')}.`);
  } else {
    pass('Every texture carries image data.');
  }

  const unreadable = stats.items.filter((t) => !t.width || !t.height);
  if (unreadable.length) {
    warn(`${unreadable.length} texture(s) have dimensions that could not be read back: ${unreadable.map((t) => t.name).join(', ')}.`);
  } else {
    pass('Every texture reports valid dimensions.');
  }

  // ---- 4. Material slot wiring survived ---------------------------------
  const beforeSlots = new Map(originalStats.items.map((t) => [t.name, [...t.slots].sort().join(',')]));
  const changedSlots = stats.items.filter(
    (t) => beforeSlots.has(t.name) && beforeSlots.get(t.name) !== [...t.slots].sort().join(',')
  );
  if (changedSlots.length) {
    fail(`Material slot wiring changed for: ${changedSlots.map((t) => t.name).join(', ')}.`);
  } else {
    pass('Every texture is still bound to the same material slots.');
  }

  // ---- 5. KTX2 declared properly ----------------------------------------
  const ktx2Textures = stats.items.filter((t) => t.mime === 'image/ktx2');
  if (ktx2Textures.length) {
    const declared = root
      .listExtensionsUsed()
      .some((e) => e.extensionName === 'KHR_texture_basisu');
    if (declared) {
      pass(`${ktx2Textures.length} KTX2 texture(s) with KHR_texture_basisu declared.`);
    } else {
      fail('KTX2 textures were written but KHR_texture_basisu is not declared, so loaders will reject the file.');
    }
  }

  // ---- 6. A real renderer loads it --------------------------------------
  try {
    const scene = await loadGlbForPreview(outputBuffer);
    let meshCount = 0;
    let mapCount = 0;
    let compressedCount = 0;
    const brokenMaps = [];

    scene.traverse((object) => {
      if (!object.isMesh) return;
      meshCount += 1;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
          const texture = material[key];
          if (!texture) continue;
          mapCount += 1;
          if (texture.isCompressedTexture) compressedCount += 1;
          const width = texture.image?.width || texture.mipmaps?.[0]?.width;
          if (!width) brokenMaps.push(`${material.name || 'material'}.${key}`);
        }
      }
    });

    if (meshCount === 0) {
      fail('Three.js loaded the file but found no meshes.');
    } else if (brokenMaps.length) {
      fail(`Three.js could not decode: ${brokenMaps.join(', ')}.`);
    } else {
      pass(
        `Three.js loaded ${meshCount} mesh(es) and decoded ${mapCount} texture binding(s)` +
          (compressedCount ? `, ${compressedCount} as GPU-compressed.` : '.')
      );
    }
  } catch (err) {
    fail(`Three.js could not load the output: ${err?.message || 'unknown error'}.`);
  }

  // ---- 7. Did anything actually change? ---------------------------------
  if (stats.totalBytes >= originalStats.totalBytes) {
    warn(
      `Texture payload did not get smaller (${Math.round(originalStats.totalBytes / 1024)}KB to ${Math.round(stats.totalBytes / 1024)}KB). Nothing was gained on file size.`
    );
  } else {
    pass(
      `Texture payload reduced from ${Math.round(originalStats.totalBytes / 1024)}KB to ${Math.round(stats.totalBytes / 1024)}KB.`
    );
  }

  const status = checks.some((c) => c.status === 'FAIL')
    ? 'FAIL'
    : checks.some((c) => c.status === 'WARNING')
      ? 'WARNING'
      : 'PASS';

  return { status, checks, stats, filename };
}
