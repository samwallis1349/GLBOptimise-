/**
 * GLB Builder & Merger (Asset Arranger) — limits and presets.
 */
export const ARRANGER_CONFIG = {
  maxAssets: 50,
  // Files the library accepts. Model files become assets; the rest (textures,
  // .bin) travel alongside a .gltf/.fbx so relative paths still resolve.
  accept: '.glb,.gltf,.fbx,.bin,.png,.jpg,.jpeg,.webp,.tga',
  modelExtensions: ['glb', 'gltf', 'fbx'],
  textureAccept: 'image/png,image/jpeg,image/webp',
  thumbnailSize: 192,
  planeSizes: [10, 25, 50, 100],
  defaultPlaneSize: 25,
  // One ground texture tile covers this many metres, at every plane size.
  groundTileMetres: 2,
  defaultGap: 0.5,
  historyLimit: 100,
  maxExportTextureSize: 4096,
};

export const GROUND_TEXTURES = [
  { id: 'none', label: 'None / Grid Only' },
  { id: 'dust', label: 'Dust' },
  { id: 'sand', label: 'Sand' },
  { id: 'cracked', label: 'Cracked Earth' },
  { id: 'grass', label: 'Dry Grass' },
  { id: 'dirt', label: 'Dirt' },
  { id: 'gravel', label: 'Gravel' },
  { id: 'concrete', label: 'Concrete' },
  { id: 'asphalt', label: 'Asphalt' },
  { id: 'custom', label: 'Custom Uploaded Texture' },
];

export const EXPORT_FORMATS = [
  { id: 'glb', label: 'GLB', enabled: true },
  { id: 'gltf', label: 'glTF', enabled: true, note: 'Zipped .gltf with embedded data' },
  { id: 'obj', label: 'OBJ', enabled: true, note: 'Static mesh + MTL, no animation' },
  { id: 'fbx', label: 'FBX', enabled: false, note: 'FBX export is not available in the browser yet' },
];

export const SNAP_OPTIONS = {
  move: [0, 0.1, 0.25, 0.5, 1],
  rotate: [0, 5, 15, 45, 90],
};
