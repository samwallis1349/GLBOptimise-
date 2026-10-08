import './app-icon-generator.css';

export function mount(container) {
  const page = document.createElement('section');
  page.className = 'app-icon-generator-page';
  page.innerHTML =
    '<iframe class="app-icon-generator-frame" src="/tools/app-icon-generator/index.html" title="iOS App Icon Generator" sandbox="allow-scripts allow-downloads allow-forms allow-same-origin allow-modals" loading="eager"></iframe>';
  container.replaceChildren(page);
  return () => page.remove();
}
