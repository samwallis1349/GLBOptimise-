/**
 * FBX in, GLB out: turns dropped .fbx files into .glb Files in the browser,
 * using Convert Files' loader (three.js FBXLoader, with any textures dropped
 * alongside or zipped) and GLTFExporter. Rigs, skin weights and animation
 * clips come across; FBX materials become standard PBR ones. The heavy
 * loaders are imported on first use, so tools pay nothing until an FBX shows up.
 */
export const isFbx = (file) => /\.fbx$/i.test(file?.name || '');
export const isZip = (file) => /\.zip$/i.test(file?.name || '');
const MODEL = /\.(glb|gltf|fbx|obj|dae|3ds|3mf|ply|stl)$/i;

/** True if these files need converting: an .fbx, or a .zip with one inside. */
export async function needsConversion(files) {
  if (files.some(isFbx)) return true;
  for (const zip of files.filter(isZip)) {
    const { unzipSync } = await import('three/examples/jsm/libs/fflate.module.js');
    try {
      const names = Object.keys(unzipSync(new Uint8Array(await zip.arrayBuffer()), { filter: (f) => /\.fbx$/i.test(f.name) }));
      if (names.length) return true;
    } catch {
      /* not a readable zip: leave it for the tool */
    }
  }
  return false;
}

/**
 * Converts every FBX (loose, or one per zip) to a GLB File. Other models in
 * the list pass through untouched; textures that were only there for an FBX
 * are dropped from the result. Resolves { files, converted, notes }.
 */
export async function convertFbxFiles(files) {
  const [{ loadModelFiles, revokeUrls }, { prepareExportRoot }, { GLTFExporter }] = await Promise.all([
    import('../../tools/convert-files/processing/loadModel.js'),
    import('../../tools/convert-files/processing/exportModel.js'),
    import('three/examples/jsm/exporters/GLTFExporter.js'),
  ]);
  const fbxZips = [];
  for (const zip of files.filter(isZip)) if (await needsConversion([zip])) fbxZips.push(zip);
  const loose = files.filter(isFbx);
  const sidecars = files.filter((f) => !MODEL.test(f.name) && !isZip(f));
  const keep = files.filter((f) => MODEL.test(f.name) && !isFbx(f));

  const out = [];
  const notes = [];
  const converted = [];
  for (const group of [...loose.map((f) => [f, ...sidecars]), ...fbxZips.map((z) => [z])]) {
    const source = group[0];
    const loaded = await loadModelFiles(group);
    try {
      const root = prepareExportRoot(loaded.model, loaded.base);
      const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations: loaded.clips, onlyVisible: true, embedImages: true });
      out.push(new File([glb], `${loaded.base}.glb`, { type: 'model/gltf-binary' }));
      converted.push({ from: source.name, to: `${loaded.base}.glb`, clips: loaded.clips.length });
      notes.push(...loaded.notes.map((n) => n.text));
    } finally {
      revokeUrls(loaded.urls);
    }
  }
  // Images only travel with an FBX; tools that take loose GLBs don't want them.
  const rest = loose.length || fbxZips.length ? keep : [...keep, ...sidecars];
  const otherZips = files.filter((f) => isZip(f) && !fbxZips.includes(f));
  return { files: [...out, ...rest, ...otherZips], converted, notes };
}
