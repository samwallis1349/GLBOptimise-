import { APP_DESCRIPTION } from '../../shared/config/app.js';
import { GAME_2D_GROUPS, PINNED_ORDER, TOOLS, getOrderedTools, getToolById } from '../../shared/config/tools.js';
import { dimensionLegend } from '../../shared/components/ToolCard.js';
import { BentoCard, layoutSpans } from '../../shared/components/BentoCard.js';
import { WinnerCard } from '../../shared/components/WinnerCard.js';
import { cachedUsageCounts, fetchUsageCounts, rankByUsage } from '../../services/UsageService.js';
import { initCursorSpotlight } from '../../shared/effects/CursorSpotlight.js';
import { iconSvg } from '../../shared/utils/icons.js';
import { openCommandPalette } from '../../shared/effects/CommandPalette.js';
import { ColossusHero } from './wizard-hero/ColossusHero.js';
import { TripoBanner } from '../../shared/components/TripoBanner.js';
import { DONATE_URL, PRICE_LABEL, TEAM_PRICE_LABEL } from '../../shared/config/billing.js';
import { TOOL_PRICE_LABEL } from '../../shared/config/toolProducts.js';
import { AdSenseAd } from '../../shared/components/AdSenseAd.js';
import { HomeBannerPost } from '../../shared/components/HomeBannerPost.js';
import { VsCodeApi } from './vscode-api/VsCodeApi.js';
import { openExtensionsModal, EXTENSION_ICON } from '../../shared/components/ExtensionsModal.js';

const BENEFITS = [
  { icon: 'zap', title: 'Works in browser', desc: 'Your files stay on your device' },
  { icon: 'shield', title: 'One subscription', desc: `Every tool for ${PRICE_LABEL}` },
  { icon: 'gamepad', title: 'Game ready', desc: 'Perfect for Three.js, Unity, Unreal' },
  { icon: 'grid', title: `${TOOLS.length} focused tools`, desc: 'Everything you need in one place' },
];

const LIVE_STATUSES = new Set(['available', 'beta']);

export function render(container) {
  container.innerHTML = '';

  const heroVisual = ColossusHero();
  // The one homepage ad sits below the API section, clear of the hero and the
  // pricing strip. AdSenseAd() returns null when ads are off, so nothing renders.
  const ad = AdSenseAd({ placement: 'homepage' });
  container.append(
    TripoBanner(),
    HeroSection(heroVisual.element),
    WorkbenchIntro(),
    ToolsBlock(),
    IsoAssetsBlock(),
    PricingStrip(),
    VsCodeApi(),
    HomeBannerPost(),
    ...(ad ? [ad] : []),
    SupportPanel(),
    CTAPanel()
  );

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
            <button type="button" class="btn hero-split__extensions">${EXTENSION_ICON} Web extensions/Browser plugins <span class="hero-split__extensions-tag">New</span></button>
      <button type="button" class="hero-split__free">Free 3D model ↓</button>
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
  content.querySelector('.hero-split__extensions').addEventListener('click', () => openExtensionsModal());
  content.querySelector('.hero-split__free').addEventListener('click', () => {
    const form = document.getElementById('free-model');
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    form?.querySelector('input')?.focus({ preventScroll: true });
  });

  hero.append(content, wizardEl);
  return hero;
}

function WorkbenchIntro() {
  const section = document.createElement('section');
  section.className = 'workbench-intro container';
  section.innerHTML = `
    <div class="workbench-intro__heading">
      <div class="workbench-intro__eyebrow">The Workbench</div>
      <h2 class="workbench-intro__title">${TOOLS.length} tools to prepare, optimise and inspect your 2D and 3D assets</h2>
    </div>
    <p class="workbench-intro__desc">A complete suite of browser-based tools for game-ready assets. Click a tool to get started.</p>
    ${dimensionLegend()}
  `;
  return section;
}

function ToolsBlock() {
  const section = document.createElement('section');
  section.className = 'home-tools home-bento container';
  section.dataset.layoutEditable = '';
  section.dataset.layoutId = 'home-tools';
  section.dataset.layoutName = 'Tools';
  section.setAttribute('data-layout-lock-children', '');

  const grid = document.createElement('div');
  grid.className = 'bento';
  // The /tools bento pattern on one ranked list: PINNED_ORDER first, in that
  // fixed order (the first takes the big live-preview panel), then every other
  // tool by usage.
  const fill = (counts) => {
    const tools = rankByUsage(getOrderedTools(), counts, PINNED_ORDER);
    const spans = layoutSpans(tools.length);
    grid.replaceChildren(...tools.map((tool, index) => {
      const card = index === 0 ? WinnerCard(tool) : BentoCard(tool);
      if (index === 0) card.classList.add('bento-feature');
      else if (spans[index].cols > 4) card.classList.add('bento-card--wide');
      card.style.setProperty('--span-c', spans[index].cols);
      card.style.setProperty('--span-r', spans[index].rows);
      return card;
    }));
  };
  fill(cachedUsageCounts());
  fetchUsageCounts().then((counts) => grid.isConnected && fill(counts));
  section.appendChild(grid);

  return section;
}

/** "Isometric game assets": the iso tools together, under the main grid (GAME_2D_GROUPS isometric). */
function IsoAssetsBlock() {
  const group = GAME_2D_GROUPS.find((g) => g.id === 'isometric');
  const tools = (group?.tools ?? []).map(getToolById).filter(Boolean);
  const section = document.createElement('section');
  section.className = 'home-iso home-bento container';
  section.dataset.layoutEditable = '';
  section.dataset.layoutId = 'home-iso';
  section.dataset.layoutName = 'Isometric game assets';
  if (!tools.length) return section;
  section.innerHTML = `
    <div class="home-iso__head">
      <div>
        <p class="home-iso__eyebrow">2:1 isometric · sprites · scenes</p>
        <h2 class="home-iso__title">${group.label}</h2>
        <p class="home-iso__lede">${group.description}</p>
      </div>
      <a class="btn btn--secondary home-iso__more" href="/2d-games#isometric">All 2D &amp; iso tools →</a>
    </div>
  `;
  const grid = document.createElement('div');
  grid.className = 'bento home-iso__grid';
  grid.replaceChildren(...tools.map(BentoCard));
  section.appendChild(grid);
  return section;
}

/** The three ways to pay, straight after the tools, linking to the full pricing page. */
function PricingStrip() {
  const strip = document.createElement('section');
  strip.className = 'pricing-strip container';
  strip.dataset.layoutEditable = '';
  strip.dataset.layoutId = 'home-pricing-strip';
  strip.dataset.layoutName = 'Pricing Strip';
  strip.innerHTML = `
    <a class="pricing-strip__item" href="/pricing"><span>Free trial</span><b>£0</b><small>every tool, no card</small></a>
    <a class="pricing-strip__item" href="/pricing"><span>Single tool</span><b>${TOOL_PRICE_LABEL}</b><small>pay once</small></a>
    <a class="pricing-strip__item pricing-strip__item--featured" href="/pricing"><span>All Access</span><b>${PRICE_LABEL}</b><small>every tool + the API</small></a>
    <a class="pricing-strip__item" href="/pricing"><span>Team</span><b>${TEAM_PRICE_LABEL}</b><small>25 machines + 5,000 API ops</small></a>
  `;
  return strip;
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
