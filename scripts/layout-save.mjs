/**
 * Dev-only endpoint for the F8 layout editor: POST /__layout/save writes the
 * editor's layout into src/editor/layout.json, which ships with the site as
 * every visitor's default layout. Only exists under `npm run dev`.
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FILE = resolve('src/editor/layout.json');
const MAX_BYTES = 20 * 1024 * 1024; // editor images are stored inline as data URLs

export function layoutSave() {
  return {
    name: 'assetbench-layout-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__layout/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > MAX_BYTES) req.destroy();
        });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            if (!data || typeof data.elements !== 'object') throw new Error('Not a layout');
            await writeFile(FILE, `${JSON.stringify({ version: 1, elements: data.elements }, null, 2)}\n`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, file: 'src/editor/layout.json' }));
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(error.message || error) }));
          }
        });
      });
    },
    // The open page already shows this layout, so saving shouldn't reload it.
    handleHotUpdate({ file }) {
      if (resolve(file) === FILE) return [];
    },
  };
}
