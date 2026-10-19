/**
 * Portfolio Grid Component
 * Asymmetric editorial grid of illustration projects with category filtering and interactive case-study modal trigger.
 */
import { PROJECTS, CATEGORIES } from '../config/portfolioData.js';

export function PortfolioGrid({ onSelectProject } = {}) {
  const section = document.createElement('section');
  section.id = 'work';
  section.className = 'il-portfolio-section';

  let currentCategory = 'All Work';

  function renderGrid() {
    const filtered = currentCategory === 'All Work'
      ? PROJECTS
      : PROJECTS.filter((p) => p.category === currentCategory);

    return `
      <div class="il-projects-grid">
        ${filtered.map((project) => `
          <article 
            class="il-card il-card-span-${project.span || 'regular'} il-reveal" 
            data-project-id="${project.id}"
            tabindex="0"
            role="button"
            aria-label="View case study for ${project.title}"
          >
            <div class="il-card-media">
              <img 
                src="${project.image}" 
                alt="${project.title} - ${project.category}" 
                class="il-card-img" 
                loading="lazy" 
              />
              <div class="il-card-overlay">
                <span class="il-card-category" style="color: var(--il-accent-amber-light); margin-bottom: 6px;">${project.category}</span>
                <h3 class="il-overlay-title">${project.title}</h3>
                <p class="il-overlay-desc">${project.tagline}</p>
                <div class="il-overlay-btn">
                  <span>Explore Case Study</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </div>
              </div>
            </div>
            <div class="il-card-footer">
              <div>
                <span class="il-card-category">${project.category}</span>
                <h3 class="il-card-title">${project.title}</h3>
              </div>
              <span style="font-size: 0.85rem; color: var(--il-text-muted); font-weight: 500;">${project.year}</span>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  section.innerHTML = `
    <div class="il-container">
      <div class="il-portfolio-header il-reveal">
        <div>
          <div class="il-eyebrow">
            <span>✦</span>
            <span>Selected Projects</span>
          </div>
          <h2 class="il-h2">Original Illustration Portfolio</h2>
          <p class="il-lead" style="max-width: 680px; margin-bottom: 0;">
            A curated selection of narrative character design, isometric worldbuilding, game assets, and commercial editorial artwork.
          </p>
        </div>

        <div class="il-filter-tabs" role="tablist" aria-label="Portfolio Category Filter">
          ${CATEGORIES.map((cat) => `
            <button 
              class="il-filter-btn ${cat === currentCategory ? 'active' : ''}" 
              data-category="${cat}"
              role="tab"
              aria-selected="${cat === currentCategory}"
            >
              ${cat}
            </button>
          `).join('')}
        </div>
      </div>

      <div id="projects-container">
        ${renderGrid()}
      </div>
    </div>
  `;

  function attachListeners() {
    // Card clicks
    section.querySelectorAll('.il-card').forEach((card) => {
      const openCard = () => {
        const id = card.getAttribute('data-project-id');
        const project = PROJECTS.find((p) => p.id === id);
        if (project && onSelectProject) onSelectProject(project);
      };

      card.addEventListener('click', openCard);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCard();
        }
      });
    });

    // Filter button clicks
    section.querySelectorAll('.il-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-category');
        if (!cat || cat === currentCategory) return;
        currentCategory = cat;

        section.querySelectorAll('.il-filter-btn').forEach((b) => {
          const isActive = b.getAttribute('data-category') === currentCategory;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-selected', String(isActive));
        });

        const container = section.querySelector('#projects-container');
        if (container) {
          container.innerHTML = renderGrid();
          attachListeners();
          // Trigger immediate reveal on newly rendered cards
          container.querySelectorAll('.il-card').forEach((c) => c.classList.add('il-revealed'));
        }
      });
    });
  }

  attachListeners();
  return section;
}
