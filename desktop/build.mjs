import { build as buildInstaller } from 'electron-builder';
import sharp from 'sharp';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../src/shared/config/tools.js';
import { TOOL_PRODUCTS } from '../src/shared/config/toolProducts.js';
import { LICENSE_STORE_ID as storeId } from '../src/shared/config/billing.js';
import { buildToolBundle, root } from '../scripts/lib/tool-bundle.mjs';

/**
 * Builds licence-locked Windows installers, one per tool:
 *
 *   npm run build -- reduce-polys optimise-glb   # just these tools
 *   npm run build -- --all                       # every tool
 *   npm run build -- reduce-polys --unconfigured # test build, no product yet
 *   add --keep to also keep the unpacked app for testing
 *
 * Each tool needs its Lemon Squeezy product ID and checkout URL in
 * src/shared/config/toolProducts.js. An --unconfigured build uses product ID 0, which no key can
 * ever match — the app runs but stays locked, so it is safe if it leaks.
 * Installers land in desktop/release/.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// Outside OneDrive: its sync locks files mid-build and breaks electron-builder's renames.
const staging = path.join(os.tmpdir(), 'assetbench-desktop-build');
// The web build must sit inside the repo so imports resolve from node_modules.
const webStaging = path.join(root, '.tmp-desktop-web');
const release = path.join(here, 'release');
const SITE = 'https://www.assetbench.co.uk';

const args = process.argv.slice(2);
const unconfigured = args.includes('--unconfigured');
// Keep the unpacked app (release/<id>-unpacked/) for testing without installing.
const keep = args.includes('--keep');
const ids = args.includes('--all') ? TOOLS.map((tool) => tool.id) : args.filter((arg) => !arg.startsWith('--'));
if (!ids.length) throw new Error('Name the tools to build (e.g. reduce-polys) or pass --all.');

const tools = ids.map((id) => {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool "${id}".`);
  const product = TOOL_PRODUCTS[id];
  if (!unconfigured && (!product?.productId || !product?.checkoutUrl)) {
    throw new Error(`${tool.name} has no productId/checkoutUrl in src/shared/config/toolProducts.js. Add them, or pass --unconfigured for a locked test build.`);
  }
  return { tool, product };
});

for (const dir of [staging, webStaging]) if (existsSync(dir)) await fs.rm(dir, { recursive: true, force: true });
await fs.mkdir(release, { recursive: true });

// 256px+ PNG is all electron-builder needs to make the Windows .ico.
const icon = path.join(staging, 'icon.png');
await fs.mkdir(staging, { recursive: true });
// electron-builder looks upward for a package.json; a stray one in %TEMP% breaks it.
await fs.writeFile(path.join(staging, 'package.json'), '{ "private": true }\n');
await sharp(path.join(root, 'public', 'branding', 'favicon.svg'), { density: 1200 }).resize(512, 512).png().toFile(icon);

try {
  for (const [i, { tool, product }] of tools.entries()) {
    console.log(`[${i + 1}/${tools.length}] ${tool.name}`);
    const appDir = path.join(staging, tool.id, 'app');
    const dist = await buildToolBundle(tool, path.join(webStaging, tool.id));

    await fs.cp(path.join(here, 'app'), appDir, { recursive: true });
    await fs.cp(dist, path.join(appDir, 'tool'), { recursive: true });
    await fs.writeFile(path.join(appDir, 'tool.json'), JSON.stringify({
      id: tool.id,
      name: tool.name,
      storeId,
      productId: unconfigured ? 0 : product.productId,
      buyUrl: unconfigured || !product?.checkoutUrl ? `${SITE}${tool.route}` : product.checkoutUrl,
    }, null, 2));
    await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({
      name: `assetbench-${tool.id}`,
      productName: `Asset Bench ${tool.name}`,
      version: '1.0.0',
      description: tool.description,
      author: 'Asset Bench',
      main: 'main.cjs',
    }, null, 2));

    const fileName = `AssetBench-${tool.name.replace(/[^A-Za-z0-9]+/g, '-')}-Setup${unconfigured ? '-UNCONFIGURED' : ''}.exe`;
    await buildInstaller({
      projectDir: appDir,
      win: ['nsis'],
      x64: true,
      publish: 'never',
      config: {
        appId: `uk.co.assetbench.${tool.id}`,
        productName: `Asset Bench ${tool.name}`,
        directories: { output: path.join(staging, tool.id, 'out'), buildResources: staging },
        electronVersion: JSON.parse(await fs.readFile(path.join(here, 'node_modules', 'electron', 'package.json'), 'utf8')).version,
        asar: true,
        icon,
        win: { icon, artifactName: fileName },
        nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, shortcutName: `Asset Bench ${tool.name}` },
      },
    });
    await fs.copyFile(path.join(staging, tool.id, 'out', fileName), path.join(release, fileName));
    if (keep) await fs.cp(path.join(staging, tool.id, 'out', 'win-unpacked'), path.join(release, `${tool.id}-unpacked`), { recursive: true });
    await fs.rm(path.join(staging, tool.id), { recursive: true, force: true });
    console.log(`    → release/${fileName}`);
  }
} finally {
  await fs.rm(staging, { recursive: true, force: true });
  await fs.rm(webStaging, { recursive: true, force: true });
}
