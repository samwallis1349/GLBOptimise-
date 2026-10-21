/**
 * 5-second promo clips, one per tool: public/media/clips/<tool id>.mp4
 * (1920 × 1080, silent) with a <tool id>.webp poster frame. Add a tool's id
 * here once its clip is in that folder; tools without one show no video.
 */
const CLIP_IDS = new Set([
  'alpha-cutout', 'animation-inspector', 'animation-optimiser', 'app-icon-generator',
  'app-store-screenshot-generator', 'asset-compare', 'asset-pipeline', 'asset-report',
  'character-workshop', 'compress-textures', 'convert-files', 'generate-lods', 'glb-builder',
  'inspect-glb', 'iso-scene-builder', 'ktx2-texture-encoder', 'line-studio', 'model-to-iso-sprites',
  'mobile-ready-checker', 'model-splitter', 'model-to-isometric', 'optimise-glb', 'pack-pbr',
  'reduce-polys', 'rig-inspector', 'strip-animations', 'texture-resizer', 'thumbnail-maker',
  'xcassets-generator',
]);

/** @returns {{ src: string, poster: string } | null} */
export function toolClip(toolId) {
  if (!CLIP_IDS.has(toolId)) return null;
  const base = `/media/clips/${toolId}`;
  return { src: `${base}.mp4`, poster: `${base}.webp` };
}
