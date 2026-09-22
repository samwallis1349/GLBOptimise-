/**
 * Drag-and-drop + click-to-browse upload zone. Purely a UI primitive —
 * it does not validate, store, or process files. Callers pass an
 * `onFiles(FileList)` callback and their own `accept`/`multiple` rules.
 *
 * @param {{ accept?: string, multiple?: boolean, title?: string, hint?: string, onFiles: (files: FileList) => void }} options
 * @returns {HTMLElement}
 */
export function UploadZone({
  accept = '.glb,.gltf',
  multiple = true,
  title = 'Drop files here or click to browse',
  hint = `Accepted formats: ${accept}`,
  onFiles,
}) {
  const zone = document.createElement('div');
  zone.className = 'upload-zone';
  zone.setAttribute('role', 'button');
  zone.setAttribute('tabindex', '0');

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;

  zone.innerHTML = `
    <div class="upload-zone__title">${title}</div>
    <div class="upload-zone__hint">${hint}</div>
  `;
  zone.appendChild(input);

  const openPicker = () => input.click();
  zone.addEventListener('click', openPicker);
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  });

  input.addEventListener('change', () => {
    if (input.files?.length) onFiles(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove('is-dragover');
    });
  });

  zone.addEventListener('drop', (event) => {
    const files = event.dataTransfer?.files;
    if (files?.length) onFiles(files);
  });

  return zone;
}
