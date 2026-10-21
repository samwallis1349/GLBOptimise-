import { CHECKOUT_URL, LICENSE_MACHINE_LIMIT, PRICE_LABEL, MY_ORDERS_URL, TRIAL_DAYS, hasAccess } from '../config/billing.js';
import { TOOL_DEVICE_LIMIT, TOOL_PRICE_LABEL, toolProduct } from '../config/toolProducts.js';
import { TOOLS } from '../config/tools.js';
import { LicenseActivationForm } from './LicenseActivationForm.js';
import { refundNoticeHtml } from './RefundNotice.js';
import { PlanCard, monthlyPriceHtml } from './PlanCard.js';

/**
 * Locked-tool screen rendered instead of a gated tool once the visitor's free
 * trial has ended and no valid license is stored. The tool's own module is never
 * imported while locked — see app/routes.js. Shows the same plan cards as the
 * Pricing page: All Access and, once the tool is on sale by itself
 * (shared/config/toolProducts.js), just this tool.
 * @param {{ tool: import('../config/tools.js').TOOLS[number], onUnlock: () => void }} options
 */
export function Paywall({ tool, onUnlock }) {
  const single = toolProduct(tool.id);
  const wrap = document.createElement('div');
  wrap.className = 'container section';

  const head = document.createElement('div');
  head.className = 'pricing-page__header paywall__header';
  head.innerHTML = `
    <h1 class="pricing-page__title">Your ${TRIAL_DAYS}-day free trial has ended</h1>
    <p class="pricing-page__sub">${tool.name}, and every other Asset Bench tool, is locked until payment. <a href="/pricing">Compare all plans</a></p>
  `;

  const grid = document.createElement('div');
  grid.className = 'plan-grid';
  if (single) {
    grid.appendChild(PlanCard({
      title: `Just ${tool.name}`,
      lede: 'Keep using this one tool, for good',
      head: `${tool.name}, unlocked`,
      lines: [`= on up to ${TOOL_DEVICE_LIMIT} devices, phone included`, '= no subscription'],
      price: `<b>${TOOL_PRICE_LABEL}</b> once`,
      cta: `Unlock ${tool.name}`,
      ctaHref: single.checkoutUrl,
      renews: 'Pay once. Yours to keep.',
      features: ['Unlimited use of this tool', 'Files stay on your device', { text: 'Every other tool', off: true }, { text: 'Cloud API operations', off: true }],
      tone: 'plain',
    }));
  }
  const all = PlanCard({
    title: 'All Access',
    badge: 'API',
    lede: 'Every Asset Bench tool plus the Cloud API',
    head: 'Every tool + 1,000 API operations/month',
    lines: [`= ${TOOLS.length} browser tools, unrestricted`, `= one key on ${LICENSE_MACHINE_LIMIT} machines`],
    price: monthlyPriceHtml(PRICE_LABEL),
    cta: 'Subscribe to All Access',
    ctaHref: CHECKOUT_URL,
    renews: `${PRICE_LABEL}, cancel any time`,
    features: [`Unlocks ${tool.name} and every other tool`, '1,000 Cloud API operations/month', 'Cancel any time'],
    tone: 'amber',
  });
  all.querySelector('.plan-card__title').insertAdjacentHTML('beforeend', '<span class="plan-card__badge plan-card__badge--star">★ Recommended</span>');
  grid.appendChild(all);
  grid.style.setProperty('--plans', grid.children.length);

  const panel = document.createElement('div');
  panel.className = 'panel paywall paywall__keys';
  panel.innerHTML = `
    ${refundNoticeHtml()}
    <p class="paywall__divider text-secondary">Already bought? Enter the license key from your receipt email.</p>
  `;

  panel.appendChild(LicenseActivationForm({
    toolId: tool.id,
    onActivated: (result) => {
      if (hasAccess(tool.id)) {
        onUnlock();
        return null;
      }
      // A single-tool key for some other tool: it's saved, but this page stays locked.
      const other = TOOLS.find((t) => t.id === result.toolId);
      return `That key unlocks ${other?.name ?? 'a different tool'}, not ${tool.name}.`;
    },
  }));

  const lost = document.createElement('p');
  lost.className = 'text-secondary';
  lost.style.cssText = 'margin-top: var(--space-4); font-size: 13px;';
  lost.innerHTML = `Lost your key? Find it at <a href="${MY_ORDERS_URL}" target="_blank" rel="noopener">Lemon Squeezy My Orders</a>.`;
  panel.appendChild(lost);
  wrap.classList.add('pricing-page');
  wrap.append(head, grid, panel);
  return wrap;
}
