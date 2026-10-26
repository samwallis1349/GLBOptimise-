/**
 * Model to Iso Sprites in the panel: the site tool's own stage, sprite
 * renderer and sheet packer (public/tools/model-to-iso-sprites) on a WebGL
 * canvas the panel never shows. The worker first turns any model into a
 * plain GLB ('iso-prep'), so this only needs three.js's GLTFLoader.
 * Loaded on demand (dynamic import) so the other tools don't pay for three.js.
 */
import JSZip from 'jszip';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Stage } from '../../../public/tools/model-to-iso-sprites/js/stage.js';
import { SpriteRenderer } from '../../../public/tools/model-to-iso-sprites/js/sprites.js';
import { makeSprites } from '../../../public/tools/model-to-iso-sprites/js/export.js';
import { layoutSheet, planFrames, slug } from '../../../public/tools/model-to-iso-sprites/js/frames.js';
import { autoCell, DIRECTION_SETS, pxPerMetre, STYLE_PRESETS, tilePreset } from '../../../public/tools/model-to-iso-sprites/js/presets.js';

let stage = null;
let sprites = null;

/**
 * glb: plain GLB bytes. Options: tile ('standard'|'pixel'|'hd'), dirs (8|4|1),
 * fps (8|12|24), clip ('all' | 'none' | a clip index), style ('clean'|'soft'|'pixel'),
 * height (metres, 0 = auto: models over 20 units tall are read as centimetres).
 */
export async function runIso(glb, { tile = 'standard', dirs = 8, fps = 12, clip = 'all', style = 'clean', height = 0, frames = true } = {}, name = 'model', onProgress = () => {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) throw new Error('This model has no scene to draw.');
  stage ??= new Stage();
  sprites ??= new SpriteRenderer(stage);
  stage.setModel(root);
  const raw = stage.rawHeight || 1;
  const scale = Number(height) > 0 ? Number(height) / raw : raw > 20 ? 0.01 : 1;
  stage.setUnits(scale, 0);

  const allClips = (gltf.animations || []).filter((c) => c.duration > 0 && c.tracks.length);
  const clips = clip === 'none' ? [] : clip === 'all' ? allClips : allClips.filter((_, i) => String(i) === String(clip));
  if (clips.length > 6) clips.length = 6; // keeps the sheet a sensible size; pick one clip for more
  const preset = STYLE_PRESETS[style] || STYLE_PRESETS.clean;
  const { tileW } = tilePreset(tile);
  const k = preset.pixel ? preset.pixelScale : 1;
  stage.setStyle({ outline: preset.outline, ppm: pxPerMetre(tileW) / k, lighting: preset.lighting, shadow: preset.shadow });
  const fit = stage.measure(clips, true);
  const auto = autoCell({ height: fit.height, reach: fit.reach, tileW, margin: 1.08 });
  const cell = Math.ceil(auto.cell / k) * k;
  const anchor = { x: Math.round(auto.anchor.x / k) * k, y: Math.round(auto.anchor.y / k) * k };
  const model = slug(String(name).replace(/\.[^.]+$/, '')) || 'model';
  const rows = planFrames({ model, clips, dirs: DIRECTION_SETS[Number(dirs)] || DIRECTION_SETS[8], fps: Number(fps) || 12, loopSafe: true });
  const travel = Object.fromEntries(clips.map((c) => [c.name, stage.rootTravel(c)]));
  // A wider sheet before giving up: browsers draw up to 16384 px a side.
  const fits = (w) => { const l = layoutSheet(rows, cell, w); return l.width <= 16384 && l.height <= 16384; };
  const maxWidth = fits(4096) ? 4096 : fits(8192) ? 8192 : 0;
  if (!maxWidth) {
    const frames = rows.reduce((n, r) => n + r.frames.length, 0);
    throw new Error(`${frames} frames at ${cell} px won't fit on one sheet (the model reads as ${(raw * scale).toFixed(1)} m tall). Pick one clip, fewer directions or 8 fps${Number(height) ? '' : ', or set its height in metres'}.`);
  }
  const result = await makeSprites({
    stage, sprites, rows, onProgress,
    cfg: { cell, anchor, tileW, fps: Number(fps) || 12, loopSafe: true, inPlace: true, maxWidth, model, pixel: preset.pixel, pixelScale: preset.pixelScale, levels: preset.levels, wantZip: false, travel },
  });

  const zip = new JSZip();
  zip.file(`${result.base}.png`, new Uint8Array(await result.sheetBlob.arrayBuffer()));
  zip.file(`${result.base}.json`, result.json);
  if (frames) {
    const ctx = result.sheet.getContext('2d');
    const out = document.createElement('canvas');
    out.width = out.height = cell;
    const octx = out.getContext('2d');
    for (const [frameName, f] of Object.entries(result.atlas.frames)) {
      octx.clearRect(0, 0, cell, cell);
      octx.putImageData(ctx.getImageData(f.frame.x, f.frame.y, cell, cell), 0, 0);
      const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
      zip.file(`frames/${frameName}.png`, new Uint8Array(await blob.arrayBuffer()));
    }
  }
  const output = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  return {
    output,
    name: `${model}-iso-sprites.zip`,
    report: {
      frames: result.total,
      directions: Number(dirs) || 8,
      clips: clips.map((c) => c.name),
      sheet: `${result.layout.width}×${result.layout.height}`,
      cell,
      heightM: +(raw * scale).toFixed(2),
      checks: result.checks.map((c) => ({ level: c.level === 'PASS' ? 'ok' : c.level === 'WARN' ? 'warn' : 'error', text: c.text })),
      warnings: allClips.length > clips.length && clip === 'all' ? [`Only the first 6 of ${allClips.length} clips were drawn; pick one clip to draw others.`] : [],
    },
  };
}
