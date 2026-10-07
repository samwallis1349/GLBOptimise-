import { activateLicense } from '../../services/LicenseService.js';

/**
 * A license-key input + Activate button, wired to LicenseService. Shared by
 * the Paywall (locked tool screen) and the Pricing page so there is one
 * activation flow, not two. onActivated gets { ok, toolId? } and may return
 * a message to show instead of the default success text.
 * @param {{ onActivated?: (result: { ok: true, toolId?: string }) => string | null | void }} [options]
 */
export function LicenseActivationForm({ onActivated, toolId } = {}) {
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

    const result = await activateLicense(input.value, toolId);

    if (result.ok) {
      status.classList.add('license-form__status--ok');
      status.textContent = result.toolId ? 'Tool key activated.' : 'License activated.';
      const message = onActivated?.(result);
      if (message) {
        submitBtn.disabled = false;
        status.textContent = message;
      }
    } else {
      submitBtn.disabled = false;
      status.classList.add('license-form__status--error');
      status.textContent = result.error;
    }
  });

  return wrap;
}
