import { CHECKOUT_URL, LIFETIME_PRICE_LABEL, isFreePeriodActive, freeDaysRemaining } from '../../shared/config/billing.js';
import { LicenseActivationForm } from '../../shared/components/LicenseActivationForm.js';

export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';

  const free = isFreePeriodActive();
  const days = freeDaysRemaining();

  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">Pricing</h1>
        <p class="tool-page__description">
          ${free ? `Free for everyone right now — ${days} day${days === 1 ? '' : 's'} left.` : 'One price. Every tool. Forever.'}
        </p>
      </div>
    </div>
    <div class="panel panel--elevated" style="max-width: 480px;">
      <p><strong>${LIFETIME_PRICE_LABEL} once — lifetime access to every Asset Bench tool.</strong></p>
      <p class="text-secondary" style="margin-top: var(--space-3);">
        No subscription, no credits, no account required. Pay once, use every
        current and future tool for as long as Asset Bench exists.
        ${free ? ' Nothing is billed during the free launch window.' : ''}
      </p>
      <a class="btn btn--primary" style="margin-top: var(--space-4); width: 100%;" href="${CHECKOUT_URL}" target="_blank" rel="noopener">
        Buy lifetime access — ${LIFETIME_PRICE_LABEL}
      </a>
      <p class="text-secondary" style="margin-top: var(--space-5);">Already bought? Activate your license key:</p>
    </div>
  `;

  section.querySelector('.panel').appendChild(LicenseActivationForm({}));
  container.appendChild(section);
}
