import { GAME_2D_GROUPS, getToolById } from '../../shared/config/tools.js';
import { ToolCard } from '../../shared/components/ToolCard.js';

export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">2D &amp; Isometric Game Tools</h1>
        <p class="tool-page__description">Tools for sprite-based games, from isometric scenes to 2D sprite sheets. All run in your browser.</p>
        <p class="tool-page__note">${GAME_2D_GROUPS.map((g) => `<a href="#${g.id}">${g.label}</a>`).join(' · ')}</p>
      </div>
    </div>
  `;

  for (const group of GAME_2D_GROUPS) {
    const tools = group.tools.map(getToolById).filter(Boolean);
    if (!tools.length) continue;

    const block = document.createElement('div');
    block.className = 'game-2d__group';
    block.id = group.id;
    block.innerHTML = `
      <h2 class="section__heading">${group.label}</h2>
      <p class="tool-page__description">${group.description}</p>
    `;

    const grid = document.createElement('div');
    grid.className = 'tool-grid';
    grid.replaceChildren(...tools.map((tool, i) => ToolCard(tool, { index: i + 1 })));
    block.appendChild(grid);
    section.appendChild(block);
  }

  container.appendChild(section);
}
