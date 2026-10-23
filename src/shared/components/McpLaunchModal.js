import { openApiPanel, trackApiEvent } from './ApiLaunchModal.js';

// Shown once per visitor; it takes over from the API launch popup (same look, .api-launch styles).
// v2: re-shown to everyone who dismissed the "Coming soon" version.
const DISMISSED_KEY = 'assetbench_mcp_launch_v2';
// assetbench-mcp 1.0.0 is on npm, so the install snippet is live.
const COMING_SOON = false;

/** mcp/README.md */
const HIGHLIGHTS = [
  { name: 'Ask in plain English', what: '"Make robot.glb ready for Unity on mid-range phones." The agent picks the tool and the settings.' },
  { name: 'Files stay put', what: 'It reads your models and images from disk and saves results right next to them, unzipped.' },
  { name: 'Your key, your plan', tag: 'Checks free', what: 'Uses your API operations. Free key: 100 a month. Included in All Access.' },
];

/** The MCP tools by group (mcp/index.js); `*` marks a free one. */
const TOOLS = [
  ['3D', ['check_model*', 'make_game_ready', 'optimize_model', 'reduce_model*', 'generate_lods', 'convert_model']],
  ['Textures', ['compress_textures', 'resize_texture']],
  ['Apps', ['make_app_assets', 'make_store_screenshots']],
  ['Info', ['explain_target*', 'account_status*']],
];
const toolName = (t) => (t.endsWith('*') ? `<code>${t.slice(0, -1)}</code> (Free)` : `<code>${t}</code>`);

/** The install snippets, also shown on the /tools MCP banner. */
export const INSTALL = {
  'claude-code': {
    label: 'Claude Code',
    code: 'claude mcp add assetbench -e ASSETBENCH_API_KEY=your-key -- npx -y assetbench-mcp',
  },
  json: {
    label: 'Claude Desktop · Cursor · VS Code',
    code: `{
  "mcpServers": {
    "assetbench": {
      "command": "npx",
      "args": ["-y", "assetbench-mcp"],
      "env": { "ASSETBENCH_API_KEY": "your-key" }
    }
  }
}`,
  },
};

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function seen(key) {
  try { return Boolean(localStorage.getItem(key) || sessionStorage.getItem(key)); } catch { return false; }
}

function remember() {
  try {
    localStorage.setItem(DISMISSED_KEY, 'true');
    sessionStorage.setItem(DISMISSED_KEY, 'true');
  } catch {}
}

/** Announces the AssetBench MCP server once per visitor. */
export function initMcpLaunchModal() {
  if (typeof window === 'undefined') return;
  if (location.pathname.startsWith('/docs')) return;
  if (seen(DISMISSED_KEY)) return;

  setTimeout(() => {
    if (document.querySelector('.welcome-modal-overlay')) return;
    openMcpLaunchModal();
  }, 1500);
}

export function openMcpLaunchModal() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'mcp-launch-title');

  overlay.innerHTML = `
    <div class="welcome-modal api-launch mcp-launch">
      <button class="welcome-modal__close" type="button" aria-label="Close">✕</button>
      <div class="api-launch__card">
        <figure class="api-launch__poster">
          <img src="/images/mcp-poster.svg" width="1200" height="640" alt="An AI agent is asked to make robot.glb ready for Unity on mid-range phones; it calls AssetBench and a folder fills with three LODs and Unity import notes">
          <span class="api-launch__badge">${COMING_SOON ? 'Coming soon' : 'New'} · MCP server</span>
        </figure>
        <div class="api-launch__body">
          <h2 class="api-launch__title" id="mcp-launch-title">Your AI agent can ${COMING_SOON ? 'soon' : 'now'} <em>use AssetBench</em></h2>
          <p class="api-launch__lede">Add AssetBench to Claude, Cursor, VS Code or any MCP client and ask for what you need. It checks your 3D models, makes them game-ready for your engine and builds every app icon and store screenshot, without you opening a browser.</p>
          <ul class="api-launch__products">
            ${HIGHLIGHTS.map((h) => `<li><span class="api-launch__product-head"><b>${h.name}</b>${h.tag ? `<span class="api-launch__tag">${h.tag}</span>` : ''}</span><span>${h.what}</span></li>`).join('')}
          </ul>
          ${COMING_SOON ? `<p class="mcp-launch__soon"><b>Coming soon.</b> The one-line install for Claude Code, Claude Desktop, Cursor and VS Code goes live in the next few days. Get a free key now and you'll be ready.</p>` : `<div class="mcp-launch__install">
            <div class="mcp-launch__tabs" role="tablist" aria-label="Your app">
              ${Object.entries(INSTALL).map(([id, i], n) => `<button type="button" role="tab" class="mcp-launch__tab" data-install="${id}" aria-selected="${n === 0}">${i.label}</button>`).join('')}
            </div>
            <div class="mcp-launch__code">
              <pre><code></code></pre>
              <button type="button" class="mcp-launch__copy">Copy</button>
            </div>
          </div>`}
          <table class="api-launch__commands">
            <thead><tr><th scope="col">Group</th><th scope="col">Tools</th></tr></thead>
            <tbody>${TOOLS.map(([group, list]) => `<tr><th scope="row">${group}</th><td>${list.map(toolName).join(', ')}</td></tr>`).join('')}</tbody>
          </table>
          <div class="api-launch__actions">
            <a class="api-launch__cta" href="/docs/">Get a free key →</a>
            <a class="api-launch__plans-link" href="/pricing">Compare plans</a>
            <button class="api-launch__later" type="button">Maybe later</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const codeEl = overlay.querySelector('.mcp-launch__code code');
  const copyButton = overlay.querySelector('.mcp-launch__copy');
  if (codeEl) setUpInstall(overlay, codeEl, copyButton);

  function onKeydown(e) {
    if (e.key === 'Escape') dismiss();
  }
  function close() {
    remember();
    overlay.classList.add('welcome-modal-overlay--closing');
    document.removeEventListener('keydown', onKeydown);
    setTimeout(() => overlay.remove(), 220);
  }
  function dismiss() {
    trackApiEvent('mcp_dismiss');
    close();
  }

  overlay.querySelector('.welcome-modal__close').addEventListener('click', dismiss);
  overlay.querySelector('.api-launch__later').addEventListener('click', dismiss);
  overlay.querySelector('.api-launch__plans-link').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
  overlay.querySelector('.api-launch__cta').addEventListener('click', (e) => {
    trackApiEvent('mcp_click');
    // Open the playground (where the free key is) over the current page; the href stays as a fallback.
    e.preventDefault();
    close();
    openApiPanel();
  });

  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('welcome-modal-overlay--open'));
  trackApiEvent('mcp_shown');
  overlay.querySelector('.api-launch__cta').focus({ preventScroll: true });
  return close;
}

/** The app tabs and Copy button on the install snippet. */
function setUpInstall(overlay, codeEl, copyButton) {
  let install = 'claude-code';
  const showInstall = () => {
    codeEl.innerHTML = escapeHtml(INSTALL[install].code);
    overlay.querySelectorAll('.mcp-launch__tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.install === install)));
    copyButton.textContent = 'Copy';
  };
  overlay.querySelectorAll('.mcp-launch__tab').forEach((t) => t.addEventListener('click', () => {
    install = t.dataset.install;
    showInstall();
  }));
  bindMcpCopy(copyButton, () => INSTALL[install].code);
  showInstall();
}

/** Copies an install snippet on click and counts it as an `mcp_copy` (here and on the /tools banner). */
export function bindMcpCopy(copyButton, code) {
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code());
      copyButton.textContent = 'Copied';
      trackApiEvent('mcp_copy');
    } catch {
      copyButton.textContent = 'Select and copy';
    }
  });
}
