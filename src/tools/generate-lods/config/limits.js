// Central, easy-to-tune limits for upload handling and memory safety.
// A copy of Reduce Polys's own config/limits.js — each self-contained tool
// keeps its own scoped copy for now (see that tool's file for why).

/** Reject any single file above this size outright. */
export const HARD_FILE_LIMIT = 500 * 1024 * 1024; // 500 MB

/**
 * Above this size, warn the user before processing that decoded memory
 * usage may be substantial. Generating several LODs means several parsed
 * copies of the source document exist across the run (never simultaneously
 * for long — each is exported and released before the next begins — but
 * the peak is still higher than a single-output tool like Reduce Polys),
 * so this tool leaves extra headroom before it warns.
 */
export const MEMORY_WARNING_THRESHOLD = 80 * 1024 * 1024; // 80 MB

/** Rough multiplier used to estimate peak memory needed to process a file. */
export const ESTIMATED_MEMORY_MULTIPLIER = 4;

/** Maximum number of LOD levels a chain may contain (including LOD0). */
export const MAX_LOD_LEVELS = 6;
export const MIN_LOD_LEVELS = 2;

/** Accepted file extensions/mime types for upload validation. */
export const ACCEPTED_EXTENSIONS = ['.glb', '.gltf'];
export const ACCEPTED_MIME_TYPES = ['model/gltf-binary', 'application/octet-stream'];
