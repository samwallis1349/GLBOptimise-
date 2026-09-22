import { downloadBlob } from '../utils/download.js';

let jsZipPromise = null;
function getJSZip() {
  if (!jsZipPromise) jsZipPromise = import('jszip').then((mod) => mod.default ?? mod);
  return jsZipPromise;
}

/**
 * Exports processed files from a batch, either individually or as a ZIP.
 *
 * Individual download only needed the browser's native download mechanism
 * and has always worked. `downloadAllAsZip` was a documented interface
 * until Generate LODs became the first tool with a genuine multi-file
 * export need (a whole LOD chain, downloaded in one action) — JSZip is
 * loaded lazily via dynamic import so tools that only ever download one
 * file at a time never pay for it in their bundle.
 */
export class BatchExporter {
  /**
   * @param {{ filename: string, blob: Blob }} output
   */
  downloadOne({ filename, blob }) {
    downloadBlob(blob, filename);
  }

  /**
   * @param {{ filename: string, blob: Blob }[]} outputs
   * @param {string} [zipName]
   */
  async downloadAllAsZip(outputs, zipName = 'asset-bench-export.zip') {
    if (!outputs?.length) throw new Error('Nothing to export.');

    const JSZip = await getJSZip();
    const zip = new JSZip();

    // Names are de-duplicated rather than trusted as-is: two outputs
    // sharing a filename would otherwise silently overwrite one another
    // inside the archive.
    const seen = new Map();
    for (const { filename, blob } of outputs) {
      const name = uniqueName(filename, seen);
      zip.file(name, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    downloadBlob(zipBlob, zipName);
    return zipBlob;
  }

  /**
   * Builds a plain-text/JSON report summarising a batch run. Left as an
   * interface boundary until a tool has real per-file results to report on.
   * @param {object[]} _results
   */
  buildReport(_results) {
    throw new Error('buildReport() is not implemented yet.');
  }
}

function uniqueName(filename, seen) {
  const count = seen.get(filename) ?? 0;
  seen.set(filename, count + 1);
  if (count === 0) return filename;
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? `${filename} (${count})` : `${filename.slice(0, dot)} (${count})${filename.slice(dot)}`;
}
