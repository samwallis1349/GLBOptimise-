/**
 * About Section Component
 * Headline: A little imagination goes a long way.
 */
import { ABOUT_COPY, PRINCIPLES, STUDIO_INFO } from '../config/portfolioData.js';

export function AboutSection() {
  const section = document.createElement('section');
  section.id = 'about';
  section.className = 'il-about-section';

  section.innerHTML = `
    <div class="il-container">
      <div class="il-about-grid">
        <div class="il-about-media-col il-reveal">
          <div class="il-about-portrait-frame">
            <img 
              src="/illustration/illustrator-portrait.jpg" 
              alt="Illustrated portrait of ${STUDIO_INFO.artistName} in the creative atelier" 
              class="il-about-portrait"
              loading="lazy" 
            />
          </div>

          <div class="il-about-quote-box">
            ${ABOUT_COPY.quote}
            <div style="font-size: 0.85rem; color: var(--il-text-muted); font-style: normal; margin-top: 8px; font-weight: 600;">
              — ${STUDIO_INFO.artistName}, ${STUDIO_INFO.artistTitle}
            </div>
          </div>
        </div>

        <div class="il-about-text-col il-reveal il-reveal-stagger-1">
          <div class="il-eyebrow">
            <span>✦</span>
            <span>About the Designer &amp; Illustrator</span>
          </div>

          <h2 class="il-h2">${ABOUT_COPY.headline}</h2>

          <div class="il-about-paragraphs">
            ${ABOUT_COPY.paragraphs.map((p) => `<p>${p}</p>`).join('')}
          </div>

          <div class="il-principles-grid">
            ${PRINCIPLES.map((principle) => `
              <div class="il-principle-item">
                <h3 class="il-principle-title">${principle.title}</h3>
                <p class="il-principle-desc">${principle.desc}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  return section;
}
