import { LICENSE_MACHINE_LIMIT, LIFETIME_PRICE_LABEL, MY_ORDERS_URL, TRIAL_DAYS, hasAccess } from '../config/billing.js';
import { TOOL_DEVICE_LIMIT, TOOL_PRICE_LABEL, toolProduct } from '../config/toolProducts.js';
import { TOOLS } from '../config/tools.js';
import { LicenseActivationForm } from './LicenseActivationForm.js';
import { refundNoticeHtml } from './RefundNotice.js';

/**
 * Locked-tool screen rendered instead of a gated tool once the visitor's free
 * trial has ended and no valid license is stored. The tool's own module is never
 * imported while locked — see app/routes.js. Offers the lifetime license and,
 * once the tool is on sale by itself (shared/config/toolProducts.js), just
 * this tool for £5.
 * @param {{ tool: import('../config/tools.js').TOOLS[number], onUnlock: () => void }} options
 */
export function Paywall({ tool, onUnlock }) {
  const single = toolProduct(tool.id);
  const wrap = document.createElement('div');
  wrap.className = 'container section';

  const panel = document.createElement('div');
  panel.className = 'panel panel--elevated paywall';
  panel.innerHTML = `
    <h1 class="tool-page__title">Your ${TRIAL_DAYS}-day free trial has ended</h1>
    <p class="tool-page__description">
      ${tool.name}, and every other Asset Bench tool, needs a one-time license key to keep using.
    </p>
    <div class="paywall__price">${LIFETIME_PRICE_LABEL} <span class="text-muted">once, forever · every tool · ${LICENSE_MACHINE_LIMIT} machines</span></div>
    <a class="btn btn--primary paywall__buy" href="/pricing">View pricing and buy</a>
    ${single ? `
      <a class="btn btn--secondary paywall__buy paywall__single" href="${single.checkoutUrl}" target="_blank" rel="noopener">
        Just ${tool.name} — ${TOOL_PRICE_LABEL}
      </a>
      <p class="text-secondary paywall__single-note">Unlocks ${tool.name} for good in your browser, on up to ${TOOL_DEVICE_LIMIT} devices — phone included.</p>
    ` : ''}
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
  wrap.appendChild(panel);
  return wrap;
}
