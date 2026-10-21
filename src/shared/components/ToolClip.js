import { toolClip } from '../config/toolClips.js';

/**
 * "See it in 5 seconds" under a tool: its promo clip, muted and looping.
 * Nothing downloads until the section scrolls into view, and it pauses
 * again when scrolled away.
 *
 * @param {import('../config/tools.js').TOOLS[number]} tool
 * @returns {HTMLElement|null}
 */
export function ToolClip(tool) {
  const clip = toolClip(tool.id);
  if (!clip) return null;

  const section = document.createElement('section');
  section.className = 'tool-clip container';
  section.innerHTML = `
    <h2 class="tool-clip__title">See ${tool.name} in 5 seconds</h2>
    <video class="tool-clip__video" poster="${clip.poster}" muted loop playsinline preload="none" aria-label="${tool.name} clip"></video>
  `;

  const video = section.querySelector('video');
  const observer = new IntersectionObserver(([entry]) => {
    if (!section.isConnected) return observer.disconnect();
    if (entry.isIntersecting) {
      if (!video.src) video.src = clip.src;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, { threshold: 0.4 });
  observer.observe(section);

  return section;
}
