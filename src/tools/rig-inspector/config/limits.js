// Central, easy-to-tune limits for upload handling — mirrors the other
// tools' config/limits.js. Rig Inspector never re-exports a GLB, so there
// is no memory multiplier or ZIP threshold to carry over here.

/** Reject any single file above this size outright. */
export const HARD_FILE_LIMIT = 500 * 1024 * 1024; // 500 MB

/** Above this size, warn before parsing — a big skinned mesh plus its
 * skeleton and Three.js preview can still add up in memory. */
export const MEMORY_WARNING_THRESHOLD = 120 * 1024 * 1024; // 120 MB

/** Accepted file extensions/mime types for upload validation. */
export const ACCEPTED_EXTENSIONS = ['.glb', '.gltf'];
export const ACCEPTED_MIME_TYPES = ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'];
