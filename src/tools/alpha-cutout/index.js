import './alpha-cutout.css';

export function mount(container) {
  const page=document.createElement('section');
  page.className='alpha-cutout-page';
  page.innerHTML='<iframe class="alpha-cutout-frame" src="/tools/alpha-cutout/index.html" title="Alpha Cutout sprite sheet background remover" sandbox="allow-scripts allow-downloads allow-forms" loading="eager"></iframe>';
  container.replaceChildren(page);
  return ()=>page.remove();
}
