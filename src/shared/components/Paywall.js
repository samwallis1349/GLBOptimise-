import { CHECKOUT_URL, LIFETIME_PRICE_LABEL } from '../config/billing.js';
import { LicenseActivationForm } from './LicenseActivationForm.js';

/**
 * Locked-tool screen rendered instead of a gated tool once the free window
 * has ended and no valid license is stored. The tool's own module is never
 * imported while locked — see app/routes.js.
 * @param {{ toolName?: string, onUnlock: () => void }} options
 */
export function Paywall({ toolName, onUnlock }) {
  const wrap = document.createElement('div');
  wrap.className = 'container section';

  const panel = document.createElement('div');
  panel.className = 'panel panel--elevated paywall';
  panel.innerHTML = `
    <h1 class="tool-page__title">Free trial has ended</h1>
    <p class="tool-page__description">
      ${toolName ? `${toolName}, and every other Asset Bench tool,` : 'Asset Bench'}
      now needs a one-time license to keep using.
    </p>
    <div class="paywall__price">${LIFETIME_PRICE_LABEL} <span class="text-muted">once, forever</span></div>
    <a class="btn btn--primary paywall__buy" href="${CHECKOUT_URL}" target="_blank" rel="noopener">Buy lifetime access</a>
    <p class="paywall__divider text-secondary">Already bought? Enter your license key below.</p>
  `;

  panel.appendChild(LicenseActivationForm({ onActivated: onUnlock }));
  wrap.appendChild(panel);
  return wrap;
}
