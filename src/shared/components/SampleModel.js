/**
 * "Try it with the Rusted Colossus" above a 3D tool: loads the free homepage
 * model into the tool's own file input, so a visitor sees the tool work before
 * finding a file of their own. It works with any tool whose first file input
 * accepts .glb and reacts to a normal `change` event (every 3D tool does).
 * Tools where the Colossus shows nothing useful (he has no rig or clips) are skipped.
 */
const SAMPLE_URL = '/hero/downloads/rusted-colossus.glb';
const SAMPLE_NAME = 'rusted-colossus.glb';
const SKIP = new Set(['rig-inspector', 'animation-inspector', 'animation-optimiser', 'strip-animations', 'character-workshop']);

export function SampleModel(tool, container) {
  if (SKIP.has(tool.id)) return null;
  const input = [...container.querySelectorAll('input[type="file"]')].find((el) => /\.glb/i.test(el.accept));
  if (!input) return null;

  const bar = document.createElement('aside');
  bar.className = 'sample-model';
  bar.innerHTML = `
    <img src="/hero/poster.webp" alt="" width="46" height="40" loading="lazy" decoding="async">
    <span><strong>No model to hand?</strong> Try ${tool.name} on the Rusted Colossus, our free 7 MB sample.</span>
    <button type="button" class="btn btn--secondary">Try it on the Colossus</button>
  `;
  const button = bar.querySelector('button');
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Loading the Colossus…';
    try {
      const response = await fetch(SAMPLE_URL);
      if (!response.ok) throw new Error(response.statusText);
      const file = new File([await response.blob()], SAMPLE_NAME, { type: 'model/gltf-binary' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      bar.remove();
    } catch {
      button.disabled = false;
      button.textContent = 'Could not load it, try again';
    }
  });
  return bar;
}
