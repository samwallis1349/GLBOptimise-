/**
 * Small hand-authored icon set, in the same inline-SVG style already used
 * throughout the app (see e.g. OptimiseGLBPage's benefit icons). Keyed by
 * the same names used in config/tools.js `icon` fields, so a tool card,
 * category header, or hero benefit can all resolve their icon from here.
 *
 * Deliberately not an icon library dependency — the set is small enough
 * that hand-rolled paths keep the bundle lightweight, per this project's
 * "add a dependency only once something genuinely needs it" rule.
 */
const ICONS = {
  'package-open': '<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 7v10l9 5 9-5V7"/><path d="M12 12v10"/>',
  shrink: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  'image-down': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  'layers-3': '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  'film-off': '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/><line x1="2" y1="2" x2="22" y2="22"/>',
  bone: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.5 17.5 17.5 6.5"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="7.5" r="1.5"/>',
  'play-circle': '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',
  activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  'maximize-2': '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
  'wand-2': '<line x1="4" y1="20" x2="18" y2="6"/><path d="M17 3v3M15.5 4.5h3"/><path d="M4 9v2M3 10h2"/>',
  'refresh-cw': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M21 3v6h-6"/>',
  'package-plus': '<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 7v10l9 5 9-5V7"/><path d="M12 12v10"/><path d="M17 15h4M19 13v4"/>',
  'git-merge': '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 9v6a6 6 0 0 0 6 6h3"/><path d="M18 9V6"/>',
  'git-branch': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M6 9v6"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  'columns-2': '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6M9 9h1"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/>',

  // Category headers, hero benefits, header controls.
  gauge: '<path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 12 16 8"/>',
  tools: '<circle cx="9" cy="9" r="5"/><circle cx="17" cy="17" r="3"/><path d="m13 13 2 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  zap: '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.5 8.7 8 11 4.5-2.3 8-6 8-11V5l-8-3Z"/>',
  gamepad: '<rect x="2" y="7" width="20" height="10" rx="3"/><path d="M7 12h.01M17 12h.01M10 10v4M14 10v4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
};

const DEFAULT_ICON = ICONS.grid;

/** Inner `<path>`/`<rect>`/etc. markup for an icon key, ready to drop inside an `<svg>`. */
export function iconInner(key) {
  return ICONS[key] || DEFAULT_ICON;
}

/** A complete `<svg>` element (as a markup string) for an icon key. */
export function iconSvg(key, { class: className = '' } = {}) {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconInner(key)}</svg>`;
}
