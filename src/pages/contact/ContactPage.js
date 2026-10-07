import { APP_NAME, CONTACT_EMAIL } from '../../shared/config/app.js';
import { MY_ORDERS_URL } from '../../shared/config/billing.js';

export function render(container) {
  container.innerHTML = '';

  const email = CONTACT_EMAIL
    ? `<p>Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> and include the tool name and, for licence questions, the email address you bought with.</p>`
    : `<p>A direct support email address is not available yet. It will be listed here as soon as it is.</p>`;

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">Contact ${APP_NAME}</h1>
        <p class="tool-page__description">Support, licences, bug reports and feedback.</p>
      </div>
    </div>
    <div class="panel info-page">
      <p>Get in touch about:</p>
      <ul>
        <li>support or a problem with a tool</li>
        <li>bug reports</li>
        <li>licensing or payment questions</li>
        <li>feedback and ideas for tools</li>
        <li>general enquiries</li>
      </ul>

      <h2>Email</h2>
      ${email}

      <h2>Orders and licence keys</h2>
      <p>
        Purchases are handled by Lemon Squeezy. To find a lost licence key,
        view a receipt or manage an order, use
        <a href="${MY_ORDERS_URL}" target="_blank" rel="noopener">Lemon Squeezy's order lookup</a>
        with the email address you bought with.
      </p>

      <h2>Privacy</h2>
      <p>
        Please don't send model files or personal information you don't need
        to. See the <a href="/privacy">privacy page</a> for how ${APP_NAME}
        handles data.
      </p>
    </div>
  `;

  container.appendChild(section);
}
