import './xcassets-generator.css';

export function mount(container) {
  const page = document.createElement('section');
  page.className = 'xcassets-generator-page';
  page.innerHTML =
    '<iframe class="xcassets-generator-frame" src="/tools/xcassets-generator/index.html" title="XCAssets Catalog Generator" sandbox="allow-scripts allow-downloads allow-forms allow-same-origin allow-modals" loading="eager"></iframe>';
  container.replaceChildren(page);
  return () => page.remove();
}
