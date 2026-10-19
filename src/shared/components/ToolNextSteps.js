import { TOOLS, getOrderedTools } from '../config/tools.js';

/**
 * "What next?" under a tool: the tools people usually run after this one, and,
 * for jobs the Cloud API also does, a pointer to doing them in bulk from code.
 */
const NEXT = {
  'optimise-glb': ['generate-lods', 'ktx2-texture-encoder', 'mobile-ready-checker'],
  'reduce-polys': ['generate-lods', 'optimise-glb', 'mobile-ready-checker'],
  'generate-lods': ['compress-textures', 'mobile-ready-checker', 'thumbnail-maker'],
  'compress-textures': ['mobile-ready-checker', 'thumbnail-maker', 'generate-lods'],
  'ktx2-texture-encoder': ['mobile-ready-checker', 'generate-lods', 'thumbnail-maker'],
  'inspect-glb': ['optimise-glb', 'mobile-ready-checker', 'reduce-polys'],
  'mobile-ready-checker': ['optimise-glb', 'reduce-polys', 'compress-textures'],
  'convert-files': ['optimise-glb', 'inspect-glb', 'thumbnail-maker'],
  'texture-resizer': ['pack-pbr', 'compress-textures', 'ktx2-texture-encoder'],
  'app-icon-generator': ['xcassets-generator', 'app-store-screenshot-generator'],
  'xcassets-generator': ['app-icon-generator', 'app-store-screenshot-generator'],
  'app-store-screenshot-generator': ['app-icon-generator', 'xcassets-generator'],
};

/** Tools whose job the Cloud API also does (worker/api). */
const ON_API = new Set([
  'optimise-glb', 'reduce-polys', 'generate-lods', 'compress-textures', 'ktx2-texture-encoder', 'convert-files',
  'inspect-glb', 'mobile-ready-checker', 'asset-pipeline', 'texture-resizer',
  'app-icon-generator', 'xcassets-generator', 'app-store-screenshot-generator',
]);

const LIVE = new Set(['available', 'beta']);

export function ToolNextSteps(tool) {
  const byId = new Map(TOOLS.map((t) => [t.id, t]));
  let next = (NEXT[tool.id] || []).map((id) => byId.get(id)).filter((t) => t && LIVE.has(t.status));
  if (next.length < 2) {
    // Fallback: the most popular other tools in the same category.
    const more = getOrderedTools().filter((t) => t.category === tool.category && t.id !== tool.id && LIVE.has(t.status) && !next.includes(t));
    next = [...next, ...more].slice(0, 3);
  }
  if (!next.length && !ON_API.has(tool.id)) return null;

  const section = document.createElement('section');
  section.className = 'tool-next';
  section.innerHTML = `
    ${next.length ? `
      <h2 class="tool-next__title">What next?</h2>
      <div class="tool-next__list">
        ${next.map((t) => `<a class="tool-next__item" href="${t.route}"><b>${t.name} →</b><span>${t.description}</span></a>`).join('')}
      </div>` : ''}
    ${ON_API.has(tool.id) ? `
      <a class="tool-next__api" href="/docs/">
        <b>Doing this for a whole folder?</b>
        <span>The Cloud API does it from your own code: 100 free operations a month, 1,000 with All Access.</span>
      </a>` : ''}
  `;
  return section;
}
