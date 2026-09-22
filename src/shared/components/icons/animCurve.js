/**
 * The Animation Inspector tool mark.
 *
 * An animation curve crossing a timeline, with keyframe diamonds sitting on
 * it and a playhead cutting down through the frame. It reuses the same
 * construction language as the other marks — amber accent, the shared broken
 * outer frame, flat shapes drawn from theme tokens — and borrows opacity as
 * meaning the way poly-mesh does for dense/sparse: the foreground curve is
 * the channel you're reading, the fainter one behind it is a second channel
 * on the same clip, which is exactly what the tool puts on screen.
 */
export const animCurveIcon = `
<svg class="tool-mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="Animation curve">
  <g class="tool-mark-frame" stroke-width="1.6" stroke-linecap="round">
    <path d="M36 3.8 45.2 9.1M54.8 14.6 64 19.9" />
    <path d="M64 19.9V30.5M64 41.5V52.1" />
    <path d="M64 52.1 54.8 57.4" />
    <path d="M36 68.2 26.8 62.9M17.2 57.4 8 52.1" />
    <path d="M8 52.1V41.5M8 30.5V19.9" />
    <path d="M26.8 9.1 36 3.8" />
  </g>

  <!-- Baseline the curves are measured against. -->
  <g class="anim-axis" stroke-width="1.3" stroke-linecap="round">
    <path d="M17 36h38" />
  </g>

  <!-- Secondary channel, sitting behind. -->
  <path class="anim-curve anim-curve-back" stroke-width="1.7" stroke-linecap="round"
        d="M17 42c5 0 6-9 11-9s7 13 12 13 5-12 10-12" />

  <!-- Primary channel. -->
  <path class="anim-curve anim-curve-front" stroke-width="2.1" stroke-linecap="round"
        d="M17 47c6 0 5-22 11-22s7 27 13 27 5-17 9-17" />

  <!-- Keyframes on the primary curve. -->
  <g class="anim-key">
    <rect x="14.6" y="44.6" width="4.8" height="4.8" rx="0.8" transform="rotate(45 17 47)" />
    <rect x="25.6" y="22.6" width="4.8" height="4.8" rx="0.8" transform="rotate(45 28 25)" />
    <rect x="38.6" y="49.6" width="4.8" height="4.8" rx="0.8" transform="rotate(45 41 52)" />
    <rect x="47.6" y="32.6" width="4.8" height="4.8" rx="0.8" transform="rotate(45 50 35)" />
  </g>

  <!-- Playhead. -->
  <g class="anim-playhead" stroke-width="1.5" stroke-linecap="round">
    <path d="M41 17v38" />
  </g>
  <path class="anim-playhead-cap" d="M37.4 16.4h7.2L41 21.4Z" />
</svg>
`;
