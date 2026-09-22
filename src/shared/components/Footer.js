import { APP_NAME, APP_TAGLINE } from '../config/app.js';

export function Footer() {
  const footer = document.createElement('footer');
  footer.className = 'ab-footer';

  footer.innerHTML = `
    <div class="container ab-footer__inner">
      <div class="ab-footer__meta">${APP_NAME} — ${APP_TAGLINE}</div>
      <nav class="ab-footer__links" aria-label="Footer">
        <a href="#/tools">Tools</a>
        <a href="#/about">About</a>
        <a href="#/pricing">Pricing</a>
      </nav>
    </div>
  `;

  return footer;
}
