/**
 * Hero Section — Studio Wallis
 * Headline: Ideas, illustrated. Worlds, imagined.
 */
import { STUDIO_INFO } from '../config/portfolioData.js';

export function HeroSection() {
  const section = document.createElement('section');
  section.id = 'hero';
  section.className = 'il-hero-section';

  section.innerHTML = `
    <div class="il-container">
      <div class="il-hero-grid">
        <div class="il-hero-content il-reveal">
          <div class="il-eyebrow">
            <span>✦</span>
            <span>Sam — Graphic Design &amp; Illustration</span>
          </div>
          
          <h1 class="il-h1">Ideas, illustrated.<br/>Worlds, imagined.</h1>
          
          <p class="il-lead">
            ${STUDIO_INFO.subheading}
          </p>
          
          <div class="il-hero-actions">
            <a href="#work" class="il-btn il-btn-primary">
              <span>Explore the Work</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </a>
            
            <a href="#enquiry" class="il-btn il-btn-secondary">
              <span>Start a Project</span>
            </a>
          </div>

          <div class="il-hero-meta">
            <div class="il-hero-meta-item">
              <span class="il-dot-live"></span>
              <span>${STUDIO_INFO.availability}</span>
            </div>
            <div class="il-hero-meta-item">
              <span>United Kingdom & Worldwide</span>
            </div>
          </div>
        </div>

        <div class="il-hero-artwork-frame il-reveal il-reveal-stagger-2" id="hero-frame">
          <div class="il-hero-img-container">
            <img 
              src="/illustration/hero-world.jpg" 
              alt="An imaginary floating creative world featuring isometric architecture, drawing instruments, and expressive characters" 
              class="il-hero-img"
              loading="eager"
              fetchpriority="high"
            />
            <div class="il-hero-art-badge">
              <span>✦</span>
              <span>Original Artwork: The Maker's Archipelago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Subtle interactive parallax tilt on the hero artwork
  const frame = section.querySelector('#hero-frame');
  if (frame) {
    frame.addEventListener('mousemove', (e) => {
      const rect = frame.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const rotateX = -(y / (rect.height / 2)) * 3;
      const rotateY = (x / (rect.width / 2)) * 3;
      frame.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px) scale(1.01)`;
    });

    frame.addEventListener('mouseleave', () => {
      frame.style.transform = '';
    });
  }

  // Smooth scroll for buttons
  section.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', targetId);
      }
    });
  });

  return section;
}
