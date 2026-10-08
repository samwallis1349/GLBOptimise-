import { TOOLS } from './tools.js';

/**
 * Editorial updates, changelogs, and workflow pro-tips for each tool.
 */
export const TOOL_NEWS = {
  'app-icon-generator': {
    version: 'v2.4 Update',
    date: 'October 2026',
    title: 'iOS 18 Dark & Tinted Mode Icons + AI Prompt Crafter',
    content:
      'Added automatic Apple Squircle clipping, Dark and Tinted icon previews, and 1-click Xcode AppIcon.appiconset export with complete Contents.json manifests. Android mipmap packages and Unity/Godot game sprite sheets now export at zero quality loss.',
    proTipTitle: 'Apple App Store Icon Guidelines',
    proTip:
      'Always design on a 1024×1024 flat canvas without pre-rounded corners. Apple applies the continuous curve squircle mask and drop shadow automatically upon App Store ingestion.',
    relatedTools: ['app-store-screenshot-generator', 'xcassets-generator', 'alpha-cutout'],
  },
  'app-store-screenshot-generator': {
    version: 'v2.2 Update',
    date: 'October 2026',
    title: 'Titanium iPhone 16 Pro Frames & Retina Slicing',
    content:
      'Generate polished 6.9" and 6.3" display screenshots ready for App Store Connect. Choose from natural titanium, desert titanium, or dark slate finishes with customizable gradient backdrops and bold marketing headlines.',
    proTipTitle: 'App Store Connect Compliance',
    proTip:
      '6.9" displays require 1320 × 2868 pixels in portrait mode. Ensure your top headline does not overlap the Dynamic Island safe zone (keep text 160px below top edge).',
    relatedTools: ['app-icon-generator', 'xcassets-generator', 'thumbnail-maker'],
  },
  'xcassets-generator': {
    version: 'v2.1 Update',
    date: 'October 2026',
    title: 'Xcode 16 Catalog Slicing & Dark Mode Pairs',
    content:
      'Automatically slice vector SVGs and high-res PNGs into @1x, @2x, and @3x scale variants. Outputs clean .imageset directories with valid Contents.json schemas ready to drag-and-drop straight into Assets.xcassets.',
    proTipTitle: 'Asset Catalog Efficiency',
    proTip:
      'For SwiftUI and UIKit, using PDF or SVG vector single-scale assets reduces bundle size, but legacy iOS targets still benefit from rasterized @2x and @3x assets for rapid GPU blitting.',
    relatedTools: ['app-icon-generator', 'app-store-screenshot-generator', 'line-studio'],
  },
  'mobile-ready-checker': {
    version: 'v2.0 Update',
    date: 'October 2026',
    title: 'Mobile & Quest 3 Draw Call Performance Budgets',
    content:
      'Audit polygon budgets, texture memory VRAM, draw calls, and bone counts against real hardware budgets (iPhone, Android Mid-range, Meta Quest 3, and WebGL). Get 1-click links to the exact bench tool that fixes each bottleneck.',
    proTipTitle: 'Draw Call Optimization Rule',
    proTip:
      'On mobile GPUs, draw calls cost more than raw vertex counts. Aim for under 100 total draw calls per scene by combining meshes and packing PBR textures into single material atlases.',
    relatedTools: ['ktx2-texture-encoder', 'reduce-polys', 'pack-pbr'],
  },
  'line-studio': {
    version: 'v1.8 Update',
    date: 'October 2026',
    title: 'Neural Line Smoothing & Vector Clean Trace',
    content:
      'Turn rough scanned sketches and coloring book pages into immaculate, smooth vector strokes. Automatically joins broken line gaps, normalizes line weights, and strips dirty paper backgrounds with instant SVG and transparent PNG export.',
    proTipTitle: 'Crisp Vector Cleanliness',
    proTip:
      'Scan or photograph line art with even lighting. Line Studio’s contrast thresholding works best when line weights are at least 2 pixels wide before smoothing.',
    relatedTools: ['alpha-cutout', 'xcassets-generator', 'model-to-isometric'],
  },
  'glb-builder': {
    version: 'v2.5 Update',
    date: 'October 2026',
    title: 'Multi-Asset Arrangement & Scene Merging',
    content:
      'Import multiple independent GLB models and arrange them spatially in an interactive 3D viewport. Merge multiple files into a single, cohesive GLB with unified scene hierarchies, material deduplication, and zero draw call waste.',
    proTipTitle: 'Scene Merging Best Practice',
    proTip:
      'Merging multiple static background props into a single GLB saves substantial CPU overhead in Three.js and Babylon.js by eliminating duplicate draw call state transitions.',
    relatedTools: ['optimise-glb', 'inspect-glb', 'generate-lods'],
  },
  'ktx2-texture-encoder': {
    version: 'v2.3 Update',
    date: 'October 2026',
    title: 'Basis Universal UASTC & ETC1S GPU Compression',
    content:
      'Transcode standard PNG and JPG textures directly inside GLBs into GPU-native KTX2 Basis Universal formats. Shrinks runtime VRAM consumption by up to 80% with zero WebGL decompression hit on mobile phones and VR headsets.',
    proTipTitle: 'VRAM vs Disk Size',
    proTip:
      'PNG and JPG files decompress to raw uncompressed RGBA in GPU memory (a 2K texture takes 16MB of VRAM). KTX2 stays compressed in VRAM, taking only 2.7MB, preventing mobile browser tab crashes.',
    relatedTools: ['compress-textures', 'mobile-ready-checker', 'pack-pbr'],
  },
  'generate-lods': {
    version: 'v2.0 Update',
    date: 'October 2026',
    title: 'Multi-Tier Level of Detail Generation with Meshopt',
    content:
      'Generate LOD0, LOD1, LOD2, and LOD3 geometric tiers in seconds using WebAssembly-accelerated quadric decimation. Preserves UV seams, vertex colors, and normal continuity across all reduction levels.',
    proTipTitle: 'Three.js & Unity LOD Distance Ratios',
    proTip:
      'A standard LOD strategy is 100% (LOD0), 50% (LOD1), 25% (LOD2), and 10% (LOD3). Switch distance thresholds should double at each tier to avoid visible silhouette popping.',
    relatedTools: ['reduce-polys', 'mobile-ready-checker', 'glb-builder'],
  },
  'reduce-polys': {
    version: 'v2.1 Update',
    date: 'October 2026',
    title: 'Geometry Decimation with Silhouette Locking',
    content:
      'Simplify dense high-polygon meshes down to target triangle budgets. Features interactive split-screen comparison, topological boundary preservation, and normal-aware surface smoothing.',
    proTipTitle: 'UV & Seam Preservation',
    proTip:
      'Enable boundary locking when decimating modular environment pieces or character face meshes to prevent texture stretching along texture island seams.',
    relatedTools: ['generate-lods', 'mobile-ready-checker', 'optimise-glb'],
  },
  'optimise-glb': {
    version: 'v2.4 Update',
    date: 'October 2026',
    title: 'Draco Compression, Meshopt & Texture Quantization',
    content:
      'One-click optimization pipeline powered by glTF-Transform and Draco. Strips redundant vertex attributes, quantizes geometry coordinates, deduplicates materials, and compresses texture payloads for 70%+ file size reduction.',
    proTipTitle: 'Web Delivery Rule of Thumb',
    proTip:
      'Combine Draco mesh compression with WebP or KTX2 texture encoding. Keep individual web GLBs under 5MB for instant interactive 3D web experiences.',
    relatedTools: ['reduce-polys', 'ktx2-texture-encoder', 'mobile-ready-checker'],
  },
  'pack-pbr': {
    version: 'v1.9 Update',
    date: 'October 2026',
    title: 'Channel Packing for ORM & MRA Textures',
    content:
      'Merge separate Roughness, Metallic, Ambient Occlusion, and Height grayscale maps into unified RGB/RGBA texture channels. Reduces sampler overhead from 3 separate textures down to a single GPU draw call.',
    proTipTitle: 'glTF Standard ORM Channel Layout',
    proTip:
      'The glTF PBR standard uses Red = Ambient Occlusion, Green = Roughness, Blue = Metalness. Unreal Engine uses the same layout for optimal material performance.',
    relatedTools: ['compress-textures', 'ktx2-texture-encoder', 'inspect-glb'],
  },
  'convert-files': {
    version: 'v2.2 Update',
    date: 'October 2026',
    title: 'FBX, OBJ, STL, and USDZ to GLB Transcoding',
    content:
      'Convert legacy 3D formats into modern, web-standard GLB and glTF assets right in your browser. Automatically parses embedded materials, textures, bone hierarchies, and animation tracks without desktop software.',
    proTipTitle: 'FBX Coordinate Axis Norms',
    proTip:
      'FBX exports from Maya or 3ds Max often use Y-up or Z-up coordinate frames. AssetBench automatically standardizes orientation to glTF’s right-handed Y-up convention.',
    relatedTools: ['optimise-glb', 'inspect-glb', 'glb-builder'],
  },
  'thumbnail-maker': {
    version: 'v2.1 Update',
    date: 'October 2026',
    title: 'Batch Renders & Studio Lighting Presets',
    content:
      'Render pristine 4K PNG thumbnails from 3D models with transparent alpha backgrounds. Features studio 3-point lighting, turntable isometric angles, and batch processing for entire asset catalogs.',
    proTipTitle: 'Transparent PNG Shadows',
    proTip:
      'Enable the soft ground shadow plane for realistic depth without rendering a solid floor, ensuring thumbnails composite seamlessly onto any dark or light UI.',
    relatedTools: ['model-to-isometric', 'alpha-cutout', 'inspect-glb'],
  },
  'inspect-glb': {
    version: 'v2.0 Update',
    date: 'October 2026',
    title: 'Deep Scene Graph Audit & Material Inspector',
    content:
      'Examine node hierarchies, draw calls, vertex count allocations, and embedded texture dimensions. Identify non-power-of-two textures, missing normal channels, and oversized mesh buffers instantly.',
    proTipTitle: 'Power-of-Two Textures',
    proTip:
      'Ensure textures use power-of-two dimensions (e.g. 512×512, 1024×1024, 2048×2048) so GPU mipmapping can generate smooth minification samples without runtime resampling artifacts.',
    relatedTools: ['mobile-ready-checker', 'optimise-glb', 'asset-report'],
  },
  'alpha-cutout': {
    version: 'v1.7 Update',
    date: 'October 2026',
    title: 'Automatic Sprite Sheet Slicing & Alpha Extraction',
    content:
      'Detect individual sprite frames and extract clean transparent cutouts with JSON boundary metadata. Removes uniform backgrounds and crops whitespace automatically for game engine 2D atlases.',
    proTipTitle: 'Sprite Atlas Bleed Padding',
    proTip:
      'Include 1–2 pixels of padding around sprite edges when packing into sprite sheets to prevent bilinear texture filtering from bleeding adjacent frames together.',
    relatedTools: ['line-studio', 'xcassets-generator', 'thumbnail-maker'],
  },
  'model-to-isometric': {
    version: 'v1.9 Update',
    date: 'October 2026',
    title: 'True Orthographic 30-Degree Dimetric & Isometric Renders',
    content:
      'Convert 3D GLBs into clean pixel-perfect isometric 2.5D sprite sheets and illustrations with true affine orthographic cameras. Compatible with classic RPG, strategy, and city builder grids.',
    proTipTitle: '2:1 Isometric Ratio Alignment',
    proTip:
      'Classic 2:1 isometric projection uses a 30° camera pitch and 45° yaw. This aligns diagonal pixels exactly along a 2-pixel-wide by 1-pixel-high stair-step grid.',
    relatedTools: ['thumbnail-maker', 'alpha-cutout', 'glb-builder'],
  },
  'compress-textures': {
    version: 'v2.2 Update',
    date: 'October 2026',
    title: 'WebP and AVIF Texture Crunching',
    content:
      'Shrink embedded PNG and JPG textures down to fractional sizes without perceptible quality degradation using browser-native Canvas and WebAssembly encoders.',
    proTipTitle: 'Roughness Map Compression',
    proTip:
      'Keep Roughness and Normal maps at higher bit-depths than base color maps, as aggressive compression artifacts on normals create visible surface shading banding.',
    relatedTools: ['pack-pbr', 'ktx2-texture-encoder', 'texture-resizer'],
  },
  'texture-resizer': {
    version: 'v1.8 Update',
    date: 'October 2026',
    title: 'Power-of-Two Downscaling & Aspect Ratio Locking',
    content:
      'Batch resize heavy 4K textures down to 2K, 1K, or 512px with bicubic interpolation. Essential for mobile game memory optimization and low-bandwidth web viewers.',
    proTipTitle: 'Downsampling Resolution',
    proTip:
      'Halving texture resolution (e.g., from 2048 to 1024) reduces memory consumption by 75% because pixel count scales quadratically with dimensions.',
    relatedTools: ['compress-textures', 'ktx2-texture-encoder', 'mobile-ready-checker'],
  },
  'asset-report': {
    version: 'v2.0 Update',
    date: 'October 2026',
    title: 'Batch Library Performance Scoring & CSV Export',
    content:
      'Drop an entire folder of 3D models to audit performance scores, triangle totals, texture VRAM requirements, and draw call estimates in one unified table.',
    proTipTitle: 'Studio Asset Budgeting',
    proTip:
      'Establish hard platform budgets early: e.g., mobile hero characters at 15k triangles and props under 2k triangles to ensure 60 FPS across budget mobile devices.',
    relatedTools: ['mobile-ready-checker', 'asset-compare', 'inspect-glb'],
  },
  'asset-compare': {
    version: 'v1.9 Update',
    date: 'October 2026',
    title: 'Synchronized Dual-Viewport Mesh Diffing',
    content:
      'Compare original and optimized models side-by-side with locked camera controls, wireframe overlays, and differential statistics to verify visual fidelity.',
    proTipTitle: 'LOD Quality Verification',
    proTip:
      'Look at silhouettes and grazing specular highlights when comparing decimated models to ensure lighting reflections remain identical to the original high-poly mesh.',
    relatedTools: ['reduce-polys', 'generate-lods', 'asset-report'],
  },
  'strip-animations': {
    version: 'v1.6 Update',
    date: 'October 2026',
    title: 'Targeted Animation Track Pruning',
    content:
      'Strip unwanted animation clips and morphtarget tracks from animated characters to prevent bloat when using models as static props or ragdolls.',
    proTipTitle: 'Morph Target Memory Overhead',
    proTip:
      'Unused blendshapes duplicate full vertex buffer streams in GPU memory. Stripping unused morph channels can halve GLB geometry footprint immediately.',
    relatedTools: ['animation-optimiser', 'animation-inspector', 'optimise-glb'],
  },
  'animation-optimiser': {
    version: 'v1.8 Update',
    date: 'October 2026',
    title: 'Keyframe Decimation & Curve Resampling',
    content:
      'Reduce redundant keyframe tracks from Mixamo or mocap data with tolerance-based curve fitting, cutting animation payload sizes by up to 80%.',
    proTipTitle: 'Linear vs Spline Keyframes',
    proTip:
      'Constant-interval 60fps raw mocap data contains massive redundancy. Curve fitting eliminates 70% of redundant keyframes without any noticeable animation drift.',
    relatedTools: ['strip-animations', 'animation-inspector', 'rig-inspector'],
  },
  'rig-inspector': {
    version: 'v1.7 Update',
    date: 'October 2026',
    title: 'Joint Hierarchy & Bone Influence Visualizer',
    content:
      'Inspect skeleton joints, bone bind matrices, and vertex skinning weight limits to prevent rigging errors and mobile GPU vertex shader crashes.',
    proTipTitle: 'Max Bone Influences per Vertex',
    proTip:
      'Most mobile game engines only support 4 bone weights per vertex. Having 8 influences can trigger software skinning fallbacks and severe framerate drops.',
    relatedTools: ['animation-inspector', 'animation-optimiser', 'strip-animations'],
  },
  'animation-inspector': {
    version: 'v1.7 Update',
    date: 'October 2026',
    title: 'Multi-Track Clip Playback & Timeline Scrubber',
    content:
      'Play, pause, scrub, and inspect all animation clips stored inside a GLB or FBX container with real-time FPS telemetry and frame stepping.',
    proTipTitle: 'Loop Continuity Check',
    proTip:
      'Scrub between the first and last frames to verify seamless loop continuity for walk cycles, run cycles, and idle animations before importing into game engines.',
    relatedTools: ['animation-optimiser', 'rig-inspector', 'strip-animations'],
  },
  'model-splitter': {
    version: 'v1.7 Update',
    date: 'October 2026',
    title: 'Mesh Partitioning & Sub-Object Extraction',
    content:
      'Split composite 3D scenes into individual modular GLBs per mesh or material group. Perfect for breaking kitbash packs into separate game prop prefabs.',
    proTipTitle: 'Prefab Origin Centers',
    proTip:
      'When splitting modular architectural pieces, ensure each exported piece retains its relative pivot point so snap-together grid building works in-engine.',
    relatedTools: ['glb-builder', 'convert-files', 'optimise-glb'],
  },
};

/**
 * Returns news and pro tips for a tool, falling back to category-aware defaults.
 */
export function getToolNews(tool) {
  if (!tool) return null;
  const custom = TOOL_NEWS[tool.id];
  if (custom) return custom;

  // Smart fallback based on category
  const categoryNames = {
    build: 'Build & Convert',
    optimise: 'Mesh & Texture Optimization',
    inspect: 'Analysis & Quality Inspection',
  };

  return {
    version: 'v2.0 Update',
    date: 'October 2026',
    title: `${tool.name} Engine Performance & Browser Pipeline`,
    content: `${tool.description} Fully processed on-device in WebAssembly and WebGL with zero cloud upload wait times.`,
    proTipTitle: 'Workflow Best Practice',
    proTip: 'Always verify optimized assets in your target engine (Three.js, Unity, or Unreal) to ensure shaders and memory budgets meet your target hardware limits.',
    relatedTools: ['mobile-ready-checker', 'optimise-glb', 'inspect-glb'].filter((id) => id !== tool.id),
  };
}
