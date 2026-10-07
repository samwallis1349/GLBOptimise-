import './ktx2-texture-encoder.css';

/**
 * KTX2 Texture Encoder is a self-contained page (public/tools/ktx2-texture-encoder/),
 * framed like Mobile Ready Checker. The frame grows to fit the page, which posts its
 * height. It needs allow-same-origin so it can fetch the Basis .wasm files
 * published next to it.
 */
export function mount(container) {
  const page = document.createElement('section');
  page.className = 'ktx2-encoder-page';
  page.innerHTML = '<iframe class="ktx2-encoder-frame" src="/tools/ktx2-texture-encoder/index.html" title="KTX2 Texture Encoder" sandbox="allow-scripts allow-same-origin allow-downloads allow-top-navigation-by-user-activation" allow="clipboard-write" loading="eager"></iframe>';
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
