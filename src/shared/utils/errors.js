/** Base class for expected, user-facing Asset Bench errors (as opposed to
 * unexpected bugs). Tools should throw this so UI layers can distinguish
 * "explain this to the user" from "log this and show a generic message". */
export class AssetBenchError extends Error {
  constructor(message, { code = 'UNKNOWN', cause } = {}) {
    super(message, { cause });
    this.name = 'AssetBenchError';
    this.code = code;
  }
}

export class ValidationError extends AssetBenchError {
  constructor(message, options) {
    super(message, { code: 'VALIDATION', ...options });
    this.name = 'ValidationError';
  }
}

export class UnsupportedFormatError extends AssetBenchError {
  constructor(message, options) {
    super(message, { code: 'UNSUPPORTED_FORMAT', ...options });
    this.name = 'UnsupportedFormatError';
  }
}
