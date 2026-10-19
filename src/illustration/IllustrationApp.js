/**
 * Master Illustration App Container
 * Mounts the complete portfolio experience for Studio Wallis
 */
import './illustration.css';
import { IllustrationNav } from './components/IllustrationNav.js';
import { HeroSection } from './components/HeroSection.js';
import { TrustLogosSection } from './components/TrustLogosSection.js';
import { PortfolioGrid } from './components/PortfolioGrid.js';
import { FeaturedShowcase } from './components/FeaturedShowcase.js';
import { ServicesSection } from './components/ServicesSection.js';
import { AboutSection } from './components/AboutSection.js';
import { EnquirySection } from './components/EnquirySection.js';
import { IllustrationFooter } from './components/IllustrationFooter.js';
import { CaseStudyModal } from './components/CaseStudyModal.js';
import { STUDIO_INFO } from './config/portfolioData.js';

export function IllustrationApp(rootEl) {
  if (!rootEl) return;

  // Set document head metadata
  document.title = `${STUDIO_INFO.name} — Graphic Design & Illustration`;
  
  const setMeta = (selector, attr, val) => {
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      const [attrKey, attrVal] = selector.replace(/[\[\]]/g, '').split('=');
      el.setAttribute(attrKey, attrVal.replace(/"/g, ''));
      document.head.appendChild(el);
    }
    el.setAttribute(attr, val);
  };

  setMeta('meta[name="description"]', 'content', `${STUDIO_INFO.subheading} Portfolio of ${STUDIO_INFO.artistName}.`);
  setMeta('meta[property="og:title"]', 'content', `${STUDIO_INFO.name} — Graphic Design & Illustration`);
  setMeta('meta[property="og:description"]', 'content', STUDIO_INFO.subheading);
  setMeta('meta[property="og:image"]', 'content', 'https://illustrator.assetbench.co.uk/illustration/hero-world.jpg');
  setMeta('meta[property="og:url"]', 'content', 'https://illustrator.assetbench.co.uk/');

  // Clear root and prepare wrapper
  rootEl.innerHTML = '';
  const siteWrapper = document.createElement('div');
  siteWrapper.className = 'il-site';

  // Instantiate modal dialog
  const modal = CaseStudyModal();

  // Build structure
  siteWrapper.appendChild(IllustrationNav());
  
  const main = document.createElement('main');
  main.appendChild(HeroSection());
  main.appendChild(TrustLogosSection({
    onSelectLogo: (logo) => modal.open({
      title: logo.title,
      category: logo.category,
      image: logo.image,
      overview: logo.description,
      artDirection: logo.notes || 'Full vector master file and production-ready export assets for web, social and print.',
      deliverables: logo.deliverables || ['Primary Logo Master', 'High-Res Transparent PNG', 'Dark & Light Variants', 'Vector SVG/PDF Master'],
      palette: logo.palette || [logo.accent || '#10100E', '#F7F6F2', '#4B5563'],
      format: logo.format || 'Vector Logo & Brand Asset Suite',
      conceptNote: logo.badge,
    }),
  }));
  main.appendChild(PortfolioGrid({
    onSelectProject: (project) => modal.open(project),
  }));
  main.appendChild(FeaturedShowcase());
  main.appendChild(ServicesSection());
  main.appendChild(AboutSection());
  main.appendChild(EnquirySection());
  
  siteWrapper.appendChild(main);
  siteWrapper.appendChild(IllustrationFooter());
  siteWrapper.appendChild(modal);

  rootEl.appendChild(siteWrapper);

  // Setup Scroll Reveal Intersection Observer
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('il-revealed');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      root: null,
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  siteWrapper.querySelectorAll('.il-reveal').forEach((el) => {
    observer.observe(el);
  });
}
