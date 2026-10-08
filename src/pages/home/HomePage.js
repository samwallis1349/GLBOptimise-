import { APP_DESCRIPTION } from '../../shared/config/app.js';
import { TOOLS, PINNED_MOBILE_TOOLS } from '../../shared/config/tools.js';
import { ToolCard } from '../../shared/components/ToolCard.js';
import { cachedUsageCounts, fetchUsageCounts, rankByUsage } from '../../services/UsageService.js';
import { initCursorSpotlight } from '../../shared/effects/CursorSpotlight.js';
import { iconSvg } from '../../shared/utils/icons.js';
import { openCommandPalette } from '../../shared/effects/CommandPalette.js';
import { SunnyGeckoHero } from './wizard-hero/SunnyGeckoHero.js';
import { DONATE_URL } from '../../shared/config/billing.js';
import { AdSenseAd } from '../../shared/components/AdSenseAd.js';

const BENEFITS = [
  { icon: 'zap', title: 'Works in browser', desc: 'Your files stay on your device' },
  { icon: 'shield', title: 'Fast & private', desc: 'No uploads' },
  { icon: 'gamepad', title: 'Game ready', desc: 'Perfect for Three.js, Unity, Unreal' },
  { icon: 'grid', title: `${TOOLS.length} focused tools`, desc: 'Everything you need in one place' },
];

const LIVE_STATUSES = new Set(['available', 'beta']);

export function render(container) {
  container.innerHTML = '';

  const heroVisual = SunnyGeckoHero();
  // The one homepage ad sits after the tool grid, well clear of the hero and
  // its buttons. AdSenseAd() returns null when ads are off, so nothing renders.
  const ad = AdSenseAd({ placement: 'homepage' });
  container.append(HeroSection(heroVisual.element), WorkbenchIntro(), ToolsBlock(), ...(ad ? [ad] : []), SupportPanel(), CTAPanel());

  const disposeSpotlight = initCursorSpotlight(container);
  const disposeHero = heroVisual.mount();

  return () => {
    disposeSpotlight();
    disposeHero();
  };
}

function HeroSection(wizardEl) {
  const hero = document.createElement('section');
  hero.className = 'hero-split container';
  hero.dataset.layoutEditable = '';
  hero.dataset.layoutId = 'home-hero';
  hero.dataset.layoutName = 'Hero';
  hero.setAttribute('data-layout-lock-children', '');

  const liveCount = TOOLS.filter((t) => LIVE_STATUSES.has(t.status)).length;
  const quickTools = TOOLS.filter((t) => LIVE_STATUSES.has(t.status)).sort((a,b) => Number(b.id === 'thumbnail-maker') - Number(a.id === 'thumbnail-maker')).slice(0, 5);
  const shortcut = navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl K';

  const content = document.createElement('div');
  content.className = 'hero-split__content';
  content.innerHTML = `
    <div class="hero-split__eyebrow">Prepare &bull; Optimise &bull; Convert &bull; Inspect</div>
    <h1 class="hero-split__title">ASSET <span class="accent">BENCH</span></h1>
    <p class="hero-split__tagline">Small tools. Bigger worlds.</p>
    <p class="hero-split__description">${APP_DESCRIPTION}</p>
    <div class="hero-finder">
      <button type="button" class="hero-finder__search" aria-label="Search Asset Bench tools">
        ${iconSvg('search', { class: 'hero-finder__icon' })}
        <span class="hero-finder__placeholder">What do you need to do?<span class="hero-finder__placeholder-more"> Search ${TOOLS.length} tools…</span></span>
        <kbd class="hero-finder__kbd">${shortcut}</kbd>
      </button>
      <div class="hero-finder__quick" aria-label="Popular tools">
        ${quickTools
          .map((t) => `<a class="hero-finder__chip" href="${t.route}">${iconSvg(t.icon, { class: 'hero-finder__chip-icon' })}${t.name}</a>`)
          .join('')}
        <a class="hero-finder__chip hero-finder__chip--all" href="/tools">All ${liveCount} live tools →</a>
      </div>
    </div>
    <div class="hero-split__actions">
      <a class="btn btn--primary" href="/tools">Explore Tools →</a>
      <a class="btn btn--secondary" href="/optimise-glb">${iconSvg('package-open')} Optimise a GLB</a>
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
  content.querySelector('.hero-finder__search').addEventListener('click', () => openCommandPalette());

  hero.append(content, wizardEl);
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

function ToolsBlock() {
  const section = document.createElement('section');
  section.className = 'home-tools container';
  section.dataset.layoutEditable = '';
  section.dataset.layoutId = 'home-tools';
  section.dataset.layoutName = 'Tools';
  section.setAttribute('data-layout-lock-children', '');

  const grid = document.createElement('div');
  grid.className = 'tool-grid';
  // Most-used first, registry order (Thumbnail Maker leading) breaking ties.
  const byDefault = [...TOOLS].sort((a, b) => Number(b.id === 'thumbnail-maker') - Number(a.id === 'thumbnail-maker'));
  const fill = (counts) => {
    const tools = rankByUsage(byDefault, counts, PINNED_MOBILE_TOOLS);
    grid.replaceChildren(...tools.map((tool, index) => ToolCard(tool, { index: index + 1, featured: Boolean(tool.banner) })));
  };
  fill(cachedUsageCounts());
  fetchUsageCounts().then((counts) => grid.isConnected && fill(counts));
  section.appendChild(grid);

  return section;
}

/** Generic donate ask between the tools and the closing CTA. */
function SupportPanel() {
  const panel = document.createElement('section');
  panel.className = 'cta-panel support-panel container';
  panel.dataset.layoutEditable = '';
  panel.dataset.layoutId = 'home-support';
  panel.dataset.layoutName = 'Support Panel';
  panel.setAttribute('data-layout-lock-children', '');

  panel.innerHTML = `
    <div class="cta-panel__intro">
      <div class="cta-panel__icon support-panel__icon" aria-hidden="true">${iconSvg('heart')}</div>
      <div>
        <div class="cta-panel__title">Support the tools</div>
        <div class="cta-panel__desc">Asset Bench is built and run independently. A small donation keeps the tools free, fast and growing.</div>
      </div>
    </div>
    <div class="cta-panel__action">
      <a class="btn btn--secondary support-panel__button" href="${DONATE_URL}" target="_blank" rel="noopener">${iconSvg('heart')} Support the tools <span aria-hidden="true">→</span></a>
    </div>
  `;

  return panel;
}

function CTAPanel() {
  const panel = document.createElement('section');
  panel.className = 'cta-panel cta-panel--start container';
  panel.dataset.layoutEditable = '';
  panel.dataset.layoutId = 'home-cta';
  panel.dataset.layoutName = 'CTA Panel';
  panel.setAttribute('data-layout-lock-children', '');

  panel.innerHTML = `
    <div class="cta-panel__intro">
      <div class="cta-panel__icon" aria-hidden="true">${iconSvg('package-open')}</div>
      <div>
        <div class="cta-panel__title">Ready to get started?</div>
        <div class="cta-panel__desc">Drop a model on the bench and see what you can do.</div>
      </div>
    </div>
    <div class="cta-panel__action">
      <a class="btn btn--primary" href="/optimise-glb">${iconSvg('package-open')} Optimise a GLB →</a>
      <div class="cta-panel__formats">GLB <span>·</span> glTF <span>·</span> FBX <span>·</span> OBJ</div>
    </div>
  `;

  const formats = panel.querySelector('.cta-panel__formats');
  formats.classList.add('format-pills');
  formats.replaceChildren(...['GLB', 'FBX', 'GLTF', 'OBJ'].map((format) => {
    const pill = document.createElement('span');
    pill.className = 'format-pill';
    pill.textContent = format;
    return pill;
  }));

  return panel;
}
