import './model-to-iso-sprites.css';

/**
 * Model to Iso Sprites is a self-contained page (public/tools/model-to-iso-sprites/),
 * framed like Character Workshop, whose loaders and sample it reuses from
 * public/tools/character-workshop/js, with the same pinned three.js 0.170
 * import map as the other public tools. The frame grows to fit the page, which posts its height. allow-same-origin lets the page
 * load its own ES modules; allow-downloads is needed to save the sprite sheet, JSON and ZIP.
 */
export function mount(container) {
  const page = document.createElement('section');
  page.className = 'model-to-iso-sprites-page';
  page.innerHTML = '<iframe class="model-to-iso-sprites-frame" src="/tools/model-to-iso-sprites/index.html" title="Model to Iso Sprites" sandbox="allow-scripts allow-same-origin allow-downloads" loading="eager"></iframe>';
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
