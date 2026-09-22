/**
 * Shared limits/constraints for uploads and batch processing. Centralised
 * so every tool enforces the same rules and a single place can be tuned
 * later (e.g. once server-side processing or accounts exist).
 *
 * These are foundation-stage defaults, not finalised product limits.
 */
export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB per file
export const MAX_FILES_PER_BATCH = 50;
export const ACCEPTED_MODEL_EXTENSIONS = ['.glb', '.gltf'];

/** How long an idle model session may live in IndexedDB before it is
 * eligible for cleanup. Enforced by shared/storage/sessionCleanup.js. */
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
