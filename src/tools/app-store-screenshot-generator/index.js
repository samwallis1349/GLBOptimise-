import './app-store-screenshot-generator.css';

export function mount(container) {
  const page = document.createElement('section');
  page.className = 'app-store-screenshot-generator-page';
  page.innerHTML =
    '<iframe class="app-store-screenshot-generator-frame" src="/tools/app-store-screenshot-generator/index.html" title="App Store Screenshot Generator" sandbox="allow-scripts allow-downloads allow-forms allow-same-origin allow-modals" loading="eager"></iframe>';
  container.replaceChildren(page);
  return () => page.remove();
}
