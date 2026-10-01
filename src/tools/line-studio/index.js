import './line-studio.css';

export function mount(container) {
  const page=document.createElement('section');
  page.className='line-studio-page';
  page.innerHTML='<iframe class="line-studio-frame" src="/tools/line-studio/index.html" title="Line Studio line art cleaner" sandbox="allow-scripts allow-downloads allow-forms" loading="eager"></iframe>';
  container.replaceChildren(page);
  return ()=>page.remove();
}
