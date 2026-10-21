import { getOrderedTools } from '../../shared/config/tools.js';
import { ToolCard } from '../../shared/components/ToolCard.js';
import { WinnerCard } from '../../shared/components/WinnerCard.js';
import { cachedUsageCounts, fetchUsageCounts, nextRowTurn, rankByUsage, rotateRow } from '../../services/UsageService.js';

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
  // As on the homepage: the most-used tool wins the full-width first card and
  // the row under it takes turns among the next twelve.
  const turn = nextRowTurn();
  const fill = (counts) => {
    const ranked = rotateRow(rankByUsage(getOrderedTools(), counts), turn);
    grid.replaceChildren(...ranked.map((tool, i) => (i === 0 ? WinnerCard(tool) : ToolCard(tool, { index: i + 1 }))));
  };
  fill(cachedUsageCounts());
  fetchUsageCounts().then((counts) => grid.isConnected && fill(counts));
  section.appendChild(grid);

  container.appendChild(section);
}
