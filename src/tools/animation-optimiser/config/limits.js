// Guardrails for Animation Inspector. Read-only tool: nothing is ever
// written back, so these exist purely to keep a huge upload from hanging
// the tab rather than to bound an export.

/** Reject any single file above this size outright. */
export const HARD_FILE_LIMIT = 500 * 1024 * 1024; // 500 MB

/** Above this, decoded memory (document + textures + Three.js scene) gets heavy. */
export const MEMORY_WARNING_THRESHOLD = 120 * 1024 * 1024; // 120 MB

/**
 * Curve sampling ceiling. A baked mocap clip can carry tens of thousands of
 * keys per channel; drawing every one of them into a ~600px-wide canvas is
 * wasted work and makes the curve unreadable. Above this the curve editor
 * draws an evenly-strided subset — the *analysis* always uses every key, only
 * the drawing is decimated.
 */
export const MAX_CURVE_POINTS = 900;

/** Keys-per-second above which a clip is flagged as denser than it needs to be. */
export const DENSE_SAMPLE_RATE = 120;

/**
 * How far apart the first and last keyframe of a channel may sit before the
 * clip is called a broken loop. Rotations are compared as quaternion dot
 * product, translations/scales in model units, so the two use separate
 * tolerances.
 */
export const LOOP_POSITION_TOLERANCE = 1e-3;
export const LOOP_ROTATION_TOLERANCE = 1e-3;

/** Accepted file extensions/mime types for upload validation. */
export const ACCEPTED_EXTENSIONS = ['.glb', '.gltf'];
export const ACCEPTED_MIME_TYPES = ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'];
