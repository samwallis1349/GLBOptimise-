import { APP_NAME, CONTACT_EMAIL, OPERATOR_NAME } from '../../shared/config/app.js';
import { TRIAL_DAYS } from '../../shared/config/billing.js';

const UPDATED = '4 October 2026';

export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">Refund Policy</h1>
        <p class="tool-page__description">Last updated ${UPDATED}</p>
      </div>
    </div>
    <div class="panel info-page">
      <h2>All sales are final</h2>
      <p>
        ${APP_NAME} licences are digital products, delivered instantly and
        usable straight away. Because every tool can be tried for
        ${TRIAL_DAYS} days before you buy, we don't offer refunds if you change
        your mind, no longer need the tools, or bought without trying them
        first. This applies to the lifetime licence and to any single-tool
        licence.
      </p>

      <h2>Try before you buy</h2>
      <p>
        Please use the free trial to check that the tools work with your
        files, browser and devices before purchasing.
      </p>

      <h2>Your right to cancel</h2>
      <p>
        UK consumer law normally gives you 14 days to cancel an online
        purchase. For digital content, that right ends once delivery starts
        if you agreed to immediate delivery. When you buy, you ask for your
        licence key to be delivered straight away and accept that you lose
        the right to cancel once it has been delivered.
      </p>

      <h2>When we will help</h2>
      <p>
        Nothing in this policy affects your statutory rights. If your licence
        key doesn't work, a tool you paid for is faulty or doesn't do what it
        was described as doing, or you were charged twice for the same
        purchase, contact us. We'll fix the problem, replace the key, or
        refund you where the law requires it.
      </p>

      <h2>Payments</h2>
      <p>
        Payments are processed by Lemon Squeezy, our payment provider, which
        also issues any refund that is due.
      </p>

      <h2>Contact</h2>
      <p>
        Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with your
        order email address and a short description of the problem.
        ${APP_NAME} is operated by ${OPERATOR_NAME}.
      </p>
    </div>
  `;

  container.appendChild(section);
}
