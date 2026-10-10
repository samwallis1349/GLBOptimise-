/**
 * Builds the Model Optimiser extension into extensions/model-optimiser/dist
 * (the folder to load unpacked or zip for the Chrome Web Store):
 * static files from public/, the engine Web Worker and the panel script
 * bundled with esbuild, and the Basis KTX2 encoder .wasm.
 *
 *   node extensions/model-optimiser/build.mjs [--zip]
 */
import { build } from 'esbuild';
import JSZip from 'jszip';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DIST = join(HERE, 'dist');

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
await cp(join(ROOT, 'node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm'), join(DIST, 'basis_encoder.wasm'));

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
  logLevel: 'warning',
});

const { version } = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8'));
console.log(`built ${relative(ROOT, DIST)} (v${version})`);

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
  const out = join(ROOT, 'extensions', `assetbench-model-optimiser-${version}.zip`);
  await writeFile(out, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  console.log(`zipped ${relative(ROOT, out)}`);
}
