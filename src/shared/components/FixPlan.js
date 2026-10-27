/**
 * "Your fix plan" (27 Oct, user: AI ideas #1): after a check, 2-4 plain steps in order, each with the tool that does
 * it, written by a small AI from the check's numbers (worker/api/ai.js). The file never leaves the browser: only the
 * problems the check already shows on screen are sent. If the AI is off, over its daily cap or fails, the plan comes
 * back rule-based, so the card always says what to do next. Used by Inspect GLB and the Mobile Ready Checker.
 *
 * problems: [{ name, value, budget, state: 'bad'|'warn', tools: [tool route slugs] }]
 */
import { trackApiEvent } from './ApiLaunchModal.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A card that fills in when the plan arrives. Nothing to fix = nothing shown. */
export function FixPlan({ tool, target = '', score = null, problems = [] }) {
  const card = document.createElement('section');
  card.className = 'fix-plan';
  if (!problems.length) { card.hidden = true; return card; }
  card.innerHTML = '<header><span class="fix-plan__badge">✨ Your fix plan</span><small>Working it out…</small></header><ol class="fix-plan__steps is-loading"><li></li><li></li></ol>';
  fetch('/api/ai/fixplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, target, score, problems }) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j?.steps?.length) { card.hidden = true; return; }
      card.innerHTML = `
        <header><span class="fix-plan__badge">✨ Your fix plan</span><small>${target ? `for a ${esc(target.toLowerCase())} · ` : ''}${j.ai ? 'written by AI from your numbers' : 'from your numbers'} · your file never leaves your device</small></header>
        <ol class="fix-plan__steps">${j.steps.map((s) => `<li><p>${esc(s.text)}</p><a class="btn btn--primary fix-plan__go" href="/${esc(s.tool)}" data-tool="${esc(s.tool)}">Open ${esc(s.toolName)} →</a></li>`).join('')}</ol>`;
      card.querySelectorAll('.fix-plan__go').forEach((a) => a.addEventListener('click', () => trackApiEvent('fixplan_click')));
      trackApiEvent('fixplan_shown');
    })
    .catch(() => { card.hidden = true; }); // vite dev has no Worker: no card
  return card;
}
