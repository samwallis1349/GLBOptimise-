import { getOrderedTools } from '../../shared/config/tools.js';
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
        <p class="tool-page__description">Every tool on the bench, in one place — newest first, then most used.</p>
        <p class="tool-page__note">We made these tools for game devs. Enjoy!</p>
      </div>
    </div>
  `;

  const grid = document.createElement('div');
  grid.className = 'tool-grid';
  const fill = (counts) => {
    // Character Workshop takes the full-width card, as on the homepage;
    // everything after it is ranked by site-wide usage.
    const ranked = rankByUsage(getOrderedTools(), counts, ['character-workshop']);
    grid.replaceChildren(...ranked.map((tool, i) => ToolCard(tool, { index: i + 1, headline: i === 0 })));
  };
  fill(cachedUsageCounts());
  fetchUsageCounts().then((counts) => grid.isConnected && fill(counts));
  section.appendChild(grid);

  container.appendChild(section);
}
