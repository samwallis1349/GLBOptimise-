import { APP_NAME, CONTACT_EMAIL } from '../../shared/config/app.js';
import { TOOLS } from '../../shared/config/tools.js';
import { CHROME_EXTENSIONS } from '../../shared/config/extensions.js';
import { toolClip } from '../../shared/config/toolClips.js';

const LIVE_STATUSES = new Set(['available', 'beta']);

/** Promo images press and partners can reuse, from public/. */
const PROMO_IMAGES = [
  { src: '/images/hero-visual.webp', label: 'Hero visual' },
  { src: '/images/api-poster.webp', label: 'Cloud API poster' },
  { src: '/images/api-promo.webp', label: 'Cloud API' },
  { src: '/hero/poster.webp', label: 'Colossus sample model' },
];

function tile({ src, label }) {
  return `
    <figure class="media-page__tile">
      <a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${label}" loading="lazy" /></a>
      <figcaption>${label} · <a href="${src}" download>Download</a></figcaption>
    </figure>`;
}

/** A tool's 5-second promo clip (shared/config/toolClips.js). */
function clip(tool) {
  const { src, poster } = toolClip(tool.id);
  return `
    <figure class="media-page__tile media-page__tile--video">
      <video src="${src}" poster="${poster}" muted loop playsinline preload="none" controls aria-label="${tool.name} clip"></video>
      <figcaption><a href="${tool.route}">${tool.name}</a> · <a href="${src}" download>Download MP4</a></figcaption>
    </figure>`;
}

export function render(container) {
  container.innerHTML = '';

  const liveTools = TOOLS.filter((t) => LIVE_STATUSES.has(t.status));
  const tools = liveTools.filter((t) => t.thumbnail);
  const extensions = Object.values(CHROME_EXTENSIONS).filter((e) => e.url);

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">Media</h1>
        <p class="tool-page__description">Logos, images and links for writing about ${APP_NAME}. Free to use when you're covering or linking to the site.</p>
      </div>
    </div>
    <div class="panel info-page">
      <h2>Tool videos</h2>
      <p>A 5-second clip for each tool (1920 × 1080, MP4, no sound). Hover to play.</p>
      <div class="media-page__grid media-page__grid--video">
        ${liveTools.filter((t) => toolClip(t.id)).map(clip).join('')}
      </div>

      <h2>Logo</h2>
      <div class="media-page__grid">
        ${tile({ src: '/branding/asset-bench-logo.svg', label: `${APP_NAME} logo (SVG)` })}
        ${tile({ src: '/branding/favicon.svg', label: 'Icon (SVG)' })}
      </div>

      <h2>Images</h2>
      <div class="media-page__grid">${PROMO_IMAGES.map(tile).join('')}</div>

      <h2>Tool artwork</h2>
      <div class="media-page__grid">
        ${tools.map((t) => tile({ src: t.thumbnail, label: t.name })).join('')}
      </div>

      ${extensions.length ? `
      <h2>Browser extensions</h2>
      <ul class="info-page__tools">
        ${extensions.map((e) => `<li><a href="${e.url}" target="_blank" rel="noopener">${e.name} on the Chrome Web Store</a></li>`).join('')}
      </ul>` : ''}

      <h2>Press contact</h2>
      <p>For interviews, reviews or review keys, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
    </div>
  `;

  // Clips play on hover (or tap, via controls) so only the ones people look at download.
  section.querySelectorAll('.media-page__tile--video video').forEach((video) => {
    video.addEventListener('mouseenter', () => video.play().catch(() => {}));
    video.addEventListener('mouseleave', () => video.pause());
  });

  container.appendChild(section);
}
