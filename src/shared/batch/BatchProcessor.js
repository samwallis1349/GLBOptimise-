import { FILE_STATUS } from '../utils/fileStatus.js';

/**
 * Runs a per-tool processing function sequentially over a queue of file
 * records, with progress reporting, per-file failure isolation, and
 * cancel/retry/skip support. Each tool supplies its own `processFile`
 * (e.g. Optimise GLB's optimiseModel) — this class only owns the queue
 * control flow, not any processing logic itself.
 *
 * @example
 *   const batch = new BatchProcessor({
 *     processFile: (record) => optimiseModel(record),
 *     onRecordUpdate: (id, patch) => store.patchRecord(id, patch),
 *     onProgress: ({ completed, total }) => updateProgressBar(completed / total),
 *   });
 *   await batch.run(records);
 */
export class BatchProcessor {
  constructor({ processFile, onRecordUpdate = () => {}, onProgress = () => {} }) {
    this.processFile = processFile;
    this.onRecordUpdate = onRecordUpdate;
    this.onProgress = onProgress;
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
  }

  /**
   * @param {import('../utils/fileStatus.js').FileRecord[]} records
   * @returns {Promise<{ completed: number, failed: number, cancelled: boolean }>}
   */
  async run(records) {
    this.cancelled = false;
    const targets = records.filter((r) => r.selected && r.status !== FILE_STATUS.SKIPPED);
    let completed = 0;
    let failed = 0;

    for (const record of targets) {
      if (this.cancelled) {
        this.onRecordUpdate(record.id, { status: FILE_STATUS.CANCELLED });
        continue;
      }

      this.onRecordUpdate(record.id, { status: FILE_STATUS.PROCESSING, error: null });

      try {
        await this.processFile(record);
        this.onRecordUpdate(record.id, { status: FILE_STATUS.COMPLETE });
        completed += 1;
      } catch (error) {
        this.onRecordUpdate(record.id, {
          status: FILE_STATUS.FAILED,
          error: error?.message ?? 'Unknown processing error',
        });
        failed += 1;
      }

      this.onProgress({ completed: completed + failed, total: targets.length });
    }

    return { completed, failed, cancelled: this.cancelled };
  }
}
