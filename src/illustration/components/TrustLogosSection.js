/**
 * Authenticity & Past Logos Section
 * Fulfills: "a splash page says im genuine somewhere some past logos i have collected"
 */
import { PAST_LOGOS } from '../config/portfolioData.js';

export function TrustLogosSection({ onSelectLogo } = {}) {
  const section = document.createElement('section');
  section.id = 'genuine';
  section.className = 'il-genuine-section';

  section.innerHTML = `
    <div class="il-container">
      <div class="il-genuine-header il-reveal">
        <div>
          <div class="il-eyebrow">
            <span>✦</span>
            <span>Verified Authenticity & Proven Craft</span>
          </div>
          <h2 class="il-h2">I'm genuine.<br/>Every curve, hand-crafted.</h2>
        </div>
        <p class="il-lead" style="margin-bottom: 0;">
          In an era flooded with algorithmic noise and uncredited templates, every artwork, mark, and character here is drafted from genuine creative direction, meticulous vector nodes, and patient human storytelling.
        </p>
      </div>

      <div class="il-genuine-badges il-reveal il-reveal-stagger-1">
        <div class="il-badge-card">
          <div class="il-badge-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
          </div>
          <h3 class="il-badge-title">100% Genuine Craftsmanship</h3>
          <p class="il-badge-desc">
            No synthetic mass-generation passed off as finished art. Every piece is developed through concept thumbnails, refined silhouettes, and manual vector masters.
          </p>
        </div>

        <div class="il-badge-card">
          <div class="il-badge-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="14.31" y1="8" x2="20.05" y2="17.94"></line>
              <line x1="9.69" y1="8" x2="21.17" y2="8"></line>
              <line x1="7.38" y1="12" x2="13.12" y2="2.06"></line>
              <line x1="9.69" y1="16" x2="3.95" y2="6.06"></line>
              <line x1="14.31" y1="16" x2="2.83" y2="16"></line>
              <line x1="16.62" y1="12" x2="10.88" y2="21.94"></line>
            </svg>
          </div>
          <h3 class="il-badge-title">Infinite Vector Precision</h3>
          <p class="il-badge-desc">
            Archival-grade bezier paths and closed geometries designed to scale flawlessly from small mobile app icons up to multi-story architectural prints.
          </p>
        </div>

        <div class="il-badge-card">
          <div class="il-badge-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <h3 class="il-badge-title">Direct Collaborative Touch</h3>
          <p class="il-badge-desc">
            You work directly with Sam. No agency middlemen, no junior handoffs—just clear, responsive communication and direct creative alignment.
          </p>
        </div>
      </div>

      <div class="il-logos-title-bar il-reveal il-reveal-stagger-2">
        <div>
          <span class="il-eyebrow" style="margin-bottom: 4px;">Curated Collection</span>
          <h3 class="il-h3" style="margin: 0;">Selected Past Logos & Vector Marks</h3>
        </div>
        <span style="font-size: 0.9rem; color: var(--il-text-muted);">Hand-Crafted & Restored · Click to preview</span>
      </div>

      <div class="il-logos-grid il-reveal il-reveal-stagger-3">
        ${PAST_LOGOS.map((logo) => `
          <div class="il-logo-card" data-logo-id="${logo.id}" role="button" tabindex="0" aria-label="View preview of ${logo.title}">
            <div class="il-logo-preview">
              <img src="${logo.image}" alt="${logo.title}" loading="lazy" />
              <div class="il-logo-zoom-hint" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
              </div>
            </div>
            <span class="il-logo-tag">${logo.badge}</span>
            <h4 class="il-logo-title">${logo.title}</h4>
            <p class="il-logo-desc">${logo.description}</p>
            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--il-border-subtle); display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--il-text-muted);">
              <span>${logo.category}</span>
              <span style="color: var(--il-accent-amber); font-weight: 600;">${logo.year}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  if (onSelectLogo) {
    section.querySelectorAll('.il-logo-card').forEach((card) => {
      const trigger = () => {
        const id = card.dataset.logoId;
        const logo = PAST_LOGOS.find((l) => l.id === id);
        if (logo) onSelectLogo(logo);
      };
      card.addEventListener('click', trigger);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger();
        }
      });
    });
  }

  return section;
}
