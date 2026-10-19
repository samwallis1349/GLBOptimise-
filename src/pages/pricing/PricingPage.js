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

/** One plan card (the plan-card style: title + badge, allowance box, price, CTA, checklist). */
function planCard({ title, badge, lede, head, lines = [], price, cta, ctaHref, renews, features, featured = false }) {
  const card = document.createElement('div');
  card.className = `panel plan-card${featured ? ' plan-card--featured' : ''}`;
  card.innerHTML = `
    ${featured ? '<span class="plan-card__ribbon">Most popular</span>' : ''}
    <h2 class="plan-card__title">${title}${badge ? ` <span class="plan-card__badge">${badge}</span>` : ''}</h2>
    <p class="plan-card__lede">${lede}</p>
    <div class="plan-card__credits">
      <span class="plan-card__spark" aria-hidden="true">✦</span>
      <div>
        <strong>${head}</strong>
        ${lines.map((l) => `<span>${l}</span>`).join('')}
      </div>
    </div>
    <p class="plan-card__price">${price}</p>
    <a class="plan-card__cta" href="${ctaHref}" target="_blank" rel="noopener">${cta}</a>
    <p class="plan-card__renews">${renews}</p>
    <ul class="plan-card__features">${features.map((f) => `<li>${f}</li>`).join('')}</ul>
  `;
  return card;
}

/** "£10/month" -> "<b>£10</b> per month" */
function priceHtml(label) {
  const [amount, per] = label.split('/');
  return `<b>${amount}</b> per ${per}`;
}

/** Single tool: pick a tool, buy just that one. Hidden until a single-tool checkout is set up. */
function singleToolCard() {
  const tools = TOOLS.filter((t) => t.status === 'available' || t.status === 'beta').filter((t) => toolProduct(t.id));
  if (!tools.length) return null;
  const card = planCard({
    title: 'Single tool',
    lede: 'For when you only need one job done, again and again',
    head: 'One tool, unlocked for good',
    lines: [`= pick any of ${tools.length} tools`, `~ on your phone and computer (${TOOL_DEVICE_LIMIT} devices)`],
    price: `<b>${TOOL_PRICE_LABEL}</b> once`,
    cta: 'Unlock this tool',
    ctaHref: toolProduct(tools[0].id).checkoutUrl,
    renews: 'Pay once. No subscription.',
    features: ['Unlimited use of that tool', 'Works in your browser, files stay on your device', 'Upgrade to All Access any time'],
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
  const card = planCard({
    title: free ? `${TRIAL_DAYS}-day free All Access` : 'All Access',
    badge: 'API',
    lede: 'For anyone preparing 3D, image and app assets, in the browser or from code',
    head: 'Every tool + 1,000 API operations/month',
    lines: [`= ${TOOLS.length} browser tools, unrestricted`, '~ one licence key for the tools and the API'],
    price: free ? `<b>£0</b> for ${days} more day${days === 1 ? '' : 's'}, then ${PRICE_LABEL}` : priceHtml(PRICE_LABEL),
    cta: free ? 'Get All Access' : 'Unlock every tool',
    ctaHref: CHECKOUT_URL,
    renews: free ? `Your trial needs no card. Subscribe any time for ${PRICE_LABEL}.` : `${PRICE_LABEL}, cancel any time`,
    features: [
      `Every current and future browser tool (${TOOLS.length} today)`,
      '1,000 Cloud API operations/month, using the same key',
      `One key on up to ${LICENSE_MACHINE_LIMIT} machines`,
      'Cancel any time. If a payment fails, it cancels itself: never left owing',
    ],
    featured: true,
  });
  return card;
}

/** Team: every tool + the API's Studio allowance on one key (billing.js TEAM_*). */
function teamCard() {
  return planCard({
    title: 'Team',
    badge: 'API',
    lede: 'For studios and pipelines: one key for the whole team',
    head: 'Every tool + 5,000 API operations/month',
    lines: [`= one key on up to ${TEAM_MACHINES} machines`, '~ batch whole folders from your own code'],
    price: priceHtml(TEAM_PRICE_LABEL),
    cta: 'Get Team',
    ctaHref: TEAM_CHECKOUT_URL,
    renews: `${TEAM_PRICE_LABEL}, cancel any time`,
    features: [
      'Everything in All Access',
      `${TEAM_MACHINES} machines on one key`,
      '5,000 Cloud API operations/month, bigger uploads',
      '<a href="/docs/">Read the API docs</a>',
    ],
  });
}

const FAQ = [
  ['Can I cancel?', `Yes, any time: <a href="${MY_ORDERS_URL}" target="_blank" rel="noopener">cancel from Lemon Squeezy My Orders</a> using the email you bought with. If a payment fails, the subscription cancels itself, so you are never left owing.`],
  ['What happens to my files?', 'The browser tools run on your own device: your models and images are never uploaded. Only the Cloud API receives files, and only the ones you send it.'],
  ['What happens when the free trial ends?', `Every tool is free for ${TRIAL_DAYS} days with no card. After that the tools lock until you subscribe or unlock a single tool.`],
  ['Single tool or All Access?', `If you only ever need one tool, ${TOOL_PRICE_LABEL} once is cheapest. If you use two or more, or want the API, All Access is better value.`],
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

  wrap.append(grid, extra, faq);
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
      <h1 class="tool-page__title">Pricing</h1>
      <p class="tool-page__description">
        ${!license && free ? `Your free trial has ${days} day${days === 1 ? '' : 's'} left.` : !license ? `Your ${TRIAL_DAYS}-day free trial has ended. Subscribe to unlock all tools.` : 'One subscription. Every tool.'}
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
