import { BENTO_BANNER_AFTER, CATEGORIES, PINNED_ORDER, getBentoTools, getOrderedTools, getToolDimension } from '../../shared/config/tools.js';
import { BentoCard, layoutSpans } from '../../shared/components/BentoCard.js';
import { WinnerCard } from '../../shared/components/WinnerCard.js';
import { INSTALL, bindMcpCopy } from '../../shared/components/McpLaunchModal.js';
import { openApiPanel, trackApiEvent } from '../../shared/components/ApiLaunchModal.js';
import { dimensionLegend, escapeHtml } from '../../shared/components/ToolCard.js';
import { iconSvg } from '../../shared/utils/icons.js';
import { cachedUsageCounts, fetchUsageCounts, rankByUsage } from '../../services/UsageService.js';

/** The filter pills, in order. `cat` is the ?cat= value; `match` decides which tools stay. */
const FILTERS = [
  { cat: '', label: 'All', match: () => true },
  ...['inspect', 'build', 'optimise'].map((id) => ({ cat: id, label: CATEGORIES.find((c) => c.id === id).label, match: (tool) => tool.category === id })),
  // A 3D → 2D tool (model in, sprites out) shows under both.
  { cat: '3d', label: '3D', match: (tool) => getToolDimension(tool).id !== '2d' },
  { cat: '2d', label: '2D', match: (tool) => getToolDimension(tool).id !== '3d' },
  { cat: 'mcp', label: 'MCP / Claude-ready', match: (tool) => Boolean(tool.mcp?.length), mcp: true },
];

/** The "Utility" dropdown (?use=), from fields the registry already has. */
const UTILITIES = [
  { use: '', label: 'Any tool', match: () => true },
  { use: 'free', label: 'Free tools', match: (tool) => Boolean(tool.free) },
  { use: 'fbx', label: 'Takes FBX', match: (tool) => Boolean(tool.fbxInput) },
  { use: 'beta', label: 'In beta', match: (tool) => tool.status === 'beta' },
];

const MOBILE = '(max-width: 767px)';

export function render(container) {
  container.innerHTML = '';

  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get('q') ?? '',
    cat: FILTERS.some((f) => f.cat === params.get('cat')) ? params.get('cat') : '',
    use: UTILITIES.some((u) => u.use === params.get('use')) ? params.get('use') : '',
  };

  const page = document.createElement('div');
  page.className = 'bento-page';

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">All Tools</h1>
        <p class="tool-page__description">Every tool on the bench, in one place — newest first, then most used.</p>
        <p class="tool-page__note">We made these tools for game devs. Enjoy!</p>
      </div>
    </div>

    <div class="bento-filters" role="search">
      <label class="bento-filters__search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <span class="visually-hidden">Search tools</span>
        <input type="search" name="q" placeholder="Search tools — GLB, sprites, KTX2, app icons…" autocomplete="off" />
      </label>
      <div class="bento-filters__pills" role="group" aria-label="Filter by category">
        ${FILTERS.map((f) => `<button type="button" class="bento-pill${f.mcp ? ' bento-pill--mcp' : ''}" data-cat="${f.cat}" aria-pressed="false">${escapeHtml(f.label)}</button>`).join('')}
      </div>
      <div class="bento-filters__selects">
        <label class="bento-select"><span class="visually-hidden">Category</span>
          <select name="cat">${FILTERS.map((f) => `<option value="${f.cat}">${f.cat ? escapeHtml(f.label) : 'Category'}</option>`).join('')}</select>
        </label>
        <label class="bento-select"><span class="visually-hidden">Utility</span>
          <select name="use">${UTILITIES.map((u) => `<option value="${u.use}">${u.use ? escapeHtml(u.label) : 'Utility'}</option>`).join('')}</select>
        </label>
      </div>
      <p class="bento-filters__count" aria-live="polite"></p>
      ${dimensionLegend()}
    </div>
  `;

  // One bento section per category, all in the same pattern (see layoutSpans).
  const cards = [];
  const groups = CATEGORIES.map((category) => {
    const group = document.createElement('section');
    group.className = 'bento-group';
    group.setAttribute('aria-labelledby', `bento-group-${category.id}`);
    group.innerHTML = `
      <header class="bento-group__head">
        <span class="bento-group__icon" aria-hidden="true">${iconSvg(category.icon, { class: 'bento-group__icon-svg' })}</span>
        <h2 class="bento-group__title" id="bento-group-${category.id}">${escapeHtml(category.label)}</h2>
        <span class="bento-group__count"></span>
        ${category.blurb ? `<p class="bento-group__blurb">${escapeHtml(category.blurb)}</p>` : ''}
      </header>
      <div class="bento"></div>
    `;
    const grid = group.querySelector('.bento');
    const tools = getBentoTools(category.id);
    const spans = layoutSpans(tools.length);
    const own = tools.map((tool, i) => {
      const card = i === 0 ? featureCard(tool, { first: category.id === CATEGORIES[0].id }) : BentoCard(tool);
      card.style.setProperty('--span-c', spans[i].cols);
      card.style.setProperty('--span-r', spans[i].rows);
      if (i > 0 && spans[i].cols > 4) card.classList.add('bento-card--wide');
      return { tool, card, featured: i === 0 };
    });
    grid.append(...own.map((c) => c.card));
    cards.push(...own);
    return { group, own, count: group.querySelector('.bento-group__count') };
  });

  const banner = McpBanner();
  for (const { group } of groups) {
    section.appendChild(group);
    if (group.getAttribute('aria-labelledby') === `bento-group-${BENTO_BANNER_AFTER}`) section.appendChild(banner);
  }

  const empty = document.createElement('div');
  empty.className = 'bento-empty';
  empty.hidden = true;
  empty.innerHTML = '<p>No tools match that.</p><button type="button" class="btn btn--secondary">Clear filters</button>';
  section.appendChild(empty);

  page.appendChild(section);
  container.appendChild(page);

  // Phones stack one column: in each section the featured tool, then the rest by usage.
  const setMobileOrder = (counts) => {
    const rank = new Map(rankByUsage(getOrderedTools(), counts, PINNED_ORDER).map((tool, i) => [tool.id, i + 1]));
    for (const { tool, card, featured } of cards) card.style.setProperty('--m-order', featured ? 0 : rank.get(tool.id) ?? 99);
  };
  setMobileOrder(cachedUsageCounts());
  // Fresh counts only re-rank where they can't move what's on screen (the desktop grid ignores --m-order).
  fetchUsageCounts().then((counts) => section.isConnected && !matchMedia(MOBILE).matches && setMobileOrder(counts));

  const input = section.querySelector('input[name="q"]');
  const catSelect = section.querySelector('select[name="cat"]');
  const useSelect = section.querySelector('select[name="use"]');
  const count = section.querySelector('.bento-filters__count');

  const apply = () => {
    const filter = FILTERS.find((f) => f.cat === state.cat);
    const utility = UTILITIES.find((u) => u.use === state.use);
    const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = Boolean(state.cat || state.use || words.length);

    let shown = 0;
    for (const { tool, card } of cards) {
      const haystack = searchText(tool);
      const hit = filter.match(tool) && utility.match(tool) && words.every((w) => haystack.includes(w));
      card.hidden = !hit;
      if (hit) shown += 1;
    }
    for (const { group, own, count: groupCount } of groups) {
      const visible = own.filter(({ card }) => !card.hidden).length;
      group.hidden = visible === 0;
      group.querySelector('.bento').classList.toggle('is-filtered', filtered);
      groupCount.textContent = filtered ? `${visible} of ${own.length}` : `${own.length} tools`;
    }
    banner.hidden = filtered && !(state.cat === 'mcp' && !state.use && !words.length);
    empty.hidden = shown > 0;
    count.textContent = filtered ? `Showing ${shown} of ${cards.length} tools` : `${cards.length} tools`;

    section.querySelectorAll('.bento-pill').forEach((pill) => pill.setAttribute('aria-pressed', String(pill.dataset.cat === state.cat)));
    catSelect.value = state.cat;
    useSelect.value = state.use;
    if (input.value !== state.q) input.value = state.q;

    const next = new URLSearchParams();
    if (state.q.trim()) next.set('q', state.q.trim());
    if (state.cat) next.set('cat', state.cat);
    if (state.use) next.set('use', state.use);
    const url = `${location.pathname}${next.size ? `?${next}` : ''}`;
    if (url !== `${location.pathname}${location.search}`) history.replaceState(history.state, '', url);
  };

  input.addEventListener('input', () => { state.q = input.value; apply(); });
  section.querySelectorAll('.bento-pill').forEach((pill) => pill.addEventListener('click', () => { state.cat = pill.dataset.cat; apply(); }));
  catSelect.addEventListener('change', () => { state.cat = catSelect.value; apply(); });
  useSelect.addEventListener('change', () => { state.use = useSelect.value; apply(); });
  empty.querySelector('button').addEventListener('click', () => {
    Object.assign(state, { q: '', cat: '', use: '' });
    apply();
    input.focus();
  });

  apply();
}

/** Each section's lead tool gets the homepage's live-preview card; only the page's first one says "Most used". */
function featureCard(tool, { first }) {
  const card = WinnerCard(tool, first ? {} : { badge: 'Featured' });
  card.classList.add('bento-feature');
  return card;
}

function searchText(tool) {
  const category = CATEGORIES.find((c) => c.id === tool.category)?.label ?? '';
  return [tool.name, tool.description, category, ...(tool.keywords ?? []), ...(tool.features ?? []).map((f) => f.label), ...(tool.mcp ?? [])]
    .join(' ')
    .toLowerCase();
}

/** Full-width banner for the assetbench-mcp server, with the same install line and Copy as its launch popup. */
function McpBanner() {
  const code = INSTALL['claude-code'].code;
  const banner = document.createElement('aside');
  banner.className = 'bento-mcp';
  banner.setAttribute('aria-labelledby', 'bento-mcp-title');
  banner.innerHTML = `
    <div class="bento-mcp__text">
      <span class="bento-mcp__badge">MCP server</span>
      <h2 class="bento-mcp__title" id="bento-mcp-title">Your AI agent can <em>use AssetBench</em></h2>
      <p class="bento-mcp__lede">Works with Claude, Cursor, VS Code and any MCP client. Ask for what you need — tiles marked <span class="bento-card__mcp">MCP</span> can run from your agent.</p>
    </div>
    <div class="bento-mcp__install">
      <div class="bento-mcp__code"><pre><code>${escapeHtml(code)}</code></pre><button type="button" class="bento-mcp__copy">Copy</button></div>
      <div class="bento-mcp__actions">
        <a class="bento-mcp__cta" href="/docs/">Get a free key →</a>
        <a class="bento-mcp__link" href="/docs/">Read the docs</a>
      </div>
    </div>
  `;
  bindMcpCopy(banner.querySelector('.bento-mcp__copy'), () => code);
  banner.querySelector('.bento-mcp__cta').addEventListener('click', (e) => {
    trackApiEvent('mcp_click');
    // Same as the launch popup: open the playground (where the free key is); the href stays as a fallback.
    e.preventDefault();
    openApiPanel();
  });
  return banner;
}
