import { defineConfig } from 'vite';
import { seoPages } from './scripts/seo-pages.mjs';

// Asset Bench is a single-page app with client-side routing, so every
// unknown path must fall through to index.html (handled automatically by
// Vite's dev server and by most static hosts in "SPA fallback" mode).
export default defineConfig({
  root: '.',
  // seoPages writes a per-tool HTML file and sitemap.xml after each build.
  plugins: [seoPages()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
