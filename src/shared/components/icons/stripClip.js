/**
 * The Strip Animations tool mark.
 *
 * A filmstrip of animation clips: three solid frames stay intact, one frame
 * is drawn dashed with an X through it — the clip being marked for removal.
 * Same construction language as the other tool marks: charcoal fill, amber
 * edges, a broken outer hex frame, drawn flat from theme tokens.
 */
export const stripClipIcon = `
<svg class="tool-mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="Strip animation clips">
  <g class="tool-mark-frame" stroke-width="1.6" stroke-linecap="round">
    <path d="M36 3.8 45.2 9.1M54.8 14.6 64 19.9" />
    <path d="M64 19.9V30.5M64 41.5V52.1" />
    <path d="M64 52.1 54.8 57.4" />
    <path d="M36 68.2 26.8 62.9M17.2 57.4 8 52.1" />
    <path d="M8 52.1V41.5M8 30.5V19.9" />
    <path d="M26.8 9.1 36 3.8" />
  </g>

  <!-- Filmstrip body -->
  <rect class="strip-body" x="12" y="24" width="48" height="24" rx="2" />

  <!-- Sprocket holes, top and bottom -->
  <g class="strip-sprockets">
    <rect x="16" y="20" width="4" height="4" rx="0.8" />
    <rect x="25" y="20" width="4" height="4" rx="0.8" />
    <rect x="34" y="20" width="4" height="4" rx="0.8" />
    <rect x="43" y="20" width="4" height="4" rx="0.8" />
    <rect x="52" y="20" width="4" height="4" rx="0.8" />
    <rect x="16" y="48" width="4" height="4" rx="0.8" />
    <rect x="25" y="48" width="4" height="4" rx="0.8" />
    <rect x="34" y="48" width="4" height="4" rx="0.8" />
    <rect x="43" y="48" width="4" height="4" rx="0.8" />
    <rect x="52" y="48" width="4" height="4" rx="0.8" />
  </g>

  <!-- Frame dividers -->
  <g class="strip-dividers" stroke-width="1">
    <path d="M24 24v24M36 24v24M48 24v24" />
  </g>

  <!-- Kept frames: small play glyphs -->
  <g class="strip-kept">
    <path d="M16.5 33.5 21.5 36 16.5 38.5Z" />
    <path d="M40.5 33.5 45.5 36 40.5 38.5Z" />
    <path d="M52.5 33.5 57.5 36 52.5 38.5Z" />
  </g>

  <!-- Removed frame: dashed outline + X -->
  <g class="strip-removed">
    <rect x="25" y="25.5" width="10" height="21" rx="1" stroke-dasharray="2.4 2.2" />
    <path d="M27 29.5 33 42.5M33 29.5 27 42.5" stroke-linecap="round" />
  </g>
</svg>`;
