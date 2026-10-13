import './vscode-api.css';
import { trackApiEvent } from '../../../shared/components/ApiLaunchModal.js';

const ORIGIN = 'https://www.assetbench.co.uk';
const KEY_URL = `${ORIGIN}/api/v1/auth/keys`;
const CHECK_URL = `${ORIGIN}/api/v1/check?role=prop&device=mid`;

const ASSISTANT_PROMPT = `Use the free AssetBench API to inspect my 3D model.
1. Get a free key: POST ${KEY_URL} (no sign-up; the key is in the JSON reply).
2. Send model.glb to POST ${CHECK_URL} as multipart field "file", with header "Authorization: Bearer <key>".
3. Tell me if it will run on phones, Quest and the web, and what to fix first.
Docs: ${ORIGIN}/docs/`;

/** Each tab: label, file name shown in the editor tab, and the steps to copy. */
const TABS = [
  {
    id: 'assistant',
    label: 'AI assistant',
    file: 'prompt.md',
    hint: 'Paste into Copilot Chat, Claude Code, Cursor, Codex or any code assistant.',
    steps: [{ title: 'Ask your assistant', code: ASSISTANT_PROMPT }],
  },
  {
    id: 'windows',
    label: 'Windows',
    file: 'PowerShell',
    hint: 'Open the VS Code terminal (Ctrl + `) and paste each line.',
    steps: [
      { title: 'Get your free key', code: `curl.exe -X POST ${KEY_URL}` },
      { title: 'Inspect your model', code: `curl.exe -X POST "${CHECK_URL}" -H "Authorization: Bearer YOUR_KEY" -F "file=@model.glb"` },
    ],
  },
  {
    id: 'unix',
    label: 'Mac / Linux',
    file: 'zsh',
    hint: 'Open the VS Code terminal (Ctrl + `) and paste each line.',
    steps: [
      { title: 'Get your free key', code: `curl -X POST ${KEY_URL}` },
      { title: 'Inspect your model', code: `curl -X POST "${CHECK_URL}" -H "Authorization: Bearer YOUR_KEY" -F "file=@model.glb"` },
    ],
  },
];

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function paneHtml(tab, active) {
  return `
    <div class="vsapi__pane" role="tabpanel" id="vsapi-pane-${tab.id}" aria-labelledby="vsapi-tab-${tab.id}" ${active ? '' : 'hidden'}>
      <p class="vsapi__hint">${escapeHtml(tab.hint)}</p>
      ${tab.steps
        .map(
          (step, i) => `
        <div class="vsapi__step">
          <div class="vsapi__step-head">
            <span class="vsapi__step-num">${i + 1}</span>
            <span class="vsapi__step-title">${escapeHtml(step.title)}</span>
            <button class="vsapi__copy" type="button" data-tab="${tab.id}" data-step="${i}">Copy</button>
          </div>
          <pre class="vsapi__code"><code>${escapeHtml(step.code)}</code></pre>
        </div>`
        )
        .join('')}
    </div>`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Homepage feature: try the free model check from Visual Studio Code, either
 * by pasting a prompt into any code assistant or two curl lines in the terminal.
 */
export function VsCodeApi() {
  const section = document.createElement('section');
  section.className = 'vsapi container';
  section.setAttribute('aria-labelledby', 'vsapi-title');

  section.innerHTML = `
    <div class="vsapi__frame">
      <div class="vsapi__grid-bg" aria-hidden="true"></div>
      <div class="vsapi__intro">
        <span class="vsapi__badge"><span class="vsapi__pulse" aria-hidden="true"></span>New · Free · No sign-up</span>
        <h2 class="vsapi__title" id="vsapi-title">Try the free API in <span class="vsapi__title-glow">Visual Studio Code</span></h2>
        <p class="vsapi__lede">Inspect any GLB from your editor in seconds. One line asks your AI code assistant, or two lines in the terminal. You get back a verdict for phones, Quest and the web, with what to fix first.</p>
        <ul class="vsapi__points">
          <li>Model checks are free and don't use your 100 monthly operations</li>
          <li>Works with Copilot, Claude Code, Cursor, Codex and more</li>
          <li>Polygons, textures and draw calls scored against real devices</li>
        </ul>
        <a class="btn btn--primary vsapi__docs" href="/docs/">Open the API docs →</a>
      </div>

      <div class="vsapi__window" aria-label="Visual Studio Code example">
        <div class="vsapi__titlebar">
          <span class="vsapi__dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="vsapi__window-name">assetbench-api — Visual Studio Code</span>
        </div>
        <div class="vsapi__tabs" role="tablist" aria-label="How to run it">
          ${TABS.map(
            (tab, i) => `
            <button class="vsapi__tab" role="tab" type="button" id="vsapi-tab-${tab.id}" data-tab="${tab.id}" aria-controls="vsapi-pane-${tab.id}" aria-selected="${i === 0}">
              <span class="vsapi__tab-label">${tab.label}</span>
              <span class="vsapi__tab-file">${tab.file}</span>
            </button>`
          ).join('')}
        </div>
        <div class="vsapi__body">
          ${TABS.map((tab, i) => paneHtml(tab, i === 0)).join('')}
        </div>
        <div class="vsapi__statusbar" aria-hidden="true">
          <span>● AssetBench API</span><span>POST /api/v1/check</span><span>free</span>
        </div>
      </div>
    </div>
  `;

  section.querySelectorAll('.vsapi__tab').forEach((button) => {
    button.addEventListener('click', () => {
      section.querySelectorAll('.vsapi__tab').forEach((b) => b.setAttribute('aria-selected', String(b === button)));
      section.querySelectorAll('.vsapi__pane').forEach((pane) => {
        pane.hidden = pane.id !== `vsapi-pane-${button.dataset.tab}`;
      });
    });
  });

  section.querySelectorAll('.vsapi__copy').forEach((button) => {
    button.addEventListener('click', async () => {
      const tab = TABS.find((t) => t.id === button.dataset.tab);
      const ok = await copyText(tab.steps[Number(button.dataset.step)].code);
      button.textContent = ok ? 'Copied ✓' : 'Select & copy';
      button.classList.toggle('is-copied', ok);
      if (ok) trackApiEvent('vscode_copy');
      setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('is-copied');
      }, 1800);
    });
  });

  return section;
}
