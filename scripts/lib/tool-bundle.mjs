import { build } from 'vite';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds one tool as a standalone static web app (index.html + assets/),
 * with no router, no paywall and no other tools. Shared by the ZIP packager
 * (scripts/package-individual-tools.mjs) and the Windows desktop builder
 * (desktop/build.mjs).
 */

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = path.join(root, 'src');

const toolDependencies = {
  'model-to-isometric': ['thumbnail-maker', 'rig-inspector'],
  'thumbnail-maker': ['rig-inspector'],
  'glb-builder': ['convert-files'],
};

const FRAMED_TOOLS = new Set(['alpha-cutout', 'mobile-ready-checker', 'ktx2-texture-encoder']);

async function copy(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
}

function pageHtml(tool) {
  const title = `Asset Bench - ${tool.name}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${tool.description}">
<link rel="icon" href="./branding/favicon.svg" type="image/svg+xml">
</head><body><div id="app"><header class="ab-header package-header"><img src="./branding/asset-bench-logo.svg" alt=""/><span>Asset Bench</span><strong>${tool.name}</strong></header><main id="page-root"></main></div>
<script type="module" src="./src/main.js"></script></body></html>`;
}

function entryJs(tool) {
  return `import './styles/reset.css';
import './styles/variables.css';
import './styles/global.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/tools.css';
import { mount } from './tools/${tool.id}/index.js';

const container = document.getElementById('page-root');
try { mount(container); }
catch (error) {
  console.error(error);
  container.textContent = 'The tool could not start: ' + (error?.message || error);
}
`;
}

/**
 * Assembles and builds `tool` inside `project` (a scratch folder this
 * function fills). Returns the path of the built static site.
 */
export async function buildToolBundle(tool, project) {
  const projectSrc = path.join(project, 'src');
  const projectPublic = path.join(project, 'public');
  await copy(path.join(source, 'tools', tool.id), path.join(projectSrc, 'tools', tool.id));
  for (const dependency of toolDependencies[tool.id] || []) {
    await copy(path.join(source, 'tools', dependency), path.join(projectSrc, 'tools', dependency));
  }
  await copy(path.join(source, 'shared'), path.join(projectSrc, 'shared'));
  await copy(path.join(source, 'styles'), path.join(projectSrc, 'styles'));
  await copy(path.join(root, 'public', 'branding'), path.join(projectPublic, 'branding'));
  // Self-contained pages the tool frames from public/tools/<id>/; point the frame at the packaged copy.
  if (FRAMED_TOOLS.has(tool.id)) {
    await copy(path.join(root, 'public', 'tools', tool.id), path.join(projectPublic, 'tools', tool.id));
    const indexFile = path.join(projectSrc, 'tools', tool.id, 'index.js');
    const code = await fs.readFile(indexFile, 'utf8');
    await fs.writeFile(indexFile, code.replace(`/tools/${tool.id}/index.html`, `./tools/${tool.id}/index.html`));
  }
  if (tool.id === 'compress-textures') {
    await copy(path.join(root, 'public', 'basis-encoder'), path.join(projectPublic, 'basis-encoder'));
  }
  // A few report/inspection screens offer handoffs to other tools. Keep the
  // current tool running and tell the buyer when a separate tool is needed.
  await fs.mkdir(path.join(projectSrc, 'app'), { recursive: true });
  await fs.writeFile(path.join(projectSrc, 'app', 'router.js'),
    "export function navigate(path) { window.alert('This action opens another Asset Bench tool: ' + path); }\n");
  await fs.writeFile(path.join(project, 'index.html'), pageHtml(tool));
  await fs.writeFile(path.join(projectSrc, 'main.js'), entryJs(tool));
  await fs.writeFile(path.join(projectSrc, 'styles', 'package.css'),
    '.package-header{display:flex;align-items:center;gap:12px;min-height:62px;padding:10px 24px;background:#111;border-bottom:1px solid #333;color:#eee;font:600 15px system-ui}.package-header img{width:30px;height:30px}.package-header strong{margin-left:auto;color:#ffb547;font-size:14px}#page-root{min-height:calc(100vh - 62px)}\n');
  await fs.appendFile(path.join(projectSrc, 'main.js'), "import './styles/package.css';\n");

  const outDir = path.join(project, 'dist');
  await build({
    configFile: false,
    root: project,
    base: './',
    publicDir: projectPublic,
    logLevel: 'error',
    build: { outDir, emptyOutDir: true, target: 'es2022' },
  });
  return outDir;
}
