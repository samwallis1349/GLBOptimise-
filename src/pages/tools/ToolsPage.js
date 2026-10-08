import { PINNED_MOBILE_TOOLS, getOrderedTools } from '../../shared/config/tools.js';
import { ToolCard } from '../../shared/components/ToolCard.js';
import { cachedUsageCounts, fetchUsageCounts, rankByUsage } from '../../services/UsageService.js';

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
    // Row 1: Pinned blue mobile tools.
    // Row 2: Top 4 most-used tools on the bench.
    const ranked = rankByUsage(getOrderedTools(), counts, PINNED_MOBILE_TOOLS);
    grid.replaceChildren(...ranked.map((tool, i) => ToolCard(tool, { index: i + 1 })));
  };
  fill(cachedUsageCounts());
  fetchUsageCounts().then((counts) => grid.isConnected && fill(counts));
  section.appendChild(grid);

  container.appendChild(section);
}
