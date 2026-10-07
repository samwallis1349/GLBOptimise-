import './mobile-ready-checker.css';

/**
 * Mobile Ready Checker is a self-contained page (public/tools/mobile-ready-checker/),
 * framed like Alpha Cutout. The frame grows to fit the page, which posts its
 * height; its "fix with" links may navigate this tab to the matching tool.
 */
export function mount(container) {
  const page = document.createElement('section');
  page.className = 'mobile-ready-page';
  page.innerHTML = '<iframe class="mobile-ready-frame" src="/tools/mobile-ready-checker/index.html" title="Mobile Ready Checker" sandbox="allow-scripts allow-downloads allow-top-navigation-by-user-activation" allow="clipboard-write" loading="eager"></iframe>';
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
