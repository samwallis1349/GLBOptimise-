/** The image group's tools (see src/runners.js). */
import * as image from '../tools/image.js';
import { clips } from '../tools/animation.js';

export default {
  'sheet-check': (bytes) => image.sheetCheck(bytes),
  cutout: (bytes, params, name) => image.cutout(bytes, params, name),
  lines: (bytes, params, name) => image.lines(bytes, params, name),
  // iso draws in the panel; its clip menu is filled from this.
  clips: (bytes) => clips(bytes),
};
