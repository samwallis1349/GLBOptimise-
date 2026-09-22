import { prefersReducedMotion } from './CountUp.js';

/**
 * A brief amber ring pulse — one primary ring, one faint secondary ring, a
 * short glow beneath the origin. Meant to communicate "a real operation just
 * completed successfully": wire it to genuine completions (a validated
 * export, a finished build), never to ordinary navigation.
 *
 * Total runtime ~700ms. Skipped (origin still gets a quiet fade, no
 * expansion) under prefers-reduced-motion.
 *
 * @param {{ origin: HTMLElement | { x: number, y: number }, stats?: Record<string, string> }} params
 *   `origin` is either an element (the burst centers on its middle) or an
 *   already-resolved viewport point.
 */
export function triggerSuccessBurst({ origin }) {
  if (!origin) return;

  let x, y;
  if (origin instanceof Element) {
    const rect = origin.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height * 0.82; // low in the element — reads as "beneath the model"
  } else {
    ({ x, y } = origin);
  }

  const layer = document.createElement('div');
  layer.className = 'success-burst';
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;

  const glow = document.createElement('div');
  glow.className = 'success-burst__glow';
  const ringPrimary = document.createElement('div');
  ringPrimary.className = 'success-burst__ring success-burst__ring--primary';
  const ringSecondary = document.createElement('div');
  ringSecondary.className = 'success-burst__ring success-burst__ring--secondary';

  layer.append(glow, ringPrimary, ringSecondary);
  document.body.appendChild(layer);

  const reduced = prefersReducedMotion();
  layer.classList.add(reduced ? 'is-reduced' : 'is-active');

  const total = reduced ? 260 : 800;
  setTimeout(() => layer.remove(), total);
}
