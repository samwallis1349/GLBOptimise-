/**
 * Top Navigation Bar for Studio Wallis Graphic Illustration
 */
import { STUDIO_INFO } from '../config/portfolioData.js';

export function IllustrationNav({ onNavigate } = {}) {
  const header = document.createElement('header');
  header.className = 'il-nav-wrapper';

  header.innerHTML = `
    <div class="il-container">
      <nav class="il-nav" aria-label="Main Navigation">
        <a href="#hero" class="il-nav-brand" aria-label="${STUDIO_INFO.name} Home">
          <span class="il-brand-symbol">${STUDIO_INFO.brandSymbol || 'S'}</span>
          <span class="il-brand-text">${STUDIO_INFO.name}</span>
          <span class="il-brand-badge">${STUDIO_INFO.badge || 'Graphic Design'}</span>
        </a>

        <ul class="il-nav-links">
          <li><a href="#work" class="il-nav-link">Work</a></li>
          <li><a href="#genuine" class="il-nav-link">Authenticity & Logos</a></li>
          <li><a href="#featured" class="il-nav-link">Featured World</a></li>
          <li><a href="#services" class="il-nav-link">Services</a></li>
          <li><a href="#about" class="il-nav-link">About</a></li>
        </ul>

        <div class="il-nav-actions">
          <a href="#enquiry" class="il-btn il-btn-primary il-nav-cta">Start a Project</a>
          <button class="il-menu-btn" aria-label="Toggle navigation menu" aria-expanded="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>
      </nav>
    </div>

    <div class="il-mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
      <a href="#hero" class="il-mobile-link">Home</a>
      <a href="#work" class="il-mobile-link">Portfolio</a>
      <a href="#genuine" class="il-mobile-link">Authenticity & Logos</a>
      <a href="#featured" class="il-mobile-link">Featured Project</a>
      <a href="#services" class="il-mobile-link">Services</a>
      <a href="#about" class="il-mobile-link">About the Artist</a>
      <a href="#enquiry" class="il-btn il-btn-primary" style="margin-top: 12px; width: 100%;">Start a Project</a>
    </div>
  `;

  const menuBtn = header.querySelector('.il-menu-btn');
  const drawer = header.querySelector('.il-mobile-drawer');

  menuBtn?.addEventListener('click', () => {
    const isOpen = drawer.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(isOpen));
  });

  // Smooth scroll links
  header.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        drawer.classList.remove('open');
        menuBtn?.setAttribute('aria-expanded', 'false');
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', targetId);
      }
    });
  });

  return header;
}
