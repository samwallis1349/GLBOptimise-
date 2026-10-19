/**
 * Services Section Component
 * Clean, editorial presentation of professional graphic illustration services
 */
import { SERVICES } from '../config/portfolioData.js';

export function ServicesSection() {
  const section = document.createElement('section');
  section.id = 'services';
  section.className = 'il-services-section';

  section.innerHTML = `
    <div class="il-container">
      <div class="il-services-header il-reveal">
        <div class="il-eyebrow">
          <span>✦</span>
          <span>Capabilities & Craft</span>
        </div>
        <h2 class="il-h2">Disciplines & Services</h2>
        <p class="il-lead" style="margin-bottom: 0;">
          From single hero artworks to comprehensive illustrative brand languages and game-ready asset pipelines—delivered with uncompromising fidelity.
        </p>
      </div>

      <div class="il-services-list">
        ${SERVICES.map((service, index) => `
          <div class="il-service-card il-reveal il-reveal-stagger-${(index % 3) + 1}">
            <div class="il-service-top">
              <span class="il-service-num">${service.num}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--il-accent-amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>

            <h3 class="il-service-title">${service.title}</h3>
            <p class="il-service-desc">${service.description}</p>

            <ul class="il-service-deliverables">
              ${service.deliverables.map((item) => `
                <li class="il-service-pill">${item}</li>
              `).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  return section;
}
