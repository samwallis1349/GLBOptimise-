import { APP_NAME, APP_TAGLINE, OPERATOR_NAME } from '../config/app.js';
import { DONATE_URL } from '../config/billing.js';
import { openPrivacyChoices } from './ConsentBanner.js';

/** Site-wide links: browsing first, then the trust/legal pages. Plain links, so they work without the router. */
const FOOTER_LINKS = [
  { label: 'Tools', href: '/tools' },
  { label: 'About', href: '/about' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Refunds', href: '/refunds' },
];

export function Footer() {
  const footer = document.createElement('footer');
  footer.className = 'ab-footer';

  footer.innerHTML = `
    <div class="container ab-footer__inner">
      <div class="ab-footer__meta">${APP_NAME} — ${APP_TAGLINE}</div>
      <nav class="ab-footer__links" aria-label="Footer">
        ${FOOTER_LINKS.map(({ label, href }) => `<a href="${href}">${label}</a>`).join('')}
        <a href="${DONATE_URL}" target="_blank" rel="noopener">Donate</a>
        <button type="button" class="ab-footer__choices">Privacy choices</button>
      </nav>
    </div>
    <div class="container ab-footer__legal">© ${new Date().getFullYear()} ${OPERATOR_NAME}. ${APP_NAME} is operated by ${OPERATOR_NAME}.</div>
  `;

  footer.querySelector('.ab-footer__choices').addEventListener('click', openPrivacyChoices);

  return footer;
}
