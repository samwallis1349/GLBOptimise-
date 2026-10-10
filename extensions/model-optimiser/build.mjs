/**
 * Builds one edition of the extension (editions.js) into
 * extensions/model-optimiser/dist/<edition> (the folder to load unpacked or
 * zip for the Chrome Web Store): static files from public/ with the
 * edition's manifest name, the engine Web Worker and the panel script
 * bundled with esbuild, and the Basis KTX2 .wasm when Compress is included.
 *
 *   node extensions/model-optimiser/build.mjs [--edition reduce-polys|model-optimiser] [--zip]
 */
import { build } from 'esbuild';
import JSZip from 'jszip';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EDITION, EDITIONS } from './editions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const EDITION_ID = arg('--edition') || DEFAULT_EDITION;
const EDITION = EDITIONS[EDITION_ID];
if (!EDITION) throw new Error(`Unknown edition '${EDITION_ID}'. Use one of: ${Object.keys(EDITIONS).join(', ')}.`);
const DIST = join(HERE, 'dist', EDITION_ID);

// worker/api/ktx2.js falls back to a wrangler-only .wasm import; the
// extension sets the compiled module itself (src/engine-worker.js).
const stubBasisWasm = {
  name: 'stub-basis-wasm',
  setup(b) {
    b.onResolve({ filter: /basisWasm\.js$/ }, () => ({ path: 'basis-wasm-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default null;', loader: 'js' }));
  },
};

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(join(HERE, 'public'), DIST, { recursive: true });
if (EDITION.tools.includes('compress')) {
  await cp(join(ROOT, 'node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm'), join(DIST, 'basis_encoder.wasm'));
}

const manifestPath = join(DIST, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.name = EDITION.name;
manifest.short_name = EDITION.shortName;
manifest.description = EDITION.description;
manifest.action.default_title = EDITION.shortName;
if (manifest.description.length > 132) throw new Error('Store descriptions are limited to 132 characters.');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

await build({
  entryPoints: { 'engine-worker': join(HERE, 'src/engine-worker.js'), panel: join(HERE, 'src/panel.js') },
  outdir: DIST,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome116',
  minify: true,
  legalComments: 'none',
  plugins: [stubBasisWasm],
  // Dynamic imports on Node-only code paths (glTF-Transform's file IO, the
  // Basis glue's Node loader); never reached in the browser.
  external: ['module', 'node:fs', 'node:path'],
  define: { __EDITION__: JSON.stringify({ id: EDITION_ID, ...EDITION }) },
  logLevel: 'warning',
});

const { version } = manifest;
console.log(`built ${relative(ROOT, DIST)} — ${EDITION.name} v${version}`);

if (process.argv.includes('--zip')) {
  const files = async (dir) => {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await files(path)));
      else out.push(path);
    }
    return out;
  };
  const zip = new JSZip();
  for (const path of await files(DIST)) zip.file(relative(DIST, path).split(sep).join('/'), await readFile(path));
  const out = join(ROOT, 'extensions', `assetbench-${EDITION_ID}-${version}.zip`);
  await writeFile(out, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  console.log(`zipped ${relative(ROOT, out)}`);
}
