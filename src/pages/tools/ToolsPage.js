import { TOOLS, PINNED_MOBILE_TOOLS } from '../../shared/config/tools.js';
import { ToolCard } from '../../shared/components/ToolCard.js';
import { cachedUsageCounts, fetchUsageCounts, rankByUsage } from '../../services/UsageService.js';

/**
 * The rest, ordered by what the job costs to get done elsewhere — dedicated
 * commercial software or plug-ins first (LOD/decimation suites, format
 * converters, texture/material packages), free utilities last. Tools not
 * listed here (e.g. newly added ones) fall in after these; coming-soon
 * tools always sit at the end. The grid itself is ranked by usage; this
 * order only breaks ties (and is the whole order before any usage exists).
 */
const VALUE_ORDER = [
  'app-icon-generator',
  'app-store-screenshot-generator',
  'xcassets-generator',
  'mobile-ready-checker',
  'ktx2-texture-encoder',
  'generate-lods',
  'glb-builder',
  'reduce-polys',
  'optimise-glb',
  'thumbnail-maker',
  'animation-optimiser',
  'compress-textures',
  'pack-pbr',
  'asset-report',
  'rig-inspector',
  'asset-compare',
  'animation-inspector',
  'strip-animations',
  'inspect-glb',
  'convert-files',
  'texture-resizer',
  'model-splitter',
];

function orderedTools() {
  const rank = (tool) => {
    const i = VALUE_ORDER.indexOf(tool.id);
    return (tool.status === 'coming-soon' ? 1000 : 0) + (i === -1 ? VALUE_ORDER.length : i);
  };
  return [...TOOLS].sort((a, b) => rank(a) - rank(b));
}

export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">All Tools</h1>
        <p class="tool-page__description">Every tool on the bench, in one place — most used first.</p>
      </div>
    </div>
  `;

  const grid = document.createElement('div');
  grid.className = 'tool-grid';
  const fill = (counts) => {
    // Pinned mobile tools lead row 1; the rest are ranked by usage (VALUE_ORDER
    // breaks ties). The GLB Builder keeps its wide featured card style on row 2.
    const ranked = rankByUsage(orderedTools(), counts, PINNED_MOBILE_TOOLS);
    grid.replaceChildren(...ranked.map((tool, i) => ToolCard(tool, { index: i + 1, featured: tool.id === 'glb-builder' })));
  };
  fill(cachedUsageCounts());
  fetchUsageCounts().then((counts) => grid.isConnected && fill(counts));
  section.appendChild(grid);

  container.appendChild(section);
}
