/**
 * A subtle amber light that follows the pointer — not a glowing cursor, a
 * soft illumination the UI catches. One fixed overlay element whose
 * position is driven by two CSS custom properties, updated at most once
 * per animation frame; nothing here touches layout.
 *
 * Disabled entirely on touch/coarse-pointer devices (there is no hover to
 * track), and card tilt is skipped under prefers-reduced-motion, though the
 * glow itself (a static-feeling light, not motion) stays.
 *
 * @param {HTMLElement} root only elements inside `root` get card-proximity
 *   lighting; the ambient glow still tracks the whole viewport.
 * @returns {() => void} cleanup
 */
export function initCursorSpotlight(root) {
  const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  if (!canHover) return () => {};

  const layer = document.createElement('div');
  layer.className = 'cursor-spotlight';
  document.body.appendChild(layer);

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let raf = null;
  let pendingX = 0;
  let pendingY = 0;
  let cards = [];

  function refreshCards() {
    cards = Array.from(root.querySelectorAll('.tool-card'));
  }

  function onPointerMove(e) {
    pendingX = e.clientX;
    pendingY = e.clientY;
    if (raf !== null) return;
    raf = requestAnimationFrame(apply);
  }

  function apply() {
    raf = null;
    layer.style.setProperty('--mouse-x', `${pendingX}px`);
    layer.style.setProperty('--mouse-y', `${pendingY}px`);
    layer.classList.add('is-active');

    const tilt = !reducedMotion();
    const proximity = 260; // px — how close the pointer needs to be to light a card

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = pendingX - cx;
      const dy = pendingY - cy;
      const dist = Math.hypot(dx, dy);

      if (dist > proximity + Math.max(rect.width, rect.height)) {
        if (card.classList.contains('is-lit')) card.classList.remove('is-lit');
        continue;
      }

      const localX = ((pendingX - rect.left) / rect.width) * 100;
      const localY = ((pendingY - rect.top) / rect.height) * 100;
      const inside = pendingX >= rect.left && pendingX <= rect.right && pendingY >= rect.top && pendingY <= rect.bottom;

      card.classList.toggle('is-lit', inside);
      if (inside) {
        card.style.setProperty('--card-mx', `${localX}%`);
        card.style.setProperty('--card-my', `${localY}%`);
        if (tilt) {
          const rx = ((localY - 50) / 50) * -1.8; // degrees, deliberately tiny
          const ry = ((localX - 50) / 50) * 1.8;
          card.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        }
      } else if (card.style.transform) {
        card.style.transform = '';
      }
    }
  }

  function onLeave() {
    layer.classList.remove('is-active');
    for (const card of cards) {
      card.classList.remove('is-lit');
      card.style.transform = '';
    }
  }

  refreshCards();
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('mouseleave', onLeave);
  const resizeObserver = new ResizeObserver(refreshCards);
  resizeObserver.observe(root);

  return () => {
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('mouseleave', onLeave);
    resizeObserver.disconnect();
    if (raf !== null) cancelAnimationFrame(raf);
    layer.remove();
    for (const card of cards) {
      card.classList.remove('is-lit');
      card.style.transform = '';
    }
  };
}
