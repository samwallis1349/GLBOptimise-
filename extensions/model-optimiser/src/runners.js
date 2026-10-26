/**
 * The newer editions' tools, one module per group (src/groups). build.mjs
 * swaps this module for one importing only the groups an edition uses, so
 * each listing ships only its own code; the tests import this, with all.
 */
import animation from './groups/animation.js';
import converter from './groups/converter.js';
import app from './groups/app.js';
import image from './groups/image.js';

export const EXTRA_RUNNERS = { ...animation, ...converter, ...app, ...image };
