import './character-workshop.css';

/**
 * Character Workshop is a self-contained page (public/tools/character-workshop/),
 * framed like Mobile Ready Checker. Its modules live next to it in js/ and use
 * the same pinned three.js 0.170 import map as the other public tools. The frame
 * grows to fit the page, which posts its height. allow-same-origin lets the page
 * load its own ES modules; allow-downloads is needed to save the exported GLB.
 */
export function mount(container) {
  const page = document.createElement('section');
  page.className = 'character-workshop-page';
  page.innerHTML = '<iframe class="character-workshop-frame" src="/tools/character-workshop/index.html" title="Character Workshop" sandbox="allow-scripts allow-same-origin allow-downloads" loading="eager"></iframe>';
  const frame = page.querySelector('iframe');

  const onMessage = (event) => {
    if (event.source !== frame.contentWindow || event.data?.type !== 'assetbench:height') return;
    const height = Number(event.data.height);
    if (height > 0) frame.style.height = `${Math.ceil(height)}px`;
  };
  window.addEventListener('message', onMessage);

  container.replaceChildren(page);
  return () => {
    window.removeEventListener('message', onMessage);
    page.remove();
  };
}
