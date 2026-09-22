/**
 * The Compress Textures tool mark.
 *
 * A texture sheet seen at two resolutions: the left half is a fine checker,
 * the right half the same pattern at a quarter of the density, with a stepped
 * seam where one becomes the other. It reads as a mip chain — which is what
 * the tool produces — and shares the construction language of the other two
 * marks: charcoal fill, amber edges, a broken outer frame, drawn flat from
 * theme tokens.
 */
export const textureGridIcon = `
<svg class="tool-mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="Texture compression">
  <g class="tool-mark-frame" stroke-width="1.6" stroke-linecap="round">
    <path d="M36 3.8 45.2 9.1M54.8 14.6 64 19.9" />
    <path d="M64 19.9V30.5M64 41.5V52.1" />
    <path d="M64 52.1 54.8 57.4" />
    <path d="M36 68.2 26.8 62.9M17.2 57.4 8 52.1" />
    <path d="M8 52.1V41.5M8 30.5V19.9" />
    <path d="M26.8 9.1 36 3.8" />
  </g>

  <!-- Sheet -->
  <rect class="tex-body" x="15" y="15" width="42" height="42" rx="3" />

  <!-- Fine half: 8px cells -->
  <g class="tex-fine" stroke-width="0.8">
    <path d="M21 15v42M27 15v42M33 15v42" />
    <path d="M15 21h21M15 27h21M15 33h21M15 39h21M15 45h21M15 51h21" />
  </g>
  <g class="tex-fill-fine">
    <rect x="15" y="15" width="6" height="6" /><rect x="27" y="15" width="6" height="6" />
    <rect x="21" y="21" width="6" height="6" /><rect x="33" y="21" width="6" height="6" />
    <rect x="15" y="27" width="6" height="6" /><rect x="27" y="27" width="6" height="6" />
    <rect x="21" y="33" width="6" height="6" /><rect x="33" y="33" width="6" height="6" />
    <rect x="15" y="39" width="6" height="6" /><rect x="27" y="39" width="6" height="6" />
    <rect x="21" y="45" width="6" height="6" /><rect x="33" y="45" width="6" height="6" />
    <rect x="15" y="51" width="6" height="6" /><rect x="27" y="51" width="6" height="6" />
  </g>

  <!-- Coarse half: 12px cells, same pattern, quarter the density -->
  <g class="tex-coarse" stroke-width="1.3">
    <path d="M45 15v42" />
    <path d="M39 27h18M39 39h18M39 51h18" />
  </g>
  <g class="tex-fill-coarse">
    <rect x="39" y="15" width="6" height="12" />
    <rect x="45" y="27" width="12" height="12" />
    <rect x="39" y="39" width="6" height="12" />
    <rect x="45" y="51" width="12" height="6" />
  </g>

  <!-- Stepped reduction seam -->
  <path class="tex-seam" d="M36 15v10h3v12h-3v12h3v8h-3v-42" stroke-width="1.8" stroke-linejoin="round" />
</svg>`;
