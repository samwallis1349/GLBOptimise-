/**
 * Featured Project Showcase Component
 * Headline: Small details. Entire worlds.
 * Centers on the rich isometric creative atelier studio artwork.
 */
import { FEATURED_PROJECT } from '../config/portfolioData.js';

export function FeaturedShowcase() {
  const section = document.createElement('section');
  section.id = 'featured';
  section.className = 'il-featured-section';

  section.innerHTML = `
    <div class="il-container">
      <div class="il-featured-header il-reveal">
        <div class="il-eyebrow il-eyebrow-dark">
          <span>✦</span>
          <span>Featured Showcase</span>
        </div>
        <h2 class="il-h2 il-featured-h2">${FEATURED_PROJECT.headline}</h2>
        <p class="il-featured-sub">
          ${FEATURED_PROJECT.subheading}
        </p>
      </div>

      <div class="il-featured-display il-reveal il-reveal-stagger-1">
        <img 
          src="${FEATURED_PROJECT.image}" 
          alt="Isometric cross-section illustration of an artist creative atelier studio populated with small characters working, drawing, and crafting" 
          class="il-featured-img" 
          loading="lazy"
        />
      </div>

      <div class="il-featured-highlights il-reveal il-reveal-stagger-2">
        ${FEATURED_PROJECT.highlights.map((h) => `
          <div class="il-highlight-card">
            <h3 class="il-highlight-title">
              <span style="color: var(--il-accent-amber);">✦</span>
              <span>${h.title}</span>
            </h3>
            <p class="il-highlight-desc">${h.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  return section;
}
