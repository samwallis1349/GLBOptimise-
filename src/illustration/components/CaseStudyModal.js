/**
 * Case Study Modal Dialog
 * Detailed case-study presentation for illustration projects
 */

export function CaseStudyModal({ onStartProject } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'il-modal-backdrop';
  backdrop.id = 'case-study-modal';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-hidden', 'true');

  backdrop.innerHTML = `
    <div class="il-modal-dialog" tabindex="-1">
      <button class="il-modal-close-btn" aria-label="Close project modal">&times;</button>
      
      <div class="il-modal-media-wrap">
        <img src="" alt="" class="il-modal-img" id="modal-img" />
      </div>

      <div class="il-modal-body">
        <div class="il-modal-meta-row">
          <span class="il-modal-category" id="modal-category"></span>
          <div class="il-modal-palette" id="modal-palette" title="Color Harmony"></div>
        </div>

        <h3 class="il-modal-title" id="modal-title"></h3>
        
        <p class="il-modal-overview" id="modal-overview"></p>

        <h4 class="il-modal-section-h4">Art Direction & Narrative</h4>
        <div class="il-modal-art-direction" id="modal-art-direction"></div>

        <h4 class="il-modal-section-h4">Format & Key Deliverables</h4>
        <ul class="il-modal-deliverables-list" id="modal-deliverables"></ul>

        <div style="font-size: 0.85rem; color: var(--il-text-muted); font-style: italic; margin-bottom: 24px;" id="modal-concept-note"></div>

        <div class="il-modal-footer-cta">
          <div>
            <span style="font-size: 0.82rem; color: var(--il-text-muted); text-transform: uppercase; letter-spacing: 0.08em; display: block;">Format</span>
            <strong style="color: var(--il-text-main);" id="modal-format"></strong>
          </div>
          <button class="il-btn il-btn-primary" id="modal-cta-btn">
            <span>Commission a Similar Project</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const closeBtn = backdrop.querySelector('.il-modal-close-btn');
  const dialog = backdrop.querySelector('.il-modal-dialog');
  const ctaBtn = backdrop.querySelector('#modal-cta-btn');

  function close() {
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function open(project) {
    if (!project) return;
    const img = backdrop.querySelector('#modal-img');
    const category = backdrop.querySelector('#modal-category');
    const title = backdrop.querySelector('#modal-title');
    const overview = backdrop.querySelector('#modal-overview');
    const artDirection = backdrop.querySelector('#modal-art-direction');
    const deliverables = backdrop.querySelector('#modal-deliverables');
    const palette = backdrop.querySelector('#modal-palette');
    const format = backdrop.querySelector('#modal-format');
    const conceptNote = backdrop.querySelector('#modal-concept-note');

    img.src = project.image;
    img.alt = project.title;
    category.textContent = project.category;
    title.textContent = project.title;
    overview.textContent = project.overview;
    artDirection.textContent = project.artDirection;
    format.textContent = project.format || 'Vector & Digital Master';
    conceptNote.textContent = project.conceptNote || '';

    // Deliverables list
    deliverables.innerHTML = (project.deliverables || [])
      .map((item) => `<li class="il-modal-pill">✓ ${item}</li>`)
      .join('');

    // Palette swatches
    palette.innerHTML = (project.palette || [])
      .map((hex) => `<span class="il-palette-swatch" style="background-color: ${hex};" title="${hex}"></span>`)
      .join('');

    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    dialog.focus();
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) {
      close();
    }
  });

  ctaBtn.addEventListener('click', () => {
    close();
    const enquiry = document.querySelector('#enquiry');
    if (enquiry) {
      enquiry.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  backdrop.open = open;
  backdrop.close = close;

  return backdrop;
}
