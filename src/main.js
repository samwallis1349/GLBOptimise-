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

const hostname = (window.location.hostname || '').toLowerCase();
const pathname = (window.location.pathname || '').toLowerCase();
const search = (window.location.search || '').toLowerCase();
const isIllustration =
  hostname.startsWith('illustrator.') ||
  hostname.startsWith('illustration.') ||
  hostname.startsWith('art.') ||
  hostname.includes('illustrator') ||
  pathname.startsWith('/illustrator') ||
  pathname.startsWith('/illustration') ||
  search.includes('illustrator') ||
  search.includes('illustration');

const rootEl = document.getElementById('app');
if (isIllustration) {
  import('./illustration/IllustrationApp.js').then(({ IllustrationApp }) => {
    IllustrationApp(rootEl);
  });
} else {
  import('./app/App.js').then(({ App }) => {
    App(rootEl);
  });
}
