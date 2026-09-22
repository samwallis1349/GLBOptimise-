/**
 * Animates a number from its current displayed value to a real target
 * value. Presentation only — the caller always supplies the genuine final
 * result; this never interpolates toward a guessed or invented number.
 *
 * Respects prefers-reduced-motion: jumps straight to the target instead of
 * animating.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Cubic ease-out — fast start, gentle settle. */
function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * @param {HTMLElement} el text content is replaced with the formatted value
 * @param {number} from
 * @param {number} to
 * @param {{ duration?: number, format?: (n: number) => string }} [opts]
 * @returns {() => void} cancel function
 */
export function countUp(el, from, to, opts = {}) {
  if (!el) return () => {};
  const duration = opts.duration ?? 750;
  const format = opts.format ?? ((n) => Math.round(n).toLocaleString('en-US'));

  if (prefersReducedMotion() || from === to || duration <= 0) {
    el.textContent = format(to);
    return () => {};
  }

  let raf = null;
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const t = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(t);
    el.textContent = format(from + (to - from) * eased);
    if (t < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      el.textContent = format(to);
      raf = null;
    }
  }

  raf = requestAnimationFrame(tick);
  return () => {
    if (raf !== null) cancelAnimationFrame(raf);
  };
}

export { prefersReducedMotion };
