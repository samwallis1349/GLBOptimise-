/**
 * The Rig Inspector tool mark.
 *
 * A reduced stick-figure skeleton: one spine, two shoulder/hip joints and
 * four limbs tapering to end joints. Opacity carries the same "core vs
 * extremity" language the other marks use for dense/sparse (poly-mesh) or
 * near/far (lod-stack) — here it reads as "root of the rig" fading out
 * toward the hands and feet. Same construction language throughout: amber
 * accent, a broken outer frame, drawn flat from theme tokens.
 */
export const rigSkeletonIcon = `
<svg class="tool-mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="Rig skeleton">
  <g class="tool-mark-frame" stroke-width="1.6" stroke-linecap="round">
    <path d="M36 3.8 45.2 9.1M54.8 14.6 64 19.9" />
    <path d="M64 19.9V30.5M64 41.5V52.1" />
    <path d="M64 52.1 54.8 57.4" />
    <path d="M36 68.2 26.8 62.9M17.2 57.4 8 52.1" />
    <path d="M8 52.1V41.5M8 30.5V19.9" />
    <path d="M26.8 9.1 36 3.8" />
  </g>

  <!-- Torso first, then limbs branching off it. -->
  <g class="rig-bone rig-bone-torso" stroke-width="1.8" stroke-linecap="round">
    <path d="M36 20v24" />
    <path d="M36 24 24 28M36 24 48 28" />
    <path d="M36 44 27 46M36 44 45 46" />
  </g>

  <g class="rig-bone rig-bone-limb" stroke-width="1.6" stroke-linecap="round">
    <path d="M24 28 19 40 17 52" />
    <path d="M48 28 53 40 55 52" />
    <path d="M27 46 25 56 23 64" />
    <path d="M45 46 47 56 49 64" />
  </g>

  <circle class="rig-joint rig-joint-major" cx="36" cy="16" r="4.4" />
  <circle class="rig-joint rig-joint-major" cx="36" cy="24" r="2.3" />
  <circle class="rig-joint rig-joint-major" cx="36" cy="44" r="2.3" />
  <circle class="rig-joint rig-joint-mid" cx="24" cy="28" r="2" />
  <circle class="rig-joint rig-joint-mid" cx="48" cy="28" r="2" />
  <circle class="rig-joint rig-joint-mid" cx="27" cy="46" r="2" />
  <circle class="rig-joint rig-joint-mid" cx="45" cy="46" r="2" />
  <circle class="rig-joint rig-joint-minor" cx="19" cy="40" r="1.6" />
  <circle class="rig-joint rig-joint-minor" cx="53" cy="40" r="1.6" />
  <circle class="rig-joint rig-joint-minor" cx="25" cy="56" r="1.6" />
  <circle class="rig-joint rig-joint-minor" cx="47" cy="56" r="1.6" />
  <circle class="rig-joint rig-joint-end" cx="17" cy="52" r="1.3" />
  <circle class="rig-joint rig-joint-end" cx="55" cy="52" r="1.3" />
  <circle class="rig-joint rig-joint-end" cx="23" cy="64" r="1.3" />
  <circle class="rig-joint rig-joint-end" cx="49" cy="64" r="1.3" />
</svg>`;
