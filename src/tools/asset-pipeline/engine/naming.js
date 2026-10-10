/**
 * Output naming. Predictable and user-configurable:
 *
 *   <dir>/<base><suffix>.glb        e.g. crate_optimized.glb
 *   <dir>/<base><lodSuffix>.glb     e.g. crate_LOD0.glb, crate_LOD1.glb
 *   <dir>/<base>_collision.glb
 *   <dir>/<base>_report.json
 *   <dir>/<base>_thumbnail.png
 *
 * <dir> follows the folder setting: the source's own folder ("mirror"),
 * nothing ("flat") or one folder per asset ("per-asset"). Source files are
 * never written to — every name here is a new path inside the export.
 */
export function baseName(fileName) {
  return String(fileName).split(/[\\/]/).pop().replace(/\.(glb|gltf)$/i, '').replace(/[^\w.-]+/g, '_') || 'asset';
}

export function cleanDir(dir) {
  const parts = String(dir || '')
    .split(/[\\/]+/)
    .filter((p) => p && p !== '.' && p !== '..')
    .map((p) => p.replace(/[^\w .-]+/g, '_'));
  return parts.length ? `${parts.join('/')}/` : '';
}

export function outputNames(source, settings) {
  const base = baseName(source.name);
  const e = settings.export;
  const dir = e.folders === 'flat' ? '' : e.folders === 'per-asset' ? `${cleanDir(source.dir)}${base}/` : cleanDir(source.dir);
  return {
    base,
    dir,
    main: `${dir}${base}${e.suffix}.glb`,
    lod: (i) => `${dir}${base}${e.lodSuffix.replace('{i}', i)}.glb`,
    collision: `${dir}${base}_collision.glb`,
    report: `${dir}${base}_report.json`,
    thumbnail: `${dir}${base}_thumbnail.png`,
    originalsDir: `${dir}${base}_original_textures/`,
    stem: (path) => path.split('/').pop().replace(/\.[^.]+$/, ''),
    dirOf: (path) => path.slice(0, path.lastIndexOf('/') + 1),
  };
}
