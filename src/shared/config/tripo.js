/**
 * Tripo (AI 3D model generator) affiliate link and the "Tripo to game-ready"
 * guide. Read by the guide page (pages/tripo/TripoPage.js), the small Tripo
 * card under the tools in TRIPO_TOOLS (components/TripoCard.js) and the
 * build's crawler summary (scripts/seo-pages.mjs), so search engines see what
 * visitors do.
 *
 * Every link out to Tripo is labelled as an affiliate link and carries
 * rel="sponsored": that's the disclosure UK advertising rules ask for.
 */

import { getToolById } from './tools.js';

export const TRIPO_URL = 'https://tripo.pxf.io/Pz9Xgq';
export const TRIPO_GUIDE_PATH = '/tripo-to-game-ready';

/**
 * Tool pages that show the Tripo card (20): the ones that take a 3D model, where
 * "need a model?" makes sense. The image, app-icon and 2D tools are left out.
 */
export const TRIPO_TOOLS = new Set([
  'mobile-ready-checker', 'inspect-glb', 'asset-report', 'asset-compare', 'thumbnail-maker',
  'optimise-glb', 'reduce-polys', 'generate-lods', 'compress-textures', 'asset-pipeline',
  'convert-files', 'glb-builder', 'model-splitter', 'model-to-isometric', 'model-to-iso-sprites',
  'character-workshop', 'rig-inspector', 'animation-inspector', 'animation-optimiser', 'ktx2-texture-encoder',
]);

/** Attributes for every link out to Tripo. */
export const TRIPO_LINK_ATTRS = `href="${TRIPO_URL}" target="_blank" rel="sponsored noopener"`;

/** The guide, in order. `tools` are registry ids; missing ones are skipped. */
export const TRIPO_STEPS = [
  {
    title: 'Generate the model in Tripo',
    text: 'Describe what you want or upload a reference image, then export it as a GLB (or FBX for a character you want to rig).',
    tripo: true,
  },
  {
    title: 'Check it against your target',
    text: 'AI models are often far heavier than a game needs. See its triangles, draw calls and texture sizes against phone, VR and web budgets, and what to fix first.',
    tools: ['mobile-ready-checker', 'inspect-glb'],
  },
  {
    title: 'Cut the triangles',
    text: 'Bring the mesh down to a sensible count while keeping its silhouette.',
    tools: ['reduce-polys'],
  },
  {
    title: 'Shrink the textures',
    text: 'Resize the large texture maps and compress them, to KTX2 if your engine reads it.',
    tools: ['compress-textures', 'ktx2-texture-encoder'],
  },
  {
    title: 'Finish for your game',
    text: 'Add LODs for distance, check a character’s rig and clips, or render it as isometric sprites for a 2D game.',
    tools: ['generate-lods', 'character-workshop', 'model-to-iso-sprites'],
  },
  {
    title: 'Or do it all at once',
    text: 'Run a whole folder of models through checks, reduction, textures and LODs in one go.',
    tools: ['asset-pipeline'],
  },
];

const stepTools = (step) => (step.tools ?? []).map(getToolById).filter(Boolean);

/**
 * The guide's steps as plain HTML. The page adds its own classes around it;
 * the crawler summary uses it as-is.
 */
export function tripoStepsMarkup(esc = (v) => String(v)) {
  return `<ol class="tripo-guide__steps">${TRIPO_STEPS.map((step) => `
    <li class="tripo-guide__step">
      <h2>${esc(step.title)}</h2>
      <p>${esc(step.text)}</p>
      ${step.tripo ? `<p><a class="tripo-guide__out" data-tripo="guide-step" ${TRIPO_LINK_ATTRS}>Open Tripo ↗</a> <small class="affiliate-note">Affiliate link</small></p>` : ''}
      ${stepTools(step).length ? `<ul class="tripo-guide__tools">${stepTools(step).map((t) => `<li><a href="${t.route}">${esc(t.name)}</a></li>`).join('')}</ul>` : ''}
    </li>`).join('')}
  </ol>`;
}
