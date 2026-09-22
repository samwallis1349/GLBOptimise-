/**
 * The Generate LODs tool mark.
 *
 * Three stacked, offset planes — the same object at three levels of detail,
 * drawn as a physical stack rather than a single mesh. The top plane is
 * densely faceted (closest, most detail); each plane below is sparser and
 * sits further back, reading directly as "further away needs less detail".
 * Same construction language as the Optimise GLB cube and Reduce Polys
 * sphere: charcoal fill, amber edges, a broken outer frame, drawn flat from
 * theme tokens.
 */
export const lodStackIcon = `
<svg class="tool-mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="Level of detail stack">
  <g class="tool-mark-frame" stroke-width="1.6" stroke-linecap="round">
    <path d="M36 3.8 45.2 9.1M54.8 14.6 64 19.9" />
    <path d="M64 19.9V30.5M64 41.5V52.1" />
    <path d="M64 52.1 54.8 57.4" />
    <path d="M36 68.2 26.8 62.9M17.2 57.4 8 52.1" />
    <path d="M8 52.1V41.5M8 30.5V19.9" />
    <path d="M26.8 9.1 36 3.8" />
  </g>

  <!-- LOD2: furthest back, sparsest -->
  <path class="lod-plane lod-plane-3" d="M36 46 54 36.5v9L36 55 18 45.5v-9Z" />
  <g class="lod-lines lod-lines-3" stroke-width="1.1" stroke-linejoin="round">
    <path d="M36 46 36 55M18 45.5 36 50.7 54 45.5" />
  </g>

  <!-- LOD1: middle -->
  <path class="lod-plane lod-plane-2" d="M36 34 56 24.5v10L36 45 16 34.5v-10Z" />
  <g class="lod-lines lod-lines-2" stroke-width="1.1" stroke-linejoin="round">
    <path d="M36 34v11M16 34.5 36 39.6 56 34.5M26 29.3 36 39.6M46 29.3 36 39.6" />
  </g>

  <!-- LOD0: closest, densest -->
  <path class="lod-plane lod-plane-1" d="M36 20 58 9.5v12L36 33 14 21.5v-12Z" />
  <g class="lod-lines lod-lines-1" stroke-width="0.85" stroke-linejoin="round">
    <path d="M36 20v13M14 21.5 36 27 58 21.5M20 16.6 36 27M52 16.6 36 27M25 13.9 36 27M47 13.9 36 27" />
    <path d="M14 21.5 25 13.9M58 21.5 47 13.9" />
  </g>

  <!-- Edges, brightest on the nearest plane -->
  <g class="lod-edges lod-edges-1" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M36 20 58 9.5v12L36 33 14 21.5v-12Z" />
  </g>
</svg>`;
