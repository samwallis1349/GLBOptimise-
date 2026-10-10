import JSZip from 'jszip';
import { assetReport, batchCsv, htmlReport, manifest } from './reports.js';
import { outputNames } from './naming.js';

/**
 * Builds the batch download. Outputs held back by validation are left out
 * (and listed in the reports); paths that collide — two "crate.glb" from
 * different folders exported flat — get a numeric suffix rather than
 * overwriting each other.
 *
 * @returns {Promise<{ zip: JSZip, files: string[] }>}
 */
export function collectFiles(results, settings) {
  const files = [];
  const used = new Set();
  const unique = (path) => {
    if (!used.has(path.toLowerCase())) {
      used.add(path.toLowerCase());
      return path;
    }
    const dot = path.lastIndexOf('.');
    for (let i = 2; ; i += 1) {
      const candidate = dot > path.lastIndexOf('/') ? `${path.slice(0, dot)}_${i}${path.slice(dot)}` : `${path}_${i}`;
      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase());
        return candidate;
      }
    }
  };

  for (const r of results) {
    if (!r.outputs?.length) continue;
    for (const out of r.outputs) {
      if (out.heldBack) continue;
      files.push({ path: unique(out.path), bytes: out.bytes });
    }
    if (settings.export.reportJson && settings.stages.find((s) => s.id === 'report')?.enabled) {
      files.push({ path: unique(outputNames(r, settings).report), bytes: json(assetReport(r, settings)) });
    }
  }
  const reportOn = settings.stages.find((s) => s.id === 'report')?.enabled;
  if (settings.export.manifest) files.push({ path: unique('manifest.json'), bytes: json(manifest(results, settings)) });
  if (settings.export.csv && reportOn) files.push({ path: unique('batch_summary.csv'), bytes: text(batchCsv(results)) });
  if (settings.export.reportHtml && reportOn) files.push({ path: unique('report.html'), bytes: text(htmlReport(results, settings)) });
  return files;
}

export async function buildZip(results, settings, { onProgress } = {}) {
  const zip = new JSZip();
  const files = collectFiles(results, settings);
  for (const f of files) zip.file(f.path, f.bytes, { binary: true });
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (meta) => onProgress?.(meta.percent / 100));
  return { data, files: files.map((f) => f.path) };
}

const text = (s) => new TextEncoder().encode(s);
const json = (o) => text(JSON.stringify(o, null, 2));
