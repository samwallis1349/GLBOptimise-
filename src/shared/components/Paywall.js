import { CHECKOUT_URL, LICENSE_MACHINE_LIMIT, LIFETIME_PRICE_LABEL, MY_ORDERS_URL, TRIAL_DAYS } from '../config/billing.js';
import { LicenseActivationForm } from './LicenseActivationForm.js';

/**
 * Locked-tool screen rendered instead of a gated tool once the visitor's free
 * trial has ended and no valid license is stored. The tool's own module is never
 * imported while locked — see app/routes.js.
 * @param {{ toolName?: string, onUnlock: () => void }} options
 */
export function Paywall({ toolName, onUnlock }) {
  const wrap = document.createElement('div');
  wrap.className = 'container section';

  const panel = document.createElement('div');
  panel.className = 'panel panel--elevated paywall';
  panel.innerHTML = `
    <h1 class="tool-page__title">Your ${TRIAL_DAYS}-day free trial has ended</h1>
    <p class="tool-page__description">
      ${toolName ? `${toolName}, and every other Asset Bench tool,` : 'Asset Bench'}
      needs a one-time license key to keep using.
    </p>
    <div class="paywall__price">${LIFETIME_PRICE_LABEL} <span class="text-muted">once, forever · ${LICENSE_MACHINE_LIMIT} machines</span></div>
    <a class="btn btn--primary paywall__buy" href="${CHECKOUT_URL}" target="_blank" rel="noopener">Buy lifetime access</a>
    <p class="paywall__divider text-secondary">Already bought? Enter the license key from your receipt email.</p>
  `;

  panel.appendChild(LicenseActivationForm({ onActivated: onUnlock }));

  const lost = document.createElement('p');
  lost.className = 'text-secondary';
  lost.style.cssText = 'margin-top: var(--space-4); font-size: 13px;';
  lost.innerHTML = `Lost your key? Find it at <a href="${MY_ORDERS_URL}" target="_blank" rel="noopener">Lemon Squeezy My Orders</a>.`;
  panel.appendChild(lost);
  wrap.appendChild(panel);
  return wrap;
}
