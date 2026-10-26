/** The animation group's tools (see src/runners.js). */
import * as animation from '../tools/animation.js';

export default {
  clips: (bytes) => animation.clips(bytes),
  strip: (bytes, params, name) => animation.strip(bytes, params, name),
  'anim-optimise': (bytes, params, name) => animation.animOptimise(bytes, params, name),
};
