import converterHtml from './model-convertor.html?raw';

/**
 * Convert Files — the Model Convertor (24 formats in, 14 out).
 *
 * The convertor is a self-contained page pinned to three.js 0.170 from the
 * jsDelivr CDN (its PMX/PMD support uses MMDLoader, which later three.js
 * releases removed), so it runs in its own document rather than on the
 * app's bundled three.js. It is loaded via srcdoc: same-origin, so the frame
 * can be sized to its content and the page scrolls as one, with no public
 * URL that would bypass the tool route.
 */
export function mount(container) {
  container.innerHTML = '';
  const frame = document.createElement('iframe');
  frame.className = 'model-convertor-frame';
  frame.title = 'Model Convertor';
  frame.setAttribute('allow', 'fullscreen');
  frame.style.cssText = 'display:block;width:100%;height:2100px;border:0;background:#000;color-scheme:dark';
  frame.srcdoc = converterHtml;
  container.appendChild(frame);

  let observer = null;
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    const fit = () => { frame.style.height = `${Math.ceil(doc.documentElement.scrollHeight)}px`; };
    observer = new ResizeObserver(fit);
    observer.observe(doc.body);
    fit();
  });

  return () => {
    observer?.disconnect();
    frame.remove();
  };
}
