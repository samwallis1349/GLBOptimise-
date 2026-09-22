import { activateLicense } from '../../services/LicenseService.js';

/**
 * A license-key input + Activate button, wired to LicenseService. Shared by
 * the Paywall (locked tool screen) and the Pricing page so there is one
 * activation flow, not two.
 * @param {{ onActivated?: () => void }} [options]
 */
export function LicenseActivationForm({ onActivated } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'license-form';
  wrap.innerHTML = `
    <form class="license-form__row">
      <input
        class="field-input"
        type="text"
        name="licenseKey"
        placeholder="License key"
        autocomplete="off"
        spellcheck="false"
      />
      <button class="btn btn--secondary" type="submit">Activate</button>
    </form>
    <p class="license-form__status" role="status"></p>
  `;

  const form = wrap.querySelector('form');
  const input = wrap.querySelector('input[name="licenseKey"]');
  const status = wrap.querySelector('.license-form__status');
  const submitBtn = wrap.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    status.className = 'license-form__status';
    status.textContent = 'Checking...';

    const result = await activateLicense(input.value);

    if (result.ok) {
      status.classList.add('license-form__status--ok');
      status.textContent = 'License activated.';
      onActivated?.();
    } else {
      submitBtn.disabled = false;
      status.classList.add('license-form__status--error');
      status.textContent = result.error;
    }
  });

  return wrap;
}
