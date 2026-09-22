/**
 * The Optimise GLB tool mark.
 *
 * An isometric cube — the GLB file itself — in charcoal with illuminated
 * amber edges, labelled on its front-right face. Around it, a second, larger
 * cube silhouette is drawn as broken segments: it almost closes but never
 * does. Those gaps are what make the mark read as something mid-transform
 * rather than a static file-format badge.
 *
 * Drawn flat and sharp rather than glowing. Every colour comes from a theme
 * token, so the mark follows the app's palette — including anything changed
 * from the F8 editor's colour picker.
 *
 * Geometry: inner cube is a hexagon about centre (36,36); the outer frame is
 * the same hexagon scaled ~1.4, with each edge drawn only at its two ends.
 */
export const glbCubeIcon = `
<svg class="tool-mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="GLB file">
  <!-- Outer cube silhouette, broken: each edge drawn only at its ends, and
       two segments omitted entirely so the frame stays deliberately open. -->
  <g class="tool-mark-frame" stroke-width="1.6" stroke-linecap="round">
    <path d="M36 3.8 45.2 9.1M54.8 14.6 64 19.9" />
    <path d="M64 19.9V30.5M64 41.5V52.1" />
    <path d="M64 52.1 54.8 57.4" />
    <path d="M36 68.2 26.8 62.9M17.2 57.4 8 52.1" />
    <path d="M8 52.1V41.5M8 30.5V19.9" />
    <path d="M26.8 9.1 36 3.8" />
  </g>

  <!-- Cube faces -->
  <g class="tool-mark-cube">
    <path class="face-top" d="M36 13 56 24.5 36 36 16 24.5Z" />
    <path class="face-left" d="M16 24.5 36 36v23L16 47.5Z" />
    <path class="face-right" d="M56 24.5 36 36v23l20-11.5Z" />
  </g>

  <!-- Illuminated edges -->
  <g class="tool-mark-edges" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
    <path d="M36 13 56 24.5v23L36 59 16 47.5v-23Z" />
    <path d="M36 36 56 24.5M36 36 16 24.5M36 36v23" />
  </g>

  <!-- Label, skewed into the plane of the front-right face. That face rises
       to the right, so the text is sheared by -30deg to sit flat on it. -->
  <text class="tool-mark-label" transform="translate(46 42) skewY(-30)">GLB</text>
</svg>`;
