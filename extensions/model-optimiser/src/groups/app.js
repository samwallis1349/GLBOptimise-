/** The app group's tools (see src/runners.js). */
import * as app from '../tools/app.js';

const files = (list) => (list || []).map((o) => ({ name: o.name, bytes: new Uint8Array(o.bytes) }));

export default {
  'icon-check': (bytes) => app.iconCheck(bytes),
  icons: (bytes, params, name) => app.icons(bytes, params, name),
  xcassets: (bytes, params, name) => app.xcassets(bytes, { ...params, others: files(params.others) }, name),
  screenshots: (bytes, params, name) => app.screenshots(bytes, { ...params, others: files(params.others) }, name),
};
