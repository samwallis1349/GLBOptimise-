/**
 * Creates editor-added images and text blocks. Pure DOM/file helpers —
 * insertion into the page, registration, selection and history are the
 * caller's (LayoutEditor's) job.
 */

const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';
let assetCounter = 0;

export function nextAssetId(prefix) {
  assetCounter += 1;
  return `editor-${prefix}-${Date.now().toString(36)}-${assetCounter}`;
}

/** Opens the native file picker and resolves with a data URL + natural size, or null if cancelled. */
export function pickImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMAGE_ACCEPT;
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if (typeof dataUrl !== 'string') return finish(null);
        if (dataUrl.startsWith('data:image/svg')) {
          // SVGs have no intrinsic raster size to probe reliably; use a sensible default.
          finish({ dataUrl, naturalWidth: 240, naturalHeight: 240, name: file.name });
          return;
        }
        const probe = new Image();
        probe.onload = () => finish({ dataUrl, naturalWidth: probe.naturalWidth, naturalHeight: probe.naturalHeight, name: file.name });
        probe.onerror = () => finish({ dataUrl, naturalWidth: 240, naturalHeight: 240, name: file.name });
        probe.src = dataUrl;
      };
      reader.onerror = () => finish(null);
      reader.readAsDataURL(file);
    });

    // Dismissing the picker without choosing a file fires 'cancel' in evergreen browsers.
    input.addEventListener('cancel', () => finish(null));

    input.click();
  });
}

export function createImageElement({ dataUrl, name }) {
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = name || 'Image';
  img.className = 'ab-editor-asset';
  img.setAttribute('data-layout-editable', '');
  img.setAttribute('data-layout-deletable', '');
  img.setAttribute('data-layout-duplicatable', '');
  img.dataset.layoutName = 'Image';
  img.dataset.assetType = 'image';
  img.dataset.layoutId = nextAssetId('image');
  return img;
}

export function fitStartingSize(naturalWidth, naturalHeight, maxDim = 240) {
  const ratio = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 1;
  let w = maxDim;
  let h = maxDim / ratio;
  if (h > maxDim) {
    h = maxDim;
    w = maxDim * ratio;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

export function replaceImageSrc(img, dataUrl, name) {
  img.src = dataUrl;
  if (name) img.alt = name;
}

export function createTextElement(text = 'Text') {
  const el = document.createElement('div');
  el.className = 'ab-editor-asset ab-editor-text';
  el.setAttribute('data-layout-editable', '');
  el.setAttribute('data-layout-deletable', '');
  el.setAttribute('data-layout-duplicatable', '');
  el.dataset.layoutName = 'Text';
  el.dataset.assetType = 'text';
  el.dataset.layoutId = nextAssetId('text');
  el.contentEditable = 'false';
  el.spellcheck = false;
  el.textContent = text;
  el.style.fontSize = '16px';
  el.style.fontWeight = '400';
  el.style.textAlign = 'left';
  el.style.color = 'var(--text-primary, #f4f1ea)';
  return el;
}

export function isEditorAsset(el) {
  return !!el && el.classList?.contains('ab-editor-asset');
}

export function isEditorImage(el) {
  return !!el && el.dataset?.assetType === 'image';
}

export function isEditorText(el) {
  return !!el && el.dataset?.assetType === 'text';
}
