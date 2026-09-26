/**
 * Health checks run over an analysis (see analyseGLB.js). Each issue:
 *
 *   { severity: 'error'|'warning'|'info', code, category, title, detail, fix?: { tool, label } }
 *
 * `fix.tool` is an Asset Bench tool id, so every UI can deep-link straight
 * to the tool that resolves the issue. Thresholds are deliberately
 * realtime-oriented (web / mobile / standalone VR) — desktop-only projects
 * can ignore the softer warnings.
 */

const MB = 1024 * 1024;

const FIX = {
  optimise: { tool: 'optimise-glb', label: 'Optimise GLB' },
  reduce: { tool: 'reduce-polys', label: 'Reduce Polys' },
  lods: { tool: 'generate-lods', label: 'Generate LODs' },
  compress: { tool: 'compress-textures', label: 'Compress Textures' },
  resize: { tool: 'texture-resizer', label: 'Texture Resizer' },
  pack: { tool: 'pack-pbr', label: 'Pack PBR' },
  animOpt: { tool: 'animation-optimiser', label: 'Animation Optimiser' },
  strip: { tool: 'strip-animations', label: 'Strip Animations' },
  rig: { tool: 'rig-inspector', label: 'Rig Inspector' },
  convert: { tool: 'convert-files', label: 'Convert Files' },
};

const plural = (n, word, many = `${word}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? word : many}`;

export function runChecks(a) {
  const issues = [];
  const add = (severity, code, category, title, detail, fix) => issues.push({ severity, code, category, title, detail, fix: fix || null });
  const { totals, textures, materials, meshes, animations, skins, bytes, file } = a;
  const raw = new Set(a.extensions.raw);

  // ---------- File & structure ----------
  if (!totals.meshes || !totals.triangles) {
    add('error', 'no-geometry', 'structure', 'No renderable triangles', 'The file contains no triangle geometry, so nothing will appear in an engine.');
  }
  if (file.missingResources.length) {
    add('error', 'missing-resources', 'structure', `Missing ${plural(file.missingResources.length, 'external file')}`, `Referenced but not provided: ${file.missingResources.slice(0, 5).join(', ')}. Pack everything into a single GLB to avoid broken paths.`, FIX.convert);
  }
  if (file.kind === 'gltf') {
    add('info', 'gltf-json', 'structure', 'Stored as .gltf (JSON)', 'A single binary .glb loads faster and can’t lose its sibling files.', FIX.convert);
  }
  if (file.bytes > 50 * MB) add('error', 'file-huge', 'size', 'Very large file', `${fmtMB(file.bytes)} is too heavy for web or mobile delivery.`, FIX.optimise);
  else if (file.bytes > 15 * MB) add('warning', 'file-large', 'size', 'Large file', `${fmtMB(file.bytes)} — most web scenes aim for under 10 MB per asset.`, FIX.optimise);

  // ---------- Geometry ----------
  if (totals.triangles > 500_000) add('error', 'tris-extreme', 'geometry', 'Extreme triangle count', `${plural(totals.triangles, 'triangle')} rendered. Realtime hero assets are usually under 100k.`, FIX.reduce);
  else if (totals.triangles > 100_000) add('warning', 'tris-high', 'geometry', 'High triangle count', `${plural(totals.triangles, 'triangle')} rendered — heavy for mobile and VR.`, FIX.reduce);
  if (totals.triangles > 30_000 && !a.meshes.some((m) => /lod\s*_?\d/i.test(m.name))) {
    add('info', 'no-lods', 'geometry', 'No LOD levels', 'Assets seen at a distance render faster with lower-detail LOD meshes.', FIX.lods);
  }
  const geometryCompressed = raw.has('KHR_draco_mesh_compression') || raw.has('EXT_meshopt_compression');
  if (!geometryCompressed && bytes.geometry > 1 * MB) {
    add('warning', 'geometry-uncompressed', 'size', 'Geometry isn’t compressed', `${fmtMB(bytes.geometry)} of raw vertex data. Meshopt or Draco typically cuts this by 50–90%.`, FIX.optimise);
  }
  if (!raw.has('KHR_mesh_quantization') && !geometryCompressed && bytes.geometry > 256 * 1024) {
    add('info', 'not-quantized', 'size', 'Vertex data not quantized', 'Quantizing positions/normals/UVs to 16-bit shrinks geometry with no visible loss.', FIX.optimise);
  }
  const unindexed = meshes.flatMap((m) => m.primitives).filter((p) => !p.indexed && p.triangleCount > 0);
  if (unindexed.length) add('info', 'unindexed', 'geometry', `${plural(unindexed.length, 'primitive')} without an index buffer`, 'Unindexed triangles duplicate shared vertices; welding and indexing reduces memory.', FIX.optimise);
  const noNormals = meshes.flatMap((m) => m.primitives).filter((p) => p.triangleCount && !p.attributes.some((x) => x.semantic === 'NORMAL'));
  if (noNormals.length) add('warning', 'no-normals', 'geometry', `${plural(noNormals.length, 'primitive')} missing normals`, 'Engines will generate flat normals, which usually looks faceted.');
  const texturedNoUv = meshes.flatMap((m) => m.primitives).filter((p) => {
    const mat = p.material != null ? materials[p.material] : null;
    return mat && Object.keys(mat.textures).length && !p.attributes.some((x) => x.semantic.startsWith('TEXCOORD'));
  });
  if (texturedNoUv.length) add('error', 'textured-no-uv', 'geometry', `${plural(texturedNoUv.length, 'primitive')} textured without UVs`, 'The material has textures but the mesh has no TEXCOORD_0, so textures can’t map correctly.');
  const normalNoTangent = meshes.flatMap((m) => m.primitives).filter((p) => {
    const mat = p.material != null ? materials[p.material] : null;
    return mat?.textures.normal != null && !p.attributes.some((x) => x.semantic === 'TANGENT');
  });
  if (normalNoTangent.length) add('info', 'no-tangents', 'geometry', 'Normal maps without stored tangents', 'Engines will compute MikkTSpace tangents at load. Fine in most cases, but baking tools may differ.');
  if (a.bounds) {
    const maxDim = Math.max(...a.bounds.size);
    if (maxDim > 500) add('warning', 'scale-large', 'geometry', 'Model is very large', `The model spans ${round(maxDim)} units. glTF uses metres, so this may be authored in centimetres.`, FIX.convert);
    else if (maxDim > 0 && maxDim < 0.01) add('warning', 'scale-small', 'geometry', 'Model is very small', `The model spans only ${round(maxDim, 4)} units (metres).`, FIX.convert);
  }

  // ---------- Draw calls & materials ----------
  if (totals.drawCalls > 100) add('warning', 'drawcalls-high', 'performance', 'Many draw calls', `${plural(totals.drawCalls, 'draw call')} per frame for this asset. Merge meshes that share materials.`, FIX.optimise);
  else if (totals.drawCalls > 40) add('info', 'drawcalls-medium', 'performance', 'Moderate draw calls', `${plural(totals.drawCalls, 'draw call')}. Consider merging static parts for mobile.`, FIX.optimise);
  if (materials.length > 16) add('info', 'materials-many', 'performance', 'Lots of materials', `${plural(materials.length, 'material')}. Atlasing or merging materials reduces draw calls.`);
  const blend = materials.filter((m) => m.alphaMode === 'BLEND' && m.users);
  if (blend.length) add('info', 'alpha-blend', 'performance', `${plural(blend.length, 'material')} using alpha blend`, 'Blended materials are sorted and can’t use early-Z. Use MASK for cut-outs like foliage.');
  if (a.unused.materials || a.unused.textures || a.unused.meshes) {
    const parts = [a.unused.materials && plural(a.unused.materials, 'material'), a.unused.textures && plural(a.unused.textures, 'texture'), a.unused.meshes && plural(a.unused.meshes, 'mesh', 'meshes')].filter(Boolean);
    add('warning', 'unused-data', 'size', 'Unused data in file', `${parts.join(', ')} are stored but never used.`, FIX.optimise);
  }
  if (a.unused.emptyNodes > 10) add('info', 'empty-nodes', 'structure', `${plural(a.unused.emptyNodes, 'empty node')}`, 'Leftover helper/empty nodes add hierarchy overhead.', FIX.optimise);
  const negative = countNodes(a.scenes, (n) => n.negativeScale);
  if (negative) add('info', 'negative-scale', 'structure', `${plural(negative, 'node')} with negative scale`, 'Mirrored transforms flip face winding and can break culling or lighting in some engines.');

  // ---------- Textures ----------
  const big = textures.filter((t) => Math.max(t.width, t.height) > 4096);
  if (big.length) add('error', 'tex-8k', 'textures', `${plural(big.length, 'texture')} above 4K`, `${big.map((t) => `${t.name} (${t.width}×${t.height})`).slice(0, 3).join(', ')}. Many mobile GPUs reject these.`, FIX.resize);
  const k4 = textures.filter((t) => Math.max(t.width, t.height) > 2048 && Math.max(t.width, t.height) <= 4096);
  if (k4.length) add('warning', 'tex-4k', 'textures', `${plural(k4.length, '4K texture')}`, '4K maps use 85+ MB of GPU memory each with mips. 2K is plenty for most props.', FIX.resize);
  const npot = textures.filter((t) => t.width && !t.pot);
  if (npot.length) add('warning', 'tex-npot', 'textures', `${plural(npot.length, 'non-power-of-two texture')}`, `${npot.map((t) => `${t.width}×${t.height}`).slice(0, 3).join(', ')}. Some engines and WebGL1 can’t mipmap these.`, FIX.resize);
  const notGpuCompressed = textures.filter((t) => t.mimeType !== 'image/ktx2');
  if (textures.length && notGpuCompressed.length === textures.length && a.gpu.textureBytes > 32 * MB) {
    add('warning', 'tex-no-ktx2', 'textures', 'No GPU texture compression', `Textures expand to ~${fmtMB(a.gpu.textureBytes)} of VRAM. KTX2/Basis cuts that roughly 4×.`, FIX.compress);
  }
  const heavyPng = textures.filter((t) => t.mimeType === 'image/png' && t.byteLength > 1 * MB && !t.slots.includes('normalTexture'));
  if (heavyPng.length) add('warning', 'tex-heavy-png', 'textures', `${plural(heavyPng.length, 'heavy PNG texture')}`, `${fmtMB(heavyPng.reduce((s, t) => s + t.byteLength, 0))} in PNGs. WebP or JPEG is far smaller for colour maps.`, FIX.compress);
  if (bytes.textures > 20 * MB) add('warning', 'tex-bytes', 'textures', 'Textures dominate file size', `${fmtMB(bytes.textures)} of the file is image data.`, FIX.compress);
  const dups = textures.filter((t) => t.duplicateOf != null);
  if (dups.length) add('warning', 'tex-duplicate', 'textures', `${plural(dups.length, 'duplicate texture')}`, 'Identical images are stored more than once.', FIX.optimise);
  const separateOrm = materials.filter((m) => m.textures.occlusion != null && m.textures.metallicRoughness != null && m.textures.occlusion !== m.textures.metallicRoughness);
  if (separateOrm.length) add('info', 'tex-orm', 'textures', 'Occlusion not packed with metal/rough', `${plural(separateOrm.length, 'material')} use separate AO and metallic-roughness maps. Packing them into one ORM texture saves a texture fetch.`, FIX.pack);

  // ---------- Animation & rigging ----------
  const staticChannels = animations.reduce((s, x) => s + x.staticChannels, 0);
  if (staticChannels > 5) add('warning', 'anim-static', 'animation', `${plural(staticChannels, 'static animation channel')}`, 'Channels whose value never changes still cost memory and CPU every frame.', FIX.animOpt);
  const dense = animations.filter((x) => x.sampleRate > 60);
  if (dense.length) add('info', 'anim-dense', 'animation', 'Densely sampled animation', `${dense.map((x) => `${x.name} (~${x.sampleRate} keys/s)`).slice(0, 3).join(', ')}. Resampling or keyframe reduction can shrink this a lot.`, FIX.animOpt);
  if (bytes.animation > 5 * MB) add('warning', 'anim-bytes', 'animation', 'Animation data is large', `${fmtMB(bytes.animation)} of keyframes.`, FIX.animOpt);
  if (animations.length > 30) add('info', 'anim-many', 'animation', `${plural(animations.length, 'animation clip')}`, 'Remove clips the game doesn’t use.', FIX.strip);
  for (const skin of skins) {
    if (skin.jointCount > 255) add('warning', 'rig-joints', 'animation', `Skin "${skin.name}" has ${skin.jointCount} joints`, 'Above 255 joints some engines and mobile GPUs can’t skin in one pass.', FIX.rig);
    if (skin.maxInfluences > 4) add('info', 'rig-influences', 'animation', `Skin "${skin.name}" uses up to 8 influences`, 'Many engines only read 4 weights per vertex; extra influences are dropped.', FIX.rig);
  }

  // ---------- Compatibility ----------
  const exotic = a.extensions.required.filter((e) => !['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu', 'KHR_materials_unlit', 'KHR_texture_transform'].includes(e));
  if (exotic.length) add('warning', 'ext-required', 'compatibility', 'Uncommon required extensions', `${exotic.join(', ')} must be supported or the file won’t load.`);
  if (raw.has('KHR_draco_mesh_compression')) add('info', 'ext-draco', 'compatibility', 'Uses Draco compression', 'Loaders need a Draco decoder (three.js DRACOLoader, Babylon, Unity glTFast with Draco package).');
  if (raw.has('KHR_texture_basisu')) add('info', 'ext-ktx2', 'compatibility', 'Uses KTX2 textures', 'Loaders need a Basis transcoder (e.g. three.js KTX2Loader).');

  const rank = { error: 0, warning: 1, info: 2 };
  return issues.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

function countNodes(scenes, predicate) {
  let n = 0;
  const walk = (node) => {
    if (predicate(node)) n++;
    node.children.forEach(walk);
  };
  scenes.forEach((s) => s.nodes.forEach(walk));
  return n;
}

function fmtMB(bytes) {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function round(v, digits = 1) {
  return Number(v.toFixed(digits)).toLocaleString('en-GB');
}
