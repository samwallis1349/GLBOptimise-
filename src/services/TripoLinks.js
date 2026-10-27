/**
 * Tripo links that still work behind an ad blocker (27 Oct, user: "my tripo affiliate link is broken" - it wasn't:
 * ad blockers and blocking routers block Impact's tracking address, so those visitors got a dead page).
 *
 * Every Tripo button points at our own /go/tripo (config/tripo.js), which counts the click and forwards to the
 * affiliate link (worker/index.js). On a click this checks, there and then, whether Tripo's tracking address can be
 * reached. If it can, the new tab goes the affiliate way. If it's blocked, the tab goes straight to tripo3d.ai, so the
 * visitor still gets to Tripo (we're not credited for those), and it's counted as tripo_blocked.
 *
 * Nothing contacts Impact until someone clicks a Tripo button.
 */
import { TRIPO_DIRECT_URL, TRIPO_GO_PATH, TRIPO_URL } from '../shared/config/tripo.js';
import { trackApiEvent } from '../shared/components/ApiLaunchModal.js';

const PROBE_MS = 1500;

/** Resolves true when Tripo's tracking address answers, false when it's blocked or too slow. */
function trackerReachable() {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), PROBE_MS);
  return fetch(new URL(TRIPO_URL).origin, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: stop.signal })
    .then(() => true, () => false)
    .finally(() => clearTimeout(timer));
}

export function initTripoLinks() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[data-tripo-link]');
    // a modified or middle click opens /go/tripo as it is: still counted, still the affiliate way
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // the tab is opened now, inside the click, so pop-up blockers allow it; it's pointed at the right place after
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    trackerReachable().then((ok) => {
      if (!ok) trackApiEvent('tripo_blocked');
      const to = ok ? TRIPO_GO_PATH : TRIPO_DIRECT_URL;
      if (tab) tab.location.href = to;
      else location.href = to;
    });
  }, true);
}
