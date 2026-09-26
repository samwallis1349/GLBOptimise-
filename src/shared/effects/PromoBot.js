import { TOOLS } from '../config/tools.js';
import { CHECKOUT_URL, LIFETIME_PRICE_LABEL, freeDaysRemaining, hasAccess, isFreePeriodActive } from '../config/billing.js';
import { hasStoredLicense } from '../../services/LicenseService.js';
import { navigate } from '../../app/router.js';
import { iconSvg } from '../utils/icons.js';
import { openCommandPalette } from './CommandPalette.js';

/**
 * "Bench Bot" — a small floating helper that points visitors at the right
 * tool and nudges toward the lifetime license. Entirely rule-based: it
 * matches what the visitor types against the TOOLS registry plus a few
 * canned FAQ intents, so there's no API, no cost and nothing leaves the
 * browser. Mounted once from App.js, outside the router's DOM, like the
 * command palette.
 */

const NUDGE_KEY = 'assetbench.promoBot.nudged';
const NUDGE_DELAY_MS = 25_000;
const MAX_TOOL_SUGGESTIONS = 3;

// Goal phrases that don't literally appear in the registry keywords.
const GOAL_HINTS = [
  { pattern: /smaller|too big|file size|\d+ ?mb|heavy|large|shrink|compress/, tools: ['optimise-glb', 'compress-textures'] },
  { pattern: /poly|triangle|tris|decimat|simplif|low ?poly|high ?poly/, tools: ['reduce-polys', 'generate-lods'] },
  { pattern: /lod|distance|far away/, tools: ['generate-lods'] },
  { pattern: /texture|image|4k|2k|resolution|ktx|webp/, tools: ['compress-textures', 'texture-resizer', 'pack-pbr'] },
  { pattern: /anim|clip|keyframe|mixamo/, tools: ['strip-animations', 'animation-inspector', 'animation-optimiser'] },
  { pattern: /rig|bone|skelet|skin/, tools: ['rig-inspector'] },
  { pattern: /thumbnail|preview image|screenshot|render|icon/, tools: ['thumbnail-maker'] },
  { pattern: /pbr|roughness|metal|ao\b|orm|channel/, tools: ['pack-pbr'] },
  { pattern: /fbx|obj|usdz|convert|format/, tools: ['convert-files'] },
  { pattern: /inspect|what'?s (in|inside)|debug|broken|check|validat|structure|hierarch/, tools: ['inspect-glb', 'asset-report'] },
  { pattern: /compare|diff|before|after|versus|\bvs\b|which is better/, tools: ['asset-compare'] },
  { pattern: /report|audit|library|batch|folder|csv|score|budget|game ?ready/, tools: ['asset-report', 'inspect-glb'] },
];

const QUICK_REPLIES = [
  { label: 'Make my GLB smaller', text: 'make my glb smaller' },
  { label: 'Too many polygons', text: 'too many polygons' },
  { label: 'Textures too big', text: 'textures too big' },
  { label: 'Clean up animations', text: 'animations' },
  { label: 'How much is it?', text: 'price' },
];

let root = null;
let panel = null;
let log = null;
let input = null;
let launcher = null;
let nudge = null;
let initialized = false;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function toolById(id) {
  return TOOLS.find((t) => t.id === id) ?? null;
}

function isLive(tool) {
  return tool.status === 'available' || tool.status === 'beta';
}

function pricePitch() {
  if (hasStoredLicense()) return "You've got a lifetime license — every tool is unlocked for good. Thanks for backing Asset Bench!";
  if (isFreePeriodActive()) {
    const days = freeDaysRemaining();
    return `Everything is free for the next ${days} day${days === 1 ? '' : 's'}. After that it's ${LIFETIME_PRICE_LABEL} once — no subscription, every tool, forever.`;
  }
  return `Asset Bench is ${LIFETIME_PRICE_LABEL} once for lifetime access to every tool — no subscription, and your files never leave your browser.`;
}

/** Scores tools against the message: goal hints first, then registry text overlap. */
function matchTools(text) {
  const scores = new Map();
  const bump = (id, amount) => scores.set(id, (scores.get(id) || 0) + amount);

  for (const hint of GOAL_HINTS) {
    if (hint.pattern.test(text)) hint.tools.forEach((id, i) => bump(id, 10 - i));
  }

  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  for (const tool of TOOLS) {
    const haystack = [tool.name, tool.description, ...(tool.keywords || [])].join(' ').toLowerCase();
    for (const word of words) if (haystack.includes(word)) bump(tool.id, 1);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => toolById(id))
    .filter(Boolean)
    .slice(0, MAX_TOOL_SUGGESTIONS);
}

/** Turns a visitor message into a bot reply: { text, tools?, actions? }. */
function reply(raw) {
  const text = raw.toLowerCase().trim();

  if (/^(hi|hey|hello|yo|sup|help)\b/.test(text)) {
    return { text: 'Hey! Tell me what you need to do with your 3D asset and I\'ll point you at the right tool.', quick: true };
  }
  if (/price|cost|pay|buy|licen[cs]e|£|\$|free|trial|subscri|how much/.test(text)) {
    return { text: pricePitch(), actions: ['buy', 'pricing'] };
  }
  if (/upload|privacy|private|safe|secure|server|data|cloud/.test(text)) {
    return { text: 'Nothing gets uploaded. Every tool runs right here in your browser, so your models stay on your device.' };
  }
  if (/unity|unreal|godot|three|babylon|engine|roblox|web/.test(text)) {
    return {
      text: 'Asset Bench outputs standard GLB/glTF, which drops straight into Three.js, Babylon, Godot, Unity (with glTFast) and Unreal (with the glTF importer).',
      tools: [toolById('optimise-glb')].filter(Boolean),
    };
  }

  const tools = matchTools(text);
  if (tools.length) {
    const live = tools.filter(isLive);
    const lead = live.length
      ? `Try ${live.length === 1 ? 'this' : 'these'} — ${hasAccess() ? 'free to use right now' : `unlocked with a ${LIFETIME_PRICE_LABEL} lifetime license`}:`
      : "That one's on the way — here's what's coming:";
    return { text: lead, tools };
  }

  return {
    text: "I'm not sure which tool fits that. Try describing the problem (\"file too big\", \"too many triangles\"), or search every tool:",
    actions: ['search'],
    quick: true,
  };
}

function toolCardHtml(tool) {
  const live = isLive(tool);
  return `
    <button type="button" class="promo-bot__tool" data-tool="${escapeHtml(tool.id)}">
      <span class="promo-bot__tool-icon">${iconSvg(tool.icon)}</span>
      <span class="promo-bot__tool-text">
        <span class="promo-bot__tool-name">${escapeHtml(tool.name)}${live ? '' : ' <em>Coming soon</em>'}</span>
        <span class="promo-bot__tool-desc">${escapeHtml(tool.description)}</span>
      </span>
    </button>`;
}

const ACTIONS = {
  buy: () => `<a class="promo-bot__action promo-bot__action--primary" href="${CHECKOUT_URL}" target="_blank" rel="noopener">Get lifetime access — ${LIFETIME_PRICE_LABEL}</a>`,
  pricing: () => '<button type="button" class="promo-bot__action" data-nav="/pricing">See pricing</button>',
  search: () => '<button type="button" class="promo-bot__action" data-search>Search all tools</button>',
};

function addMessage(from, { text, tools = [], actions = [], quick = false }) {
  const msg = document.createElement('div');
  msg.className = `promo-bot__msg promo-bot__msg--${from}`;
  msg.innerHTML = `
    <p>${escapeHtml(text)}</p>
    ${tools.length ? `<div class="promo-bot__tools">${tools.map(toolCardHtml).join('')}</div>` : ''}
    ${actions.length ? `<div class="promo-bot__actions">${actions.map((a) => ACTIONS[a]()).join('')}</div>` : ''}
    ${quick ? `<div class="promo-bot__chips">${QUICK_REPLIES.map((q) => `<button type="button" class="promo-bot__chip" data-say="${escapeHtml(q.text)}">${escapeHtml(q.label)}</button>`).join('')}</div>` : ''}
  `;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

function say(text) {
  if (!text.trim()) return;
  addMessage('user', { text });
  // A beat of "thinking" so replies don't feel like they appear before you've finished reading your own.
  setTimeout(() => addMessage('bot', reply(text)), 280);
}

function build() {
  root = document.createElement('div');
  root.className = 'promo-bot';

  launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'promo-bot__launcher';
  launcher.setAttribute('aria-label', 'Open Bench Bot helper');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = iconSvg('wand-2');

  panel = document.createElement('div');
  panel.className = 'promo-bot__panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Bench Bot');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="promo-bot__header">
      <span class="promo-bot__avatar">${iconSvg('wand-2')}</span>
      <span class="promo-bot__title">Bench Bot<small>Finds the right tool for your asset</small></span>
      <button type="button" class="promo-bot__close" aria-label="Close">&times;</button>
    </div>
    <div class="promo-bot__log" aria-live="polite"></div>
    <form class="promo-bot__form">
      <input class="promo-bot__input" type="text" placeholder="e.g. my model is 40 MB…" autocomplete="off" aria-label="Message Bench Bot" />
      <button type="submit" class="promo-bot__send" aria-label="Send">&rarr;</button>
    </form>
  `;

  log = panel.querySelector('.promo-bot__log');
  input = panel.querySelector('.promo-bot__input');

  root.append(panel, launcher);
  document.body.appendChild(root);

  launcher.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.querySelector('.promo-bot__close').addEventListener('click', close);
  panel.querySelector('.promo-bot__form').addEventListener('submit', (e) => {
    e.preventDefault();
    say(input.value);
    input.value = '';
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  log.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-say]');
    if (chip) return say(chip.dataset.say);
    const tool = e.target.closest('[data-tool]');
    if (tool) {
      navigate(toolById(tool.dataset.tool).route);
      return close();
    }
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      navigate(nav.dataset.nav);
      return close();
    }
    if (e.target.closest('[data-search]')) {
      close();
      openCommandPalette();
    }
  });

  addMessage('bot', {
    text: `Hi, I'm Bench Bot. What are you trying to do with your model? ${isFreePeriodActive() && !hasStoredLicense() ? `(Heads up: everything's free for ${freeDaysRemaining()} more day${freeDaysRemaining() === 1 ? '' : 's'}.)` : ''}`.trim(),
    quick: true,
  });
}

function open() {
  dismissNudge();
  panel.hidden = false;
  launcher.setAttribute('aria-expanded', 'true');
  root.classList.add('is-open');
  input.focus();
}

function close() {
  panel.hidden = true;
  launcher.setAttribute('aria-expanded', 'false');
  root.classList.remove('is-open');
  launcher.focus();
}

function dismissNudge() {
  nudge?.remove();
  nudge = null;
  try {
    sessionStorage.setItem(NUDGE_KEY, '1');
  } catch {
    /* storage unavailable — worst case the nudge shows again next page load */
  }
}

/** One gentle speech bubble per session, only for visitors without a license. */
function scheduleNudge() {
  if (hasStoredLicense()) return;
  try {
    if (sessionStorage.getItem(NUDGE_KEY) === '1') return;
  } catch {
    return;
  }

  setTimeout(() => {
    if (!panel.hidden || nudge) return;
    nudge = document.createElement('div');
    nudge.className = 'promo-bot__nudge';
    nudge.innerHTML = `
      <button type="button" class="promo-bot__nudge-text">${escapeHtml(
        isFreePeriodActive()
          ? `Free for ${freeDaysRemaining()} more day${freeDaysRemaining() === 1 ? '' : 's'} — want help picking a tool?`
          : 'Not sure which tool you need? Ask me.',
      )}</button>
      <button type="button" class="promo-bot__nudge-close" aria-label="Dismiss">&times;</button>
    `;
    nudge.querySelector('.promo-bot__nudge-text').addEventListener('click', open);
    nudge.querySelector('.promo-bot__nudge-close').addEventListener('click', dismissNudge);
    root.insertBefore(nudge, launcher);
  }, NUDGE_DELAY_MS);
}

export function initPromoBot() {
  if (initialized) return;
  initialized = true;
  build();
  scheduleNudge();
}
