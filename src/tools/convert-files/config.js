/**
 * Convert Files (Model Forge) — which formats can be opened and written.
 * Opening goes through three.js loaders; writing through three.js
 * exporters plus a small OBJ/MTL writer (processing/exportModel.js).
 */
export const CONVERT_FILES_CONFIG = {
  // First match wins when several model files are dropped together.
  mainOrder: ['glb', 'gltf', 'fbx', 'dae', 'obj', '3mf', '3ds', 'ply', 'stl'],
  accept: '.glb,.gltf,.fbx,.obj,.mtl,.dae,.stl,.ply,.3mf,.3ds,.zip,.bin,.png,.jpg,.jpeg,.tga,.webp,.bmp,.gif',
  maxTextureSize: 4096,
};

export const TARGET_FORMATS = [
  { id: 'glb', label: 'GLB', ext: '.glb', note: 'One file with textures and animation. Godot, Unity, Unreal, Blender, web.' },
  { id: 'gltf', label: 'glTF', ext: '.gltf', note: 'Readable JSON version of GLB, data embedded.' },
  { id: 'obj', label: 'OBJ', ext: '.obj + .mtl', note: 'Static mesh with materials and PNG textures.' },
  { id: 'stl', label: 'STL', ext: '.stl', note: 'Shape only, binary. 3D printing and slicers.' },
  { id: 'ply', label: 'PLY', ext: '.ply', note: 'Mesh with vertex colours and UVs.' },
  { id: 'usdz', label: 'USDZ', ext: '.usdz', note: 'Apple AR Quick Look and Reality Composer.' },
];

// [format, open, save, keeps, typical use]
export const FORMAT_MATRIX = [
  ['.glb / .gltf', true, true, 'Meshes, PBR materials, textures, skeletons, animation', 'Godot, Blender, Unity and Unreal importers, web and three.js'],
  ['.fbx', true, false, 'Meshes, materials, skeletons, animation', 'Unity, Unreal, Roblox, Maya, 3ds Max asset packs'],
  ['.obj + .mtl', true, true, 'Meshes, basic materials, textures', 'Universal static props, sculpting and retopology tools'],
  ['.dae', true, false, 'Meshes, materials, skeletons, animation', 'Older SketchUp and SDK exports'],
  ['.stl', true, true, 'Triangles only', '3D printing, slicers'],
  ['.ply', true, true, 'Vertices, colours, UVs', 'Photogrammetry and scans'],
  ['.3mf', true, false, 'Meshes, colours', 'Modern 3D printing'],
  ['.3ds', true, false, 'Meshes, materials, textures', 'Legacy 3ds Max assets'],
  ['.usdz', false, true, 'Meshes, PBR materials, textures', 'iPhone and iPad AR'],
];
