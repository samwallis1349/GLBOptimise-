import { TOOLS } from '../../shared/config/tools.js';
import { ToolCard } from '../../shared/components/ToolCard.js';

export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">All Tools</h1>
        <p class="tool-page__description">Every tool on the bench, in one place.</p>
      </div>
    </div>
  `;

  const grid = document.createElement('div');
  grid.className = 'tool-grid';
  TOOLS.forEach((tool) => grid.appendChild(ToolCard(tool)));
  section.appendChild(grid);

  container.appendChild(section);
}
