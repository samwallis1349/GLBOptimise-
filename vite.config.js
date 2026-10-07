import { defineConfig } from 'vite';
import { seoPages } from './scripts/seo-pages.mjs';
import { layoutSave } from './scripts/layout-save.mjs';
import { adsense } from './scripts/adsense.mjs';

// Asset Bench is a single-page app with client-side routing, so every
// unknown path must fall through to index.html (handled automatically by
// Vite's dev server and by most static hosts in "SPA fallback" mode).
export default defineConfig({
  root: '.',
  // seoPages writes a per-tool HTML file and sitemap.xml after each build.
  // layoutSave lets the F8 editor write src/editor/layout.json under `npm run dev`.
  // adsense adds the AdSense verification tag and ads.txt (see src/shared/config/ads.js).
  plugins: [adsense(), seoPages(), layoutSave()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
