import { APP_DESCRIPTION } from '../../shared/config/app.js';
import { CATEGORIES, TOOLS, getToolsByCategory } from '../../shared/config/tools.js';
import { ToolCard } from '../../shared/components/ToolCard.js';
import { iconSvg } from '../../shared/utils/icons.js';
import { initCursorSpotlight } from '../../shared/effects/CursorSpotlight.js';
import { mountHeroReveal } from '../../shared/effects/HeroReveal.js';

const BENEFITS = [
  { icon: 'zap', title: 'Works in browser', desc: 'Your files stay on your device' },
  { icon: 'shield', title: 'Fast & private', desc: 'No uploads' },
  { icon: 'gamepad', title: 'Game ready', desc: 'Perfect for Three.js, Unity, Unreal' },
  { icon: 'grid', title: `${TOOLS.length} focused tools`, desc: 'Everything you need in one place' },
];

export function render(container) {
  container.innerHTML = '';

  const hero = HeroSection();
  container.append(hero, WorkbenchIntro(), CategoriesSection(), CTAPanel());

  const disposeSpotlight = initCursorSpotlight(container);
  const disposeHero = mountHeroReveal({
    root: hero.querySelector('.hero-gl'),
    canvasHost: hero.querySelector('.hero-gl-canvas'),
    divider: hero.querySelector('.hero-gl-divider'),
    statsEl: hero.querySelector('.hero-gl-stats'),
    sweepEl: hero.querySelector('.hero-gl-sweep'),
  });

  return () => {
    disposeSpotlight();
    disposeHero();
  };
}

function HeroSection() {
  const hero = document.createElement('section');
  hero.className = 'hero-split container';
  hero.dataset.layoutEditable = '';
  hero.dataset.layoutId = 'home-hero';
  hero.dataset.layoutName = 'Hero';
  hero.setAttribute('data-layout-lock-children', '');

  const content = document.createElement('div');
  content.className = 'hero-split__content';
  content.innerHTML = `
    <div class="hero-split__eyebrow">Prepare &bull; Optimise &bull; Convert &bull; Inspect</div>
    <h1 class="hero-split__title">ASSET <span class="accent">BENCH</span></h1>
    <p class="hero-split__tagline">Small tools. Bigger worlds.</p>
    <p class="hero-split__description">${APP_DESCRIPTION}</p>
    <div class="hero-split__actions">
      <a class="btn btn--primary" href="#/tools">Explore Tools →</a>
      <a class="btn btn--secondary" href="#/optimise-glb">${iconSvg('package-open')} Optimise a GLB</a>
    </div>
    <div class="hero-benefits">
      ${BENEFITS.map(
        (b) => `
        <div class="hero-benefit">
          ${iconSvg(b.icon, { class: 'hero-benefit__icon' })}
          <div>
            <div class="hero-benefit__title">${b.title}</div>
            <div class="hero-benefit__desc">${b.desc}</div>
          </div>
        </div>`
      ).join('')}
    </div>
  `;

  const visual = document.createElement('div');
  visual.className = 'hero-visual';
  visual.dataset.layoutEditable = '';
  visual.dataset.layoutId = 'home-hero-visual';
  visual.dataset.layoutName = 'Interactive Model Visual';
  visual.innerHTML = `
    <div class="hero-gl" role="img" aria-label="An interactive 3D model. Drag to rotate, scroll to zoom, drag the vertical divider to compare solid and wireframe views.">
      <div class="hero-gl-canvas"></div>
      <div class="hero-gl-sweep"></div>
      <div class="hero-gl-divider" tabindex="0" role="slider" aria-label="Solid / wireframe comparison split" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
        <span class="hero-gl-divider-line"></span>
        <span class="hero-gl-divider-handle"></span>
      </div>
      <span class="hero-gl-label hero-gl-label--left">Solid</span>
      <span class="hero-gl-label hero-gl-label--right">Wireframe</span>
      <div class="hero-gl-stats hidden">
        <div class="hero-gl-stats-row"><span data-stat="tris">0</span><label>triangles</label></div>
        <div class="hero-gl-stats-row"><span data-stat="size">—</span><label>file size</label></div>
        <div class="hero-gl-stats-row"><span data-stat="meshes">0</span><label>meshes</label></div>
      </div>
    </div>
  `;

  hero.append(content, visual);
  return hero;
}

function WorkbenchIntro() {
  const section = document.createElement('section');
  section.className = 'workbench-intro container';
  section.innerHTML = `
    <div class="workbench-intro__heading">
      <div class="workbench-intro__eyebrow">The Workbench</div>
      <h2 class="workbench-intro__title">${TOOLS.length} tools to prepare, optimise and inspect your 3D assets</h2>
    </div>
    <p class="workbench-intro__desc">A complete suite of browser-based tools for game-ready assets. Click a tool to get started.</p>
  `;
  return section;
}

function CategoriesSection() {
  const section = document.createElement('section');
  section.className = 'categories container';

  for (const category of CATEGORIES) {
    const tools = getToolsByCategory(category.id);
    if (!tools.length) continue;

    const block = document.createElement('div');
    block.className = 'category-section';
    block.dataset.layoutEditable = '';
    block.dataset.layoutId = `home-category-${category.id}`;
    block.dataset.layoutName = `Category: ${category.label}`;
    block.setAttribute('data-layout-lock-children', '');
    block.style.setProperty('--card-accent', `var(${category.accent})`);

    const header = document.createElement('div');
    header.className = 'category-section__header';
    header.innerHTML = `
      ${iconSvg(category.icon, { class: 'category-section__icon' })}
      <span class="category-section__title">${category.label}</span>
      <span class="category-section__count">${tools.length} tool${tools.length === 1 ? '' : 's'}</span>
    `;

    const grid = document.createElement('div');
    grid.className = 'tool-grid';
    tools.forEach((tool) => grid.appendChild(ToolCard(tool)));

    block.append(header, grid);
    section.appendChild(block);
  }

  return section;
}

function CTAPanel() {
  const panel = document.createElement('section');
  panel.className = 'cta-panel container';
  panel.dataset.layoutEditable = '';
  panel.dataset.layoutId = 'home-cta';
  panel.dataset.layoutName = 'CTA Panel';
  panel.setAttribute('data-layout-lock-children', '');

  panel.innerHTML = `
    <div class="cta-panel__intro">
      <div class="cta-panel__icon">${iconSvg('package-open')}</div>
      <div>
        <div class="cta-panel__title">Ready to get started?</div>
        <div class="cta-panel__desc">Drop a model on the bench and see what you can do.</div>
      </div>
    </div>
    <div class="cta-panel__action">
      <a class="btn btn--primary" href="#/optimise-glb">${iconSvg('package-open')} Optimise a GLB →</a>
      <div class="format-pills">
        <span class="format-pill">GLB</span>
        <span class="format-pill">FBX</span>
        <span class="format-pill">GLTF</span>
        <span class="format-pill">OBJ</span>
      </div>
    </div>
  `;

  return panel;
}
