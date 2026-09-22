/**
 * Barrel re-export so this tool still has a top-level config.js matching
 * the standard per-tool folder shape used across src/tools/*. The actual
 * config is split into config/limits.js, config/presets.js, and
 * config/recommendations.js since it's substantial enough to warrant it.
 */
export * from './config/limits.js';
export * from './config/presets.js';
export * from './config/recommendations.js';
