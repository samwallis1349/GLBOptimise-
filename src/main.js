import { App } from './app/App.js';

// After a deploy, a tab opened earlier still asks for the old hashed chunks
// (e.g. /assets/HomePage-<oldhash>.css), which now 404. Reload once to pick up
// the new build; the timestamp guard stops a reload loop if the chunk is truly missing.
window.addEventListener('vite:preloadError', (event) => {
  let last = 0;
  try { last = Number(sessionStorage.getItem('ab-chunk-reload')) || 0; } catch {}
  if (Date.now() - last < 10000) return;
  try { sessionStorage.setItem('ab-chunk-reload', String(Date.now())); } catch {}
  event.preventDefault();
  location.reload();
});

App(document.getElementById('app'));
