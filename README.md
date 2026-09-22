# Asset Bench

**Small tools. Bigger worlds.**

Asset Bench is a browser-based suite of tools for preparing 3D assets for
games and realtime applications. Every tool runs entirely client-side —
models never leave your device.

## What's here

- **Optimise GLB** — a real, working tool. Reduces GLB file size using a
  genuine glTF Transform pipeline (cleanup, texture compression, mesh
  optimisation), with a live Three.js preview and mandatory post-export
  validation. See [`src/tools/optimise-glb`](src/tools/optimise-glb).
- **Seven more tools** (Reduce Polys, Compress Textures, Generate LODs,
  Strip Animations, Pack PBR, Convert Files, Inspect GLB) — page shells
  wired into navigation, sharing the same design system, but without a
  processing engine yet. They show "Coming soon" until built.
- The shared foundation: design system, upload/file-queue components,
  cross-tool model handoff (IndexedDB), and batch-processing interfaces
  that every future tool will build on.

## Tech stack

- [Vite](https://vitejs.dev/) — build tool and dev server
- Vanilla JavaScript (ES modules), HTML, CSS — no framework
- [Three.js](https://threejs.org/) + [glTF Transform](https://gltf-transform.dev/) — used by Optimise GLB
- IndexedDB — local, temporary cross-tool model storage

Deliberately lightweight: no React/Vue/Angular, no state-management
library, no CSS framework. A dependency is added only once a tool
genuinely needs it.

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build to dist/
npm run preview   # preview the production build locally
```

## Architecture

```
src/
  app/            Router, app-wide state, App shell (Header + routed page + Footer)
  pages/          Static site pages (home, tools, about, pricing, 404)
  tools/          One folder per tool — see below
  shared/         Design system, components, GLB utilities, storage, batch foundations
  services/       Future service boundaries (accounts/credits) — placeholders only
  styles/         Shared design system CSS
```

Asset Bench is **one Vite application**, not eight separate sites. Every
tool is isolated in its own folder under `src/tools/<tool-id>/`, and the
router lazy-loads each tool's module on demand — so visiting the
homepage never downloads Three.js or glTF Transform, and every tool's
bundle is independent.

### Module boundaries

- **Shared code** (`src/shared/`) — design tokens, reusable UI
  components (Header, Footer, ToolCard, UploadZone, FileQueue, etc.),
  GLB analysis interfaces, IndexedDB storage, and batch-processing
  scaffolding. Anything more than one tool will eventually need lives
  here.
- **Tool-specific code** (`src/tools/<tool-id>/`) — everything unique to
  one tool. A developer (human or AI) working on `pack-pbr/` should
  never need to touch `optimise-glb/`.

Each tool folder exports an `index.js` with a `mount(container)`
function that the router calls, and may return a cleanup function that
runs automatically before the next navigation (used by Optimise GLB to
dispose its Three.js viewers and unsubscribe listeners).

### Optimise GLB's structure

Optimise GLB predates the shared design system and shared GLB utilities
(`src/shared/glb/`, `src/shared/viewer/`), so it currently ships its own
complete, self-contained implementation — own state store, own GLB
analysis/processing pipeline, own Three.js viewer, own CSS (loaded
dynamically only while the tool is mounted, namespaced with `.og-*`
class prefixes and `--color-*` CSS variables so it never collides with
the site-wide `.btn`/`.panel`/design tokens). This is a known,
intentional divergence — a good candidate to unify with
`src/shared/glb/` and `src/shared/viewer/` once a second tool (Reduce
Polys, Compress Textures, or Inspect GLB) needs the same analysis or
preview logic.

### Cross-tool model handoff

`src/shared/storage/ModelSessionStore.js` is an IndexedDB-backed store
so a model analysed in one tool can be opened directly in another
without a re-upload (e.g. Optimise GLB flags 4K textures → user jumps to
Compress Textures with the file already loaded). Binary model data is
never placed in the URL, `localStorage`, or `sessionStorage`.

### Multi-file / batch foundation

Every tool's file queue is built around a list of file records (see
`src/shared/utils/fileStatus.js` for the shape and lifecycle statuses)
from the start — not retrofitted later. `src/shared/batch/` has the
sequencing (`BatchProcessor`) and export (`BatchExporter`) interfaces
every future multi-file tool will use; ZIP export is a documented
interface until a tool actually needs it (JSZip isn't installed yet).

## How to add a new tool

1. Create `src/tools/<tool-id>/` (use an existing "coming soon" tool,
   e.g. `src/tools/reduce-polys/`, as a starting template).
2. Update its entry in `src/shared/config/tools.js` — the single source
   of truth for every tool's name, route, description, icon, and status.
   Homepage cards, the `/tools` page, and routing all read from this
   list; nothing else needs to change.
3. Set `status: 'available'` once the tool actually works.
4. Reuse shared components (`src/shared/components/`) and utilities
   instead of duplicating them.
5. Keep processing logic inside the tool's own folder unless a second
   tool needs the same logic — then promote it to `src/shared/`.

## Notes

- Uploaded 3D files are never sent to a server — everything happens in
  the browser.
- Accounts, credits, and payments are **not** implemented.
  `src/services/JobService.js` and `CreditService.js` are documented
  placeholders for a future commercial layer.
- No tool fakes statistics, progress, or processing it hasn't actually
  done. Unfinished tools say "Coming soon," not simulated results.
