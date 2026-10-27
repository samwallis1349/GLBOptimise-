/**
 * Our own affiliate programme (27 Oct, user: recruit affiliates; 26% on the tool unlocks): people sign up through Lemon Squeezy, get
 * their own link to the store, and earn commission on the sales it brings in. Its card (components/PartnerCard.js)
 * sits under the tools below, which show it instead of the Tripo card; the other 3D tools keep Tripo
 * (config/tripo.js TRIPO_TOOLS). A tool is in one set or the other, never both.
 */
export const PARTNER_SIGNUP_URL = 'https://workbenchlabs.lemonsqueezy.com/affiliates';
// 26% on the three products that unlock tools (set in Lemon Squeezy, 27 Oct)
export const PARTNER_COMMISSION = '26%';

/** The 10 tool pages that show the affiliate card. */
export const PARTNER_TOOLS = new Set([
  'inspect-glb', 'asset-report', 'asset-compare', 'rig-inspector', 'animation-inspector',
  'animation-optimiser', 'ktx2-texture-encoder', 'model-splitter', 'glb-builder', 'convert-files',
]);
