import {
  CHECKOUT_URL,
  LICENSE_MACHINE_LIMIT,
  LIFETIME_PRICE_LABEL,
  MY_ORDERS_URL,
  TRIAL_DAYS,
  isFreePeriodActive,
  freeDaysRemaining,
} from '../../shared/config/billing.js';
import { initTrial } from '../../services/TrialService.js';
import { deactivateLicense, getStoredLicense } from '../../services/LicenseService.js';
import { LicenseActivationForm } from '../../shared/components/LicenseActivationForm.js';
import { splashHero } from '../../shared/components/WelcomeOffer.js';

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
    <p><strong>Lifetime license active — every tool is unlocked on this machine.</strong></p>
    <p class="text-secondary" style="margin-top: var(--space-3);">
      Key <code>${maskKey(license.key)}</code>. ${usage}
      Moving to a new computer? Remove this machine first to free up its slot.
    </p>
    <button type="button" class="btn btn--secondary" style="margin-top: var(--space-4);">Remove this machine</button>
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

/** Buy + activate panel for a visitor without a license. */
function buyPanel(onChange) {
  const free = isFreePeriodActive();
  const panel = document.createElement('div');
  panel.className = 'panel panel--elevated pricing-card';

  panel.innerHTML = `
    <p><strong>${LIFETIME_PRICE_LABEL} once — lifetime access to every Asset Bench tool.</strong></p>
    <p class="text-secondary" style="margin-top: var(--space-3);">
      Every tool is free for ${TRIAL_DAYS} days from your first visit. After that,
      pay once and your license key is emailed to you straight away — no
      subscription, no credits, no account. One key unlocks every current and
      future tool on up to ${LICENSE_MACHINE_LIMIT} machines.
    </p>
    <a class="btn btn--primary" style="margin-top: var(--space-4); width: 100%;" href="${CHECKOUT_URL}" target="_blank" rel="noopener">
      Buy lifetime access — ${LIFETIME_PRICE_LABEL}
    </a>
    <p class="text-secondary" style="margin-top: var(--space-5);">
      ${free ? 'Already bought?' : 'Bought already?'} Paste the key from your receipt email:
    </p>
  `;

  panel.appendChild(LicenseActivationForm({ onActivated: () => setTimeout(onChange, 800) }));

  const lost = document.createElement('p');
  lost.className = 'text-secondary';
  lost.style.cssText = 'margin-top: var(--space-4); font-size: 13px;';
  lost.innerHTML = `Lost your key? Find it any time at <a href="${MY_ORDERS_URL}" target="_blank" rel="noopener">Lemon Squeezy My Orders</a> using the email you bought with.`;
  panel.appendChild(lost);

  return panel;
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
        ${!license && free ? `Your free trial has ${days} day${days === 1 ? '' : 's'} left.` : 'One price. Every tool. Forever.'}
      </p>
    </div>
  `;

  const rerender = () => render(container);
  const card = license ? licensedPanel(license, rerender) : buyPanel(rerender);
  card.prepend(splashHero());
  section.appendChild(card);
  container.appendChild(section);
}
