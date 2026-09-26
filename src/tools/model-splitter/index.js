import splitterHtml from './model-splitter.html?raw';

// The splitter stacks its panels into one column at this frame width.
const STACKED_WIDTH = 900;

/**
 * Model Splitter — splits a GLB/glTF/FBX/OBJ into loose parts, materials or
 * objects and exports them as separate files or one file of split objects.
 *
 * Like the Model Convertor, it is a self-contained page pinned to three.js
 * 0.170 from the jsDelivr CDN, loaded via srcdoc so it runs in its own
 * same-origin document. Its desktop layout fills the viewport (100vh), so the
 * frame is sized to the window below the sticky site header, not to content;
 * when stacked, its viewport is pinned to a pixel height and the frame fits
 * the content, since a vh-sized viewport would grow with the frame forever.
 */
export function mount(container) {
  container.innerHTML = '';
  const frame = document.createElement('iframe');
  frame.className = 'model-splitter-frame';
  frame.title = 'Model Splitter';
  frame.setAttribute('allow', 'fullscreen');
  frame.style.cssText = 'display:block;width:100%;height:760px;border:0;background:#050505;color-scheme:dark';
  frame.srcdoc = splitterHtml;
  container.appendChild(frame);

  let observer = null;
  let stackedStyle = null;
  const fit = () => {
    const doc = frame.contentDocument;
    const app = doc?.querySelector('.app');
    if (!app) return;
    if (frame.clientWidth > STACKED_WIDTH) {
      stackedStyle.textContent = '';
      const header = document.querySelector('.ab-header')?.offsetHeight ?? 0;
      frame.style.height = `${Math.max(704, window.innerHeight - header)}px`;
    } else {
      stackedStyle.textContent = `.vp{height:${Math.round(window.innerHeight * 0.6)}px!important}`;
      frame.style.height = `${Math.ceil(app.offsetHeight + 24)}px`;
    }
  };

  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    stackedStyle = doc.createElement('style');
    doc.head.appendChild(stackedStyle);
    observer = new ResizeObserver(fit);
    observer.observe(frame);
    observer.observe(doc.querySelector('.app'));
    fit();
  });
  window.addEventListener('resize', fit);

  return () => {
    window.removeEventListener('resize', fit);
    observer?.disconnect();
    frame.remove();
  };
}
