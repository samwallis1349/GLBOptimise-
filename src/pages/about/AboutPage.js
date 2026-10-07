import { APP_NAME, APP_TAGLINE } from '../../shared/config/app.js';
import { CATEGORIES, TOOLS } from '../../shared/config/tools.js';
import { ALL_TOOLS_FREE, LIFETIME_PRICE_LABEL, LICENSE_MACHINE_LIMIT, TRIAL_DAYS } from '../../shared/config/billing.js';

const LIVE_STATUSES = new Set(['available', 'beta']);

/** Live tools grouped by registry category, so this page never lists a tool that doesn't exist. */
function toolGroups() {
  return CATEGORIES.map((category) => {
    const tools = TOOLS.filter((t) => t.category === category.id && LIVE_STATUSES.has(t.status));
    if (!tools.length) return '';
    return `
      <h3>${category.label}</h3>
      <ul class="info-page__tools">
        ${tools.map((t) => `<li><a href="${t.route}">${t.name}</a></li>`).join('')}
      </ul>`;
  }).join('');
}

export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">About ${APP_NAME}</h1>
        <p class="tool-page__description">${APP_TAGLINE}</p>
      </div>
    </div>
    <div class="panel info-page">
      <h2>What is ${APP_NAME}?</h2>
      <p>
        ${APP_NAME} is a browser-based toolkit for working with 3D models,
        textures and 2D game art. Each tool does one job — optimising a GLB,
        reducing polygons, compressing or resizing textures, encoding KTX2,
        generating LODs, trimming animation data, converting between formats,
        splitting or merging models, inspecting assets, or making sprites and
        thumbnails.
      </p>
      ${toolGroups()}

      <h2>Why it exists</h2>
      <p>
        Getting assets ready for games and realtime apps usually means a
        string of small, fiddly jobs spread across heavyweight desktop
        software and command-line tools. ${APP_NAME} puts those jobs in one
        place, so creators and developers can prepare, check and fix assets
        quickly, without installing anything.
      </p>

      <h2>How it works</h2>
      <p>
        The tools run in your web browser. The files you open are processed
        on your own device and are not uploaded to ${APP_NAME}. The site does
        talk to servers for a few things that aren't your files: keeping
        track of your free trial, checking licence keys, counting which tools
        are used, and loading some tools' code libraries and fonts. The
        <a href="/privacy">privacy page</a> lists exactly what is sent.
      </p>

      <h2>Privacy</h2>
      <p>
        Your models and textures are your own business, which is why the
        tools work locally. Read the <a href="/privacy">privacy page</a> for
        the details.
      </p>

      <h2>Trial and paid access</h2>
      <p>
        Many ${APP_NAME} tools can be tried before purchasing access. Every
        tool is unlocked for ${TRIAL_DAYS} days from your first visit. After
        that, a one-time ${LIFETIME_PRICE_LABEL} lifetime licence unlocks
        every current and future tool on up to ${LICENSE_MACHINE_LIMIT}
        machines — no subscription and no account.
        ${ALL_TOOLS_FREE ? 'At the moment, every tool is temporarily unlocked for everyone.' : ''}
        See <a href="/pricing">pricing</a> for details.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, bug reports or feedback? See the
        <a href="/contact">contact page</a>.
      </p>
    </div>
  `;

  container.appendChild(section);
}
