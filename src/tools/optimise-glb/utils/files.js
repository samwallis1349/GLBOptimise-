import { HARD_FILE_LIMIT, MEMORY_WARNING_THRESHOLD, ACCEPTED_EXTENSIONS } from '../config/limits.js';

/**
 * @typedef {Object} FileValidationResult
 * @property {boolean} accepted
 * @property {string|null} error
 * @property {string|null} warning
 */

/** @param {File} file @returns {FileValidationResult} */
export function validateFile(file) {
  const name = file.name || 'untitled.glb';
  const lower = name.toLowerCase();
  const hasValidExtension = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));

  if (!hasValidExtension) {
    return { accepted: false, error: `"${name}" is not a .glb file.`, warning: null };
  }

  if (file.size === 0) {
    return { accepted: false, error: `"${name}" is empty.`, warning: null };
  }

  if (file.size > HARD_FILE_LIMIT) {
    return {
      accepted: false,
      error: `"${name}" is larger than the ${Math.round(HARD_FILE_LIMIT / 1024 / 1024)}MB limit for this session.`,
      warning: null,
    };
  }

  if (file.size > MEMORY_WARNING_THRESHOLD) {
    return {
      accepted: true,
      error: null,
      warning: `"${name}" is large (${(file.size / 1024 / 1024).toFixed(1)}MB). Processing may use significant memory and take longer.`,
    };
  }

  return { accepted: true, error: null, warning: null };
}

/** Quick magic-byte sanity check for GLB files before we hand them to gltf-transform. */
export async function isLikelyGlb(file) {
  try {
    const head = await file.slice(0, 4).arrayBuffer();
    const magic = new Uint8Array(head);
    // 'glTF' in ASCII
    return magic[0] === 0x67 && magic[1] === 0x6c && magic[2] === 0x54 && magic[3] === 0x46;
  } catch {
    return false;
  }
}

/** Extracts a de-duplicated list of Files from a drop event (files + directory-free). */
export function extractFilesFromDataTransfer(dataTransfer) {
  return Array.from(dataTransfer.files || []);
}

export function outputFilenameFor(originalName) {
  const dot = originalName.lastIndexOf('.');
  if (dot === -1) return `${originalName}_optimised.glb`;
  return `${originalName.slice(0, dot)}_optimised.glb`;
}
