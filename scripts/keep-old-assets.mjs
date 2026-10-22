import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// A deploy replaces every file in dist/, so a tab opened before it still asks
// for the old hashed chunks (/assets/Foo-<oldhash>.js), gets a 404 and main.js
// reloads the page, losing whatever the person was doing in a tool. This keeps
// each build's assets in .asset-archive/ and puts the ones from the last
// KEEP_DAYS back into dist/assets, so old tabs carry on until they navigate.
const KEEP_DAYS = 7;

export function keepOldAssets() {
  let outDir = 'dist';
  return {
    name: 'keep-old-assets',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const assets = join(outDir, 'assets');
      const archive = resolve(outDir, '..', '.asset-archive');
      const manifestPath = join(archive, 'manifest.json');
      if (!existsSync(assets)) return;
      mkdirSync(archive, { recursive: true });

      let seen = {};
      try { seen = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {}
      const now = Date.now();
      const current = new Set(readdirSync(assets));

      for (const name of current) {
        copyFileSync(join(assets, name), join(archive, name));
        seen[name] = now;
      }

      let restored = 0;
      for (const [name, lastLive] of Object.entries(seen)) {
        if (current.has(name)) continue;
        const file = join(archive, name);
        if (now - lastLive > KEEP_DAYS * 86400000 || !existsSync(file)) {
          rmSync(file, { force: true });
          delete seen[name];
          continue;
        }
        copyFileSync(file, join(assets, name));
        restored++;
      }

      writeFileSync(manifestPath, JSON.stringify(seen, null, 2));
      if (restored) console.log(`keep-old-assets: kept ${restored} file(s) from earlier builds`);
    },
  };
}
