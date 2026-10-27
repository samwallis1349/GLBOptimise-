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

export const TRIPO_URL = 'https://tripo.pxf.io/c/7253936/4027202/55781';
// Our own short link: counts the click and forwards to TRIPO_URL (worker/index.js). Every button points here.
export const TRIPO_GO_PATH = '/go/tripo';
// Where a visitor whose ad blocker stops TRIPO_URL is sent instead (services/TripoLinks.js): no credit, but no dead page.
export const TRIPO_DIRECT_URL = 'https://www.tripo3d.ai/';
export const TRIPO_GUIDE_PATH = '/tripo-to-game-ready';

/**
 * Tool pages that show the Tripo card (10): the ones where making a new model fits best. Since 27 Oct the other 10
 * 3D tools show our affiliate programme's card instead (config/partners.js PARTNER_TOOLS). The image, app-icon and
 * 2D tools have neither.
 */
export const TRIPO_TOOLS = new Set([
  'mobile-ready-checker', 'thumbnail-maker', 'optimise-glb', 'reduce-polys', 'generate-lods',
  'compress-textures', 'asset-pipeline', 'model-to-isometric', 'model-to-iso-sprites', 'character-workshop',
]);

/** Attributes for every link out to Tripo: our /go/tripo, checked for a blocker on click (services/TripoLinks.js). */
export const TRIPO_LINK_ATTRS = `href="${TRIPO_GO_PATH}" data-tripo-link target="_blank" rel="sponsored noopener"`;

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
