import { convertFbxFiles, isFbx, isZip, needsConversion } from './fbxToGlb.js';

/**
 * Lets a GLB tool take FBX files without touching the tool's own code: its
 * file inputs learn to accept .fbx, and FBX files arriving by picker or drop
 * are caught before the tool sees them (capture phase), converted to GLB in
 * the browser (fbxToGlb.js), then handed to the tool through the same input
 * or drop target, exactly like SampleModel loads the Colossus. A note above
 * the tool says "FBX in, GLB out" and reports each conversion.
 *
 * Tools opt in with `fbxInput: true` in shared/config/tools.js.
 *
 * @returns {HTMLElement|null} the note, for the caller to place
 */
export function FbxBridge(tool, container) {
  if (!tool.fbxInput) return null;
  const inputs = [...container.querySelectorAll('input[type="file"]')].filter((el) => /\.glb|\.gltf|gltf/i.test(el.accept));
  if (!inputs.length) return null;
  for (const input of inputs) if (!/\.fbx/i.test(input.accept)) input.accept += ',.fbx,.zip';

  const note = document.createElement('aside');
  note.className = 'fbx-bridge';
  note.innerHTML = `
    <span class="fbx-bridge__tag">${tool.fbxOutput ? 'FBX in &amp; out' : 'FBX in, GLB out'}</span>
    <span class="fbx-bridge__text">Got an FBX? Drop it here (with its textures, or zipped). It's converted to GLB in your browser first, then ${tool.name} works on the GLB.${tool.fbxOutput ? ' After you download a GLB, you can get it as FBX too, with its rig and animations.' : ''}</span>
    <button type="button" class="btn btn--secondary fbx-bridge__out" hidden></button>`;
  const text = note.querySelector('.fbx-bridge__text');
  if (tool.fbxOutput) offerFbxCopies(note, container);
  const say = (message, kind = '') => {
    text.textContent = message;
    note.dataset.state = kind;
  };

  const replaying = new WeakSet();

  async function convert(files) {
    const names = files.filter((f) => isFbx(f) || isZip(f)).map((f) => f.name).join(', ');
    say(`Converting ${names} to GLB…`, 'busy');
    const result = await convertFbxFiles(files);
    const done = result.converted.map((c) => `${c.from} → ${c.to}${c.clips ? ` (${c.clips} clip${c.clips === 1 ? '' : 's'})` : ''}`).join(', ');
    say(`Converted ${done}. ${tool.name} is now working on the GLB.${result.notes.length ? ` ${result.notes.join(' ')}` : ''}`, result.notes.length ? 'warn' : 'ok');
    const transfer = new DataTransfer();
    for (const file of result.files) transfer.items.add(file);
    return transfer;
  }

  const fail = (err) => say(`Couldn't convert that FBX: ${err?.message || err}. Try Convert Files, or export it as GLB from your 3D app.`, 'bad');

  // Picker: hold the change event, swap the files, replay it.
  container.addEventListener('change', async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || replaying.has(event)) return;
    const files = [...(input.files || [])];
    if (!files.some((f) => isFbx(f) || isZip(f))) return;
    event.stopImmediatePropagation();
    try {
      if (!(await needsConversion(files))) return replay();
      input.files = (await convert(files)).files;
    } catch (err) {
      fail(err);
      return;
    }
    replay();
    function replay() {
      const again = new Event('change', { bubbles: true });
      replaying.add(again);
      input.dispatchEvent(again);
    }
  }, true);

  // Drop: grab the entries now (the browser empties them after we yield),
  // walk folders, convert, then replay the drop with plain files.
  container.addEventListener('drop', async (event) => {
    if (replaying.has(event) || !event.dataTransfer) return;
    const items = [...(event.dataTransfer.items || [])];
    const entries = items.map((item) => (item.kind === 'file' && item.webkitGetAsEntry ? item.webkitGetAsEntry() : null)).filter(Boolean);
    const direct = [...(event.dataTransfer.files || [])];
    const hasFolder = entries.some((e) => e.isDirectory);
    if (!hasFolder && !direct.some((f) => isFbx(f) || isZip(f))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = event.target;
    try {
      const files = hasFolder ? await flatten(entries) : direct;
      const transfer = (await needsConversion(files)) ? await convert(files) : toTransfer(files);
      const again = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: event.clientX, clientY: event.clientY });
      replaying.add(again);
      target.dispatchEvent(again);
    } catch (err) {
      fail(err);
    }
  }, true);

  return note;
}

/**
 * FBX out: when the tool downloads a .glb (every tool does it by clicking a
 * temporary <a download>), keep a copy and offer the same model as FBX
 * through shared/fbx (meshes, materials, embedded textures, rigs and animation).
 */
function offerFbxCopies(note, container) {
  const button = note.querySelector('.fbx-bridge__out');
  let last = null;
  const onClick = (event) => {
    if (!container.isConnected) return document.removeEventListener('click', onClick, true);
    const link = event.target instanceof Element ? event.target.closest('a[download]') : null;
    if (!link || !/\.glb$/i.test(link.download) || !link.href.startsWith('blob:')) return;
    const name = link.download.replace(/\.glb$/i, '.fbx');
    // Started now, before the tool revokes the blob URL straight after its click.
    const bytes = fetch(link.href).then((r) => r.arrayBuffer());
    last = { name, bytes };
    button.hidden = false;
    button.disabled = false;
    button.textContent = `Download ${name}`;
  };
  document.addEventListener('click', onClick, true);

  button.addEventListener('click', async () => {
    if (!last) return;
    const { name, bytes } = last;
    button.disabled = true;
    button.textContent = 'Writing FBX…';
    try {
      const { glbBytesToFbx } = await import('./glbBytesToFbx.js');
      const { downloadBlob } = await import('../utils/download.js');
      const result = await glbBytesToFbx(await bytes);
      downloadBlob(new Blob([result.bytes], { type: 'application/octet-stream' }), name);
      button.textContent = `Downloaded ${name}`;
      const { meshes, triangles, textures, bones, animations } = result.stats;
      const parts = [`${meshes} mesh${meshes === 1 ? '' : 'es'}`, `${triangles.toLocaleString('en-GB')} triangles`, `${textures} texture${textures === 1 ? '' : 's'}`];
      if (bones) parts.push(`${bones} bones`);
      if (animations) parts.push(`${animations} animation${animations === 1 ? '' : 's'}`);
      note.querySelector('.fbx-bridge__text').textContent = `Saved ${name}: ${parts.join(', ')}.${result.notes.length ? ` ${result.notes.join(' ')}` : ''}`;
      note.dataset.state = result.notes.length ? 'warn' : 'ok';
    } catch (err) {
      button.textContent = `Download ${name}`;
      note.querySelector('.fbx-bridge__text').textContent = `Couldn't write the FBX: ${err?.message || err}`;
      note.dataset.state = 'bad';
    } finally {
      button.disabled = false;
    }
  });
}

function toTransfer(files) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer;
}

async function flatten(entries) {
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) {
      out.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}
