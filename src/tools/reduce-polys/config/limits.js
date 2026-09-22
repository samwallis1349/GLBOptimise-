// Central, easy-to-tune limits for upload handling and memory safety.
// Nothing here is a hard technical ceiling of the browser — these are
// product-level guardrails so AssetBench fails predictably instead of
// hanging or crashing the tab.

/** Reject any single file above this size outright. */
export const HARD_FILE_LIMIT = 500 * 1024 * 1024; // 500 MB

/**
 * Above this size, warn the user before processing that decoded memory
 * usage (parsed document + textures + Three.js scene + output buffer)
 * may be substantial. GLBs commonly expand 3-6x in memory once texture
 * data is decoded, so this is intentionally conservative.
 */
export const MEMORY_WARNING_THRESHOLD = 120 * 1024 * 1024; // 120 MB

/** Rough multiplier used to estimate peak memory needed to process a file. */
export const ESTIMATED_MEMORY_MULTIPLIER = 4;

/** Above this combined batch size, warn before building a ZIP in memory. */
export const ZIP_SIZE_WARNING_THRESHOLD = 300 * 1024 * 1024; // 300 MB

/** How long a temporary IndexedDB model session is kept before it expires. */
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Accepted file extensions/mime types for upload validation. */
export const ACCEPTED_EXTENSIONS = ['.glb'];
export const ACCEPTED_MIME_TYPES = ['model/gltf-binary', 'application/octet-stream'];

/** Batch processing is sequential by default; this is a documented seam, not a live knob. */
export const DEFAULT_BATCH_CONCURRENCY = 1;
