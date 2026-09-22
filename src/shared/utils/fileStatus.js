import { createId } from './ids.js';

/**
 * Canonical lifecycle states for a file/model record moving through a
 * tool's queue. Shared so every tool's FileQueue and BatchProcessor agree
 * on the same vocabulary.
 *
 * WAITING     — added to the queue, not yet analysed
 * ANALYSING   — shared GLB analysis running
 * READY       — analysed, waiting for the user to start processing
 * PROCESSING  — the tool's processing engine is running
 * VALIDATING  — output is being checked before being marked complete
 * COMPLETE    — finished successfully
 * WARNING     — finished, but with non-fatal issues worth surfacing
 * FAILED      — processing failed
 * CANCELLED   — the user cancelled it before it finished
 * SKIPPED     — deliberately excluded from a batch run
 */
export const FILE_STATUS = Object.freeze({
  WAITING: 'WAITING',
  ANALYSING: 'ANALYSING',
  READY: 'READY',
  PROCESSING: 'PROCESSING',
  VALIDATING: 'VALIDATING',
  COMPLETE: 'COMPLETE',
  WARNING: 'WARNING',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  SKIPPED: 'SKIPPED',
});

/**
 * Shape of a file/model record used across tool queues (documentation
 * only — plain objects are used at runtime, not classes):
 *
 * @typedef {Object} FileRecord
 * @property {string} id
 * @property {File} file
 * @property {string} filename
 * @property {number} bytes
 * @property {keyof typeof FILE_STATUS} status
 * @property {boolean} selected
 * @property {Record<string, unknown>} toolData  tool-specific processing data
 * @property {string[]} warnings
 * @property {string|null} error
 * @property {number} createdAt
 */

/** Creates a new FileRecord in the WAITING state. */
export function createFileRecord(file, { id = createId('file'), createdAt = Date.now() } = {}) {
  return {
    id,
    file,
    filename: file.name,
    bytes: file.size,
    status: FILE_STATUS.WAITING,
    selected: true,
    toolData: {},
    warnings: [],
    error: null,
    createdAt,
  };
}
