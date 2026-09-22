/**
 * The Animation Optimiser tool mark.
 *
 * The same curve the Animation Inspector mark draws, but with most of its
 * keyframes gone — four survivors carrying the shape, and the keys that were
 * removed left as faint hollow outlines on the path they used to sit on. It
 * reads as the operation itself rather than as a generic "optimise" symbol,
 * and it uses the pair's shared language: amber accent, the broken outer
 * frame, opacity carrying meaning (solid = kept, ghosted = dropped).
 */
export const animTrimIcon = `
<svg class="tool-mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="Reduced animation curve">
  <g class="tool-mark-frame" stroke-width="1.6" stroke-linecap="round">
    <path d="M36 3.8 45.2 9.1M54.8 14.6 64 19.9" />
    <path d="M64 19.9V30.5M64 41.5V52.1" />
    <path d="M64 52.1 54.8 57.4" />
    <path d="M36 68.2 26.8 62.9M17.2 57.4 8 52.1" />
    <path d="M8 52.1V41.5M8 30.5V19.9" />
    <path d="M26.8 9.1 36 3.8" />
  </g>

  <g class="anim-axis" stroke-width="1.3" stroke-linecap="round">
    <path d="M17 36h38" />
  </g>

  <!-- The curve, now described by four keys instead of a dozen. -->
  <path class="anim-curve anim-curve-front" stroke-width="2.1" stroke-linecap="round"
        d="M17 47 28 25l13 27 14-17" />

  <!-- Keys that were dropped: still on the curve, no longer stored. -->
  <g class="anim-key-dropped" stroke-width="1.2">
    <rect x="20.4" y="38.6" width="4" height="4" rx="0.6" transform="rotate(45 22.4 40.6)" />
    <rect x="32.4" y="33.6" width="4" height="4" rx="0.6" transform="rotate(45 34.4 35.6)" />
    <rect x="45.4" y="42.6" width="4" height="4" rx="0.6" transform="rotate(45 47.4 44.6)" />
  </g>

  <!-- Keys that survived. -->
  <g class="anim-key">
    <rect x="14.6" y="44.6" width="4.8" height="4.8" rx="0.8" transform="rotate(45 17 47)" />
    <rect x="25.6" y="22.6" width="4.8" height="4.8" rx="0.8" transform="rotate(45 28 25)" />
    <rect x="38.6" y="49.6" width="4.8" height="4.8" rx="0.8" transform="rotate(45 41 52)" />
    <rect x="52.6" y="32.6" width="4.8" height="4.8" rx="0.8" transform="rotate(45 55 35)" />
  </g>
</svg>
`;
