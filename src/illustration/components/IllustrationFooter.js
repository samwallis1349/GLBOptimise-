/**
 * Minimal & Elegant Footer Component
 */
import { STUDIO_INFO } from '../config/portfolioData.js';

export function IllustrationFooter() {
  const footer = document.createElement('footer');
  footer.className = 'il-footer';

  footer.innerHTML = `
    <div class="il-container">
      <div class="il-footer-top">
        <a href="#hero" class="il-footer-brand" aria-label="${STUDIO_INFO.name}">
          <span class="il-brand-symbol">${STUDIO_INFO.brandSymbol || 'S'}</span>
          <span>${STUDIO_INFO.name}</span>
          <span class="il-brand-badge" style="margin-left: 8px;">${STUDIO_INFO.badge || 'Graphic Design'}</span>
        </a>

        <ul class="il-footer-nav">
          <li><a href="#work" class="il-footer-link">Portfolio</a></li>
          <li><a href="#genuine" class="il-footer-link">Authenticity</a></li>
          <li><a href="#featured" class="il-footer-link">Featured World</a></li>
          <li><a href="#services" class="il-footer-link">Services</a></li>
          <li><a href="#about" class="il-footer-link">About</a></li>
          <li><a href="#enquiry" class="il-footer-link">Contact</a></li>
        </ul>

        <div class="il-footer-socials">
          <a href="${STUDIO_INFO.social.instagram}" target="_blank" rel="noopener noreferrer" class="il-social-link" aria-label="Instagram">
            Instagram
          </a>
          <span style="opacity: 0.3;">/</span>
          <a href="${STUDIO_INFO.social.artstation}" target="_blank" rel="noopener noreferrer" class="il-social-link" aria-label="ArtStation">
            ArtStation
          </a>
          <span style="opacity: 0.3;">/</span>
          <a href="${STUDIO_INFO.social.dribbble}" target="_blank" rel="noopener noreferrer" class="il-social-link" aria-label="Dribbble">
            Dribbble
          </a>
          <span style="opacity: 0.3;">/</span>
          <a href="${STUDIO_INFO.social.behance}" target="_blank" rel="noopener noreferrer" class="il-social-link" aria-label="Behance">
            Behance
          </a>
        </div>
      </div>

      <div class="il-footer-bottom">
        <div>
          © ${new Date().getFullYear()} ${STUDIO_INFO.name}. All original design and illustration rights reserved.
        </div>
        
        <div>
          Part of the creative network: 
          <a href="https://www.assetbench.co.uk" target="_blank" rel="noopener" class="il-footer-network-link">
            <span>AssetBench 3D Tools</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </a>
        </div>
      </div>
    </div>
  `;

  // Smooth scroll links
  footer.querySelectorAll('a[href^="#"]').forEach((link) => {
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

  return footer;
}
