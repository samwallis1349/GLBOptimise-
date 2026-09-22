/**
 * The Reduce Polys tool mark.
 *
 * A wireframe sphere whose left half is dense and whose right half is sparse
 * — the same silhouette at two polygon densities, which is exactly what the
 * tool does. The vertical seam between them reads as the moment of
 * reduction. Same construction language as the Optimise GLB cube: charcoal
 * fill, amber edges, a broken outer frame, drawn flat from theme tokens.
 */
export const polyMeshIcon = `
<svg class="tool-mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="Polygon reduction">
  <g class="tool-mark-frame" stroke-width="1.6" stroke-linecap="round">
    <path d="M36 3.8 45.2 9.1M54.8 14.6 64 19.9" />
    <path d="M64 19.9V30.5M64 41.5V52.1" />
    <path d="M64 52.1 54.8 57.4" />
    <path d="M36 68.2 26.8 62.9M17.2 57.4 8 52.1" />
    <path d="M8 52.1V41.5M8 30.5V19.9" />
    <path d="M26.8 9.1 36 3.8" />
  </g>

  <!-- Body -->
  <circle class="poly-body" cx="36" cy="36" r="22" />

  <!-- Dense half: many small facets -->
  <g class="poly-dense" stroke-width="0.9" stroke-linejoin="round">
    <path d="M36 14v44M36 14 20.5 21M20.5 21 14.6 36M14.6 36 20.5 51M20.5 51 36 58" />
    <path d="M20.5 21 36 25M14.6 36 36 33M14.6 36 36 40M20.5 51 36 47" />
    <path d="M36 25 20.5 31M20.5 31 36 33M36 40 20.5 44M20.5 44 36 47" />
    <path d="M20.5 21 20.5 31M20.5 31 14.6 36M14.6 36 20.5 44M20.5 44 20.5 51" />
    <path d="M36 14 27 18M27 18 20.5 21M36 58 27 54M27 54 20.5 51" />
  </g>

  <!-- Sparse half: a handful of large facets -->
  <g class="poly-sparse" stroke-width="1.5" stroke-linejoin="round">
    <path d="M36 14 57.4 25M57.4 25 57.4 47M57.4 47 36 58" />
    <path d="M36 14 44 36M44 36 36 58M57.4 25 44 36M44 36 57.4 47" />
  </g>

  <!-- Reduction seam -->
  <path class="poly-seam" d="M36 10v52" stroke-width="1.8" stroke-linecap="round" />
</svg>`;
