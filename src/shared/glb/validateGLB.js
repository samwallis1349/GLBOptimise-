/**
 * Validates that a File is a structurally sound GLB/glTF before any tool
 * attempts to process it (correct magic bytes, valid JSON chunk, etc.).
 *
 * NOT YET IMPLEMENTED. Real validation needs to actually parse the
 * binary container, so it is left as a documented interface rather than
 * a fake "always valid" stub — a tool must not tell the user a corrupt
 * file passed validation.
 *
 * Intended return shape:
 *   { valid: boolean, errors: string[] }
 *
 * @param {File} _file
 * @returns {Promise<{ valid: boolean, errors: string[] }>}
 */
export async function validateGLB(_file) {
  throw new Error('validateGLB() is not implemented yet.');
}
