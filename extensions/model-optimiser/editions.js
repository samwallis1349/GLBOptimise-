/**
 * One codebase, two store products. Only one may be listed at a time: the
 * Chrome Web Store refuses several extensions with duplicate functionality
 * from the same developer.
 *
 *   reduce-polys     — what we sell now: free Check + Reduce (£5 unlock).
 *   model-optimiser  — all four tools (£5 each), for later.
 */
export const EDITIONS = {
  'reduce-polys': {
    name: 'Reduce Polys – GLB Polygon Reducer by AssetBench',
    shortName: 'Reduce Polys',
    description: 'Cut the triangle count of GLB models in your browser. Free model check, £5 one-off unlock. Files never leave your computer.',
    heading: ['Reduce', 'Polys'],
    tools: ['check', 'reduce'],
    firstTool: 'reduce',
  },
  'model-optimiser': {
    name: 'AssetBench Model Optimiser',
    shortName: 'Model Optimiser',
    description: 'Check, reduce, optimise and compress GLB models for games and the web, right in your browser. Files never leave your computer.',
    heading: ['Model', 'Optimiser'],
    tools: ['check', 'reduce', 'optimise', 'compress'],
    firstTool: 'check',
  },
};

export const DEFAULT_EDITION = 'reduce-polys';
