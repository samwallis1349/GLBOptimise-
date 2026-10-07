import { APP_NAME, OPERATOR_NAME } from '../../shared/config/app.js';
import { ALL_TOOLS_FREE, LIFETIME_PRICE_LABEL, LICENSE_MACHINE_LIMIT, TRIAL_DAYS } from '../../shared/config/billing.js';
import { TOOL_DEVICE_LIMIT, TOOL_PRICE_LABEL, TOOL_PRODUCTS } from '../../shared/config/toolProducts.js';

const UPDATED = '4 October 2026';

export function render(container) {
  container.innerHTML = '';

  // Single-tool keys are only described once at least one is actually on sale.
  const singleToolKeys = Object.values(TOOL_PRODUCTS).some((p) => p.productId && p.checkoutUrl);

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">Terms of Use</h1>
        <p class="tool-page__description">Last updated ${UPDATED}</p>
      </div>
    </div>
    <div class="panel info-page">
      <p>
        These terms cover your use of the ${APP_NAME} website and tools.
        ${APP_NAME} is operated by ${OPERATOR_NAME} ("we", "us"). By using
        the site you agree to these terms. Nothing in these terms affects your
        statutory rights as a consumer.
      </p>

      <h2>Using ${APP_NAME}</h2>
      <p>You may use the website and its tools for any lawful purpose, personal or commercial.</p>

      <h2>Tools and results</h2>
      <p>
        ${APP_NAME} provides tools for optimising, converting, inspecting and
        creating digital assets. We work hard to make them reliable, but we
        can't guarantee that every conversion, optimisation or generated file
        will be perfect or suit your project. Check results before you use
        them in production or anything important, and keep your original
        files.
      </p>

      <h2>Your files</h2>
      <p>
        The tools process your files in your browser, on your own device. Your
        models, textures and images are not uploaded to ${APP_NAME}'s servers.
        The few things the site does send — such as trial and licence checks
        and anonymous tool-usage counts — are described on the
        <a href="/privacy">privacy page</a>.
      </p>

      <h2>Trial and licences</h2>
      <p>
        Every tool is unlocked for ${TRIAL_DAYS} days from your first visit.
        One trial is available per visitor. After the trial, the tools need a
        licence.
        ${ALL_TOOLS_FREE ? 'At the moment, every tool is temporarily unlocked for everyone; this may end at any time, after which the trial and licence rules apply.' : ''}
      </p>
      <p>
        The lifetime licence is a one-time purchase of ${LIFETIME_PRICE_LABEL}.
        It is not a subscription. Its licence key unlocks every current and
        future ${APP_NAME} tool in the browser on up to
        ${LICENSE_MACHINE_LIMIT} machines, with no account needed. "Lifetime"
        means for as long as ${APP_NAME} is operated.
      </p>
      ${
        singleToolKeys
          ? `<p>Some tools are also sold on their own for ${TOOL_PRICE_LABEL}, as a one-time purchase. A single-tool key unlocks just that tool, on up to ${TOOL_DEVICE_LIMIT} devices.</p>`
          : ''
      }
      <p>
        Licence keys are checked with our payment provider from time to time.
        A key that is refunded or disabled may stop unlocking tools, and a key
        can't be activated on more machines than its limit. Keep your key
        private.
      </p>

      <h2>Payments</h2>
      <p>
        Payments are processed by Lemon Squeezy, which handles checkout,
        payment and receipts. ${APP_NAME} never sees or stores your card
        details. Licences are delivered instantly, so all sales are final
        except where the law requires otherwise — see the
        <a href="/refunds">refund policy</a>. Questions about an order can be
        sent through the <a href="/contact">contact page</a>.
      </p>

      <h2>Availability</h2>
      <p>
        ${APP_NAME} is provided "as is" and "as available". We aim to keep it
        running smoothly, but we can't promise it will always be available,
        uninterrupted or error-free.
      </p>

      <h2>Intellectual property</h2>
      <p>
        You keep all rights to the files you use with ${APP_NAME}, and to what
        you make from them, subject to any third-party rights in those files.
        ${APP_NAME} claims no ownership of your assets. Only use files you have
        the right to use.
      </p>
      <p>
        The ${APP_NAME} website, name, branding, software and content belong
        to ${OPERATOR_NAME} and are protected by copyright and other laws.
      </p>

      <h2>What you must not do</h2>
      <ul>
        <li>use ${APP_NAME} for anything unlawful</li>
        <li>try to disrupt, overload or abuse the site or its services</li>
        <li>use the tools with malicious files designed to cause harm</li>
        <li>try to bypass the trial or licensing, or share or resell licence keys</li>
        <li>try to attack, probe or compromise ${APP_NAME}'s systems</li>
      </ul>

      <h2>Changes to the service</h2>
      <p>${APP_NAME} may add, change, improve or remove tools over time.</p>

      <h2>Changes to these terms</h2>
      <p>
        These terms may be updated. The date at the top shows when they last
        changed. Continuing to use the site after a change means you accept
        the updated terms.
      </p>

      <h2>Contact and privacy</h2>
      <p>
        Questions about these terms? See the <a href="/contact">contact page</a>.
        How data is handled is explained on the <a href="/privacy">privacy page</a>.
      </p>
    </div>
  `;

  container.appendChild(section);
}
