import {
  CHECKOUT_URL,
  DISCOUNT_CODE,
  LICENSE_MACHINE_LIMIT,
  PRICE_LABEL,
  MY_ORDERS_URL,
  TEAM_CHECKOUT_URL,
  TEAM_MACHINES,
  TEAM_PRICE_LABEL,
  TRIAL_DAYS,
  isFreePeriodActive,
  freeDaysRemaining,
} from '../../shared/config/billing.js';
import { initTrial } from '../../services/TrialService.js';
import { deactivateLicense, deactivateToolLicense, getStoredLicense, getToolLicenses } from '../../services/LicenseService.js';
import { TOOLS } from '../../shared/config/tools.js';
import { TOOL_DEVICE_LIMIT, TOOL_PRICE_LABEL, toolProduct } from '../../shared/config/toolProducts.js';
import { LicenseActivationForm } from '../../shared/components/LicenseActivationForm.js';
import { splashHero } from '../../shared/components/WelcomeOffer.js';
import { refundNoticeHtml } from '../../shared/components/RefundNotice.js';
import { PlanCard, monthlyPriceHtml } from '../../shared/components/PlanCard.js';

function maskKey(key) {
  return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key;
}

/** Panel for a visitor who already has a license on this machine. */
function licensedPanel(license, onChange) {
  const panel = document.createElement('div');
  panel.className = 'panel panel--elevated pricing-card';

  const limit = license.limit || LICENSE_MACHINE_LIMIT;
  const usage = license.usage ? `This key is active on ${license.usage} of ${limit} machines.` : `One key works on up to ${limit} machines.`;

  panel.innerHTML = `
    <p><strong>All Access active — every tool and the Cloud API are unlocked.</strong></p>
    <p class="text-secondary" style="margin-top: var(--space-3);">
      Key <code>${maskKey(license.key)}</code>. ${usage}
      This same licence key also works as your <a href="/docs/">Cloud API key</a> (1,000 operations/month).
      Moving to a new computer? Remove this machine first to free up its slot.
    </p>
    <button type="button" class="btn btn--secondary" style="margin-top: var(--space-4);">Remove this machine</button>
    <p class="pricing-manage-row"><a class="pricing-manage" href="${MY_ORDERS_URL}" target="_blank" rel="noopener">Cancel or manage your subscription ↗</a></p>
    <p class="license-form__status" role="status"></p>
  `;

  const button = panel.querySelector('button');
  const status = panel.querySelector('.license-form__status');
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.className = 'license-form__status';
    status.textContent = 'Removing...';
    const result = await deactivateLicense();
    if (result.ok) {
      onChange();
    } else {
      button.disabled = false;
      status.classList.add('license-form__status--error');
      status.textContent = result.error;
    }
  });

  return panel;
}

/** Single-tool keys active in this browser, each removable so it can move elsewhere. */
function toolKeysPanel(licenses, onChange) {
  const panel = document.createElement('div');
  panel.className = 'panel pricing-card pricing-tool-keys';
  panel.innerHTML = '<p><strong>Single-tool keys on this browser</strong></p>';

  for (const { toolId, key } of licenses) {
    const name = TOOLS.find((tool) => tool.id === toolId)?.name ?? toolId;
    const row = document.createElement('div');
    row.className = 'pricing-tool-keys__row';
    row.innerHTML = `
      <span>${name} <code>${maskKey(key)}</code></span>
      <button type="button" class="btn btn--secondary">Remove from this browser</button>
      <p class="license-form__status" role="status"></p>
    `;
    const button = row.querySelector('button');
    const status = row.querySelector('.license-form__status');
    button.addEventListener('click', async () => {
      button.disabled = true;
      status.className = 'license-form__status';
      status.textContent = 'Removing...';
      const result = await deactivateToolLicense(toolId);
      if (result.ok) {
        onChange();
      } else {
        button.disabled = false;
        status.classList.add('license-form__status--error');
        status.textContent = result.error;
      }
    });
    panel.appendChild(row);
  }
  return panel;
}

/** Single tool: pick a tool, buy just that one. Hidden until a single-tool checkout is set up. */
function singleToolCard() {
  const tools = TOOLS.filter((t) => t.status === 'available' || t.status === 'beta').filter((t) => toolProduct(t.id));
  if (!tools.length) return null;
  const card = PlanCard({
    title: 'Single tool',
    lede: 'For when you only need one job done, again and again',
    head: 'One tool, unlocked for good',
    lines: [`= pick any of ${tools.length} tools`, `= on your phone and computer (${TOOL_DEVICE_LIMIT} devices)`],
    price: `<b>${TOOL_PRICE_LABEL}</b> once, no subscription`,
    cta: 'Unlock this tool',
    ctaHref: toolProduct(tools[0].id).checkoutUrl,
    renews: 'Pay once. Yours to keep.',
    features: [
      'Unlimited use of that tool',
      'Runs in your browser, files stay on your device',
      'Unlocks its browser extension too, if it has one',
      'Upgrade to All Access any time',
      { text: 'Every other tool', off: true },
      { text: 'Cloud API operations', off: true },
    ],
    tone: 'plain',
  });
  const select = document.createElement('select');
  select.className = 'plan-card__select';
  select.setAttribute('aria-label', 'Tool to unlock');
  select.innerHTML = tools.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
  const cta = card.querySelector('.plan-card__cta');
  select.addEventListener('change', () => { cta.href = toolProduct(select.value).checkoutUrl; });
  card.querySelector('.plan-card__price').after(select);
  return card;
}

/** All Access, the featured plan. */
function allAccessCard() {
  const free = isFreePeriodActive();
  const days = freeDaysRemaining();
  const card = PlanCard({
    title: free ? `${TRIAL_DAYS}-day free All Access` : 'All Access',
    badge: 'API',
    lede: 'For anyone preparing 3D, image and app assets, in the browser or from code',
    head: 'Every tool + 1,000 API operations/month',
    lines: [`= ${TOOLS.length} browser tools, unrestricted`, '= one licence key for the tools and the API'],
    price: free ? `<b class="is-free">£0</b>for ${days} more day${days === 1 ? '' : 's'}, then ${PRICE_LABEL}` : monthlyPriceHtml(PRICE_LABEL),
    cta: free ? 'Get All Access' : 'Get All Access',
    ctaHref: CHECKOUT_URL,
    renews: free ? `No card needed for the trial. Subscribe any time for ${PRICE_LABEL}.` : `${PRICE_LABEL}, cancel any time`,
    features: [
      `Every current and future browser tool (${TOOLS.length} today)`,
      '1,000 Cloud API operations/month, same key',
      'Every browser extension unlocked, same key (extensions do not use up a machine)',
      `One key on up to ${LICENSE_MACHINE_LIMIT} machines`,
      'Cancel any time; a failed payment cancels it, never owing',
      { text: `Team key for ${TEAM_MACHINES} machines`, off: true },
    ],
    tone: 'amber',
  });
  const title = card.querySelector('.plan-card__title');
  title.insertAdjacentHTML('beforeend', '<span class="plan-card__badge plan-card__badge--star">★ Recommended</span>');
  return card;
}

/** Team: every tool + the API's Studio allowance on one key (billing.js TEAM_*). */
function teamCard() {
  // Per-machine cost vs All Access, worked out from the real prices.
  const perAll = parseFloat(PRICE_LABEL.replace(/[^\d.]/g, '')) / LICENSE_MACHINE_LIMIT;
  const perTeam = parseFloat(TEAM_PRICE_LABEL.replace(/[^\d.]/g, '')) / TEAM_MACHINES;
  const saving = Math.floor((1 - perTeam / perAll) * 100);
  return PlanCard({
    title: 'Team',
    badge: 'API',
    lede: 'For studios and pipelines: one key for the whole team',
    head: 'Every tool + 5,000 API operations/month',
    lines: [`= one key on up to ${TEAM_MACHINES} machines`, '= batch whole folders from your own code'],
    price: monthlyPriceHtml(TEAM_PRICE_LABEL),
    cta: 'Get Team',
    ctaHref: TEAM_CHECKOUT_URL,
    renews: `${TEAM_PRICE_LABEL}, cancel any time`,
    features: [
      'Everything in All Access',
      `${TEAM_MACHINES} machines on one key`,
      '5,000 Cloud API operations/month, bigger uploads',
      '<a href="/docs/">Read the API docs</a>',
      saving > 0 ? { text: 'Lowest cost per machine', tag: `${saving}% less` } : 'Lowest cost per machine',
    ],
    tone: 'copper',
  });
}

const FAQ = [
  ['Can I cancel?', `Yes, any time: <a href="${MY_ORDERS_URL}" target="_blank" rel="noopener">cancel from Lemon Squeezy My Orders</a> using the email you bought with. If a payment fails, the subscription cancels itself, so you are never left owing.`],
  ['What happens to my files?', 'The browser tools run on your own device: your models and images are never uploaded. Only the Cloud API receives files, and only the ones you send it.'],
  ['What happens when the free trial ends?', `Every tool is free for ${TRIAL_DAYS} days with no card. After that the tools lock until you subscribe or unlock a single tool. Thumbnail Maker stays free for everyone.`],
  ['Single tool or All Access?', `If you only ever need one tool, ${TOOL_PRICE_LABEL} once is cheapest. If you use two or more, or want the API, All Access is better value.`],
  ['Do the browser extensions need a separate payment?', `No. All Access unlocks every Asset Bench extension with the same key, and extensions don't use up any of your key's devices. Without it, each extension gives 10 free uses, then ${TOOL_PRICE_LABEL} once unlocks everything in that extension.`],
  ['Can my team share a key?', `One All Access key works on ${LICENSE_MACHINE_LIMIT} machines. The Team plan covers up to ${TEAM_MACHINES} machines on one key.`],
  ['I lost my key.', `Find it any time at <a href="${MY_ORDERS_URL}" target="_blank" rel="noopener">Lemon Squeezy My Orders</a> using the email you bought with.`],
];

/** Plans + "already bought" + FAQ, for a visitor without a licence. */
function buyPanel(onChange) {
  const free = isFreePeriodActive();
  const wrap = document.createElement('div');
  wrap.className = 'pricing-buy';

  const grid = document.createElement('div');
  grid.className = 'plan-grid';
  grid.append(...[singleToolCard(), allAccessCard(), teamCard()].filter(Boolean));
  grid.style.setProperty('--plans', grid.children.length);

  const extra = document.createElement('div');
  extra.className = 'panel pricing-card pricing-extra';
  extra.innerHTML = `
    <div class="pricing-discount">
      <div class="pricing-discount__art-wrap" aria-hidden="true">
        <img class="pricing-discount__art" src="/pricing/ten-percent-off.webp" alt="" loading="lazy" decoding="async" />
      </div>
      <div class="pricing-discount__content">
        <span class="pricing-discount__eyebrow">Special offer</span>
        <strong>10% off All Access</strong>
        <span>Use this code at checkout:</span>
        <div class="pricing-discount__code-row">
          <code>${DISCOUNT_CODE}</code>
          <button type="button" class="pricing-discount__copy" aria-label="Copy discount code ${DISCOUNT_CODE}">Copy code</button>
        </div>
        <span class="pricing-discount__status" role="status" aria-live="polite"></span>
      </div>
    </div>
    <p class="pricing-cancel">✓ Cancel any time. No contract, and nothing owed if a payment fails.</p>
    <p class="pricing-manage-row">Already subscribed? <a class="pricing-manage" href="${MY_ORDERS_URL}" target="_blank" rel="noopener">Cancel or manage your subscription ↗</a></p>
    ${refundNoticeHtml()}
    <p class="text-secondary" style="margin-top: var(--space-5);">
      ${free ? 'Already bought?' : 'Bought already?'} Paste the key from your receipt email:
    </p>
  `;

  const copy = extra.querySelector('.pricing-discount__copy');
  const copyStatus = extra.querySelector('.pricing-discount__status');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(DISCOUNT_CODE);
      copyStatus.textContent = 'Code copied. Enter it at checkout.';
    } catch {
      copyStatus.textContent = 'Select the code above to copy it.';
    }
  });
  extra.appendChild(LicenseActivationForm({ onActivated: () => setTimeout(onChange, 800) }));

  const faq = document.createElement('section');
  faq.className = 'pricing-faq';
  faq.innerHTML = `<h2>Questions</h2>${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}`;

  const note = document.createElement('p');
  note.className = 'plan-note';
  note.innerHTML = `Note: every browser tool runs on your own device, so your files are never uploaded; only the Cloud API receives the files you send it. All Access and Team renew monthly until you cancel from <a href="${MY_ORDERS_URL}" target="_blank" rel="noopener">Lemon Squeezy My Orders</a>. Single-tool keys are a one-time payment. Checkout is handled by Lemon Squeezy.`;

  wrap.append(grid, note, extra, faq);
  return wrap;
}

export async function render(container) {
  await initTrial();
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';

  const license = getStoredLicense();
  const free = isFreePeriodActive();
  const days = freeDaysRemaining();

  section.classList.add('pricing-page');
  section.innerHTML = `
    <div class="pricing-page__header">
      <h1 class="pricing-page__title">${license ? 'You have All Access' : free ? 'Start free, or unlock everything' : 'Pick a plan to keep going'}</h1>
      <p class="pricing-page__sub">
        ${!license && free ? `Your free trial has ${days} day${days === 1 ? '' : 's'} left. Keep one tool, or get every tool and the Cloud API.` : !license ? `Your ${TRIAL_DAYS}-day free trial has ended. Subscribe to unlock all tools.` : 'One subscription. Every tool.'}
      </p>
    </div>
  `;

  const rerender = () => render(container);
  const card = license ? licensedPanel(license, rerender) : buyPanel(rerender);
  if (license) card.prepend(splashHero());
  section.appendChild(card);
  const toolKeys = getToolLicenses();
  if (toolKeys.length) section.appendChild(toolKeysPanel(toolKeys, rerender));
  container.appendChild(section);
}
