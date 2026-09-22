import * as ComponentRegistry from './ComponentRegistry.js';
import * as TransformManager from './TransformManager.js';
import * as SelectionManager from './SelectionManager.js';
import * as AlignmentManager from './AlignmentManager.js';
import * as AssetManager from './AssetManager.js';
import * as GuideManager from './GuideManager.js';
import * as HistoryManager from './HistoryManager.js';
import * as LayoutStorage from './LayoutStorage.js';
import { createToolbar } from './Toolbar.js';
import editorCssUrl from './editor.css?url';

let singleton = null;

export function initLayoutEditor() {
  if (singleton) return singleton;

  injectStylesheet(editorCssUrl);

  const appRoot = document.getElementById('app');
  ComponentRegistry.setAppRoot(appRoot);

  let editMode = false;
  let placingText = false;

  // --- Overlay + toolbar scaffolding -------------------------------------

  const overlayLayer = document.createElement('div');
  overlayLayer.className = 'ab-editor-overlay ab-editor-ui';
  document.body.appendChild(overlayLayer);

  SelectionManager.init(overlayLayer);
  GuideManager.init(overlayLayer);

  const toolbar = createToolbar({
    onToggle: () => setEditMode(!editMode),
    onAddImage: addImage,
    onAddText: armAddText,
    onDuplicate: duplicateSelected,
    onDelete: deleteSelected,
    onAlign: handleAlign,
    onDistribute: handleDistribute,
    onMatch: handleMatch,
    onUndo: () => {
      HistoryManager.undo();
      SelectionManager.render();
      refreshToolbar();
    },
    onRedo: () => {
      HistoryManager.redo();
      SelectionManager.render();
      refreshToolbar();
    },
    onSave: saveLayout,
    onReset: resetLayout,
    onInspectorChange: handleInspectorChange,
    onTextStyleChange: handleTextStyleChange,
  });
  document.body.appendChild(toolbar.el);

  SelectionManager.onChange(() => refreshToolbar());
  HistoryManager.onChange(() => refreshToolbar());

  function refreshToolbar() {
    toolbar.update({
      editMode,
      selection: SelectionManager.getSelection(),
      canUndo: HistoryManager.canUndo(),
      canRedo: HistoryManager.canRedo(),
      placingText,
    });
  }

  // --- Mode toggling -------------------------------------------------------

  function setEditMode(next) {
    if (editMode === next) return;
    editMode = next;
    document.body.classList.toggle('ab-edit-mode', editMode);
    if (!editMode) {
      placingText = false;
      document.body.classList.remove('ab-editor-placing-text');
      SelectionManager.clearSelection();
      GuideManager.clear();
    } else {
      SelectionManager.render();
    }
    refreshToolbar();
  }

  // --- Selection / drag entry point ----------------------------------------

  function resolveTarget(target) {
    const explicit = ComponentRegistry.resolveComponentRoot(target);
    const el = explicit || target;
    if (el === document.body || el === document.documentElement || el === appRoot) return null;
    if (el.closest?.('.ab-editor-ui')) return null;
    ComponentRegistry.ensureRegistered(el);
    return el;
  }

  function onDocumentPointerDown(e) {
    if (!editMode) return;
    if (e.target.closest?.('.ab-editor-ui')) return;

    if (placingText) {
      e.preventDefault();
      e.stopPropagation();
      placeTextAt(e.clientX, e.clientY);
      return;
    }

    const el = resolveTarget(e.target);
    if (!el) {
      if (!e.shiftKey) SelectionManager.clearSelection();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const additive = e.shiftKey;
    const alreadySelected = SelectionManager.isSelected(el);

    if (additive) {
      SelectionManager.select(el, { additive: true });
    } else if (!alreadySelected) {
      SelectionManager.select(el, { additive: false });
    }

    const meta = ComponentRegistry.getMeta(el);
    if (meta?.movable ?? true) {
      const dragSet = SelectionManager.getSelection();
      SelectionManager.beginMoveDrag(e, dragSet.length ? dragSet : [el]);
    }
  }

  function onDocumentClickCapture(e) {
    if (!editMode) return;
    if (e.target.closest?.('.ab-editor-ui')) return;
    // Swallow the click itself so buttons/links never fire their normal
    // action while the user is selecting/moving things in edit mode.
    e.preventDefault();
    e.stopPropagation();
  }

  function onDocumentDblClick(e) {
    if (!editMode) return;
    const target = e.target.closest?.('.ab-editor-asset');
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();

    if (AssetManager.isEditorImage(target)) {
      replaceImage(target);
    } else if (AssetManager.isEditorText(target)) {
      beginTextEditing(target);
    }
  }

  function placeTextAt(clientX, clientY) {
    const mount = getMountPoint();
    const el = AssetManager.createTextElement();
    mount.appendChild(el);
    const id = el.dataset.layoutId;
    ComponentRegistry.register(el, {
      id,
      name: 'Text',
      deletable: true,
      duplicatable: true,
      editorCreated: true,
    });
    TransformManager.ensurePositioned(el, id);
    const mountRect = mount.getBoundingClientRect();
    const w = 160;
    const h = 32;
    TransformManager.setXYWH(el, id, {
      x: clientX - mountRect.left + mount.scrollLeft - w / 2,
      y: clientY - mountRect.top + mount.scrollTop - h / 2,
      w,
      h,
    });
    TransformManager.persist(el, id);
    LayoutStorage.setEntry(id, { assetType: 'text', text: el.textContent });

    placingText = false;
    document.body.classList.remove('ab-editor-placing-text');
    SelectionManager.setSelection([el]);

    HistoryManager.push({
      label: 'Insert text',
      undo() {
        el.remove();
        ComponentRegistry.unregister(el);
        LayoutStorage.removeEntry(id);
        SelectionManager.clearSelection();
      },
      redo() {
        mount.appendChild(el);
        ComponentRegistry.register(el, { id, name: 'Text', deletable: true, duplicatable: true, editorCreated: true });
        LayoutStorage.setEntry(id, { assetType: 'text', text: el.textContent });
        SelectionManager.setSelection([el]);
      },
    });
  }

  function beginTextEditing(el) {
    const before = el.textContent;
    el.contentEditable = 'true';
    el.classList.add('ab-editor-text--editing');
    el.focus();
    document.execCommand?.('selectAll', false, null);

    function onBlur() {
      el.removeEventListener('blur', onBlur);
      el.contentEditable = 'false';
      el.classList.remove('ab-editor-text--editing');
      const after = el.textContent;
      if (after !== before) {
        const id = ComponentRegistry.getMeta(el)?.id;
        if (id) LayoutStorage.setEntry(id, { text: after });
        HistoryManager.push({
          label: 'Edit text',
          undo() {
            el.textContent = before;
            if (id) LayoutStorage.setEntry(id, { text: before });
          },
          redo() {
            el.textContent = after;
            if (id) LayoutStorage.setEntry(id, { text: after });
          },
        });
      }
    }
    el.addEventListener('blur', onBlur);
  }

  async function replaceImage(img) {
    const result = await AssetManager.pickImageFile();
    if (!result) return;
    const before = img.src;
    AssetManager.replaceImageSrc(img, result.dataUrl, result.name);
    const id = ComponentRegistry.getMeta(img)?.id;
    if (id) LayoutStorage.setEntry(id, { src: result.dataUrl, name: result.name });
    HistoryManager.push({
      label: 'Replace image',
      undo() {
        img.src = before;
        if (id) LayoutStorage.setEntry(id, { src: before });
      },
      redo() {
        img.src = result.dataUrl;
        if (id) LayoutStorage.setEntry(id, { src: result.dataUrl });
      },
    });
  }

  // --- Keyboard shortcuts ----------------------------------------------------

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  function onKeyDown(e) {
    if (e.key === 'F8') {
      e.preventDefault();
      setEditMode(!editMode);
      return;
    }
    if (!editMode) return;

    if (e.key === 'Escape') {
      if (placingText) {
        placingText = false;
        document.body.classList.remove('ab-editor-placing-text');
        refreshToolbar();
      } else {
        SelectionManager.clearSelection();
      }
      return;
    }

    if (isTypingTarget(e.target)) return; // let inline text editing / inspector inputs behave normally

    const selection = SelectionManager.getSelection();

    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
      e.preventDefault();
      deleteSelected();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'd' && selection.length) {
      e.preventDefault();
      duplicateSelected();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      HistoryManager.redo();
      SelectionManager.render();
      refreshToolbar();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      HistoryManager.undo();
      SelectionManager.render();
      refreshToolbar();
      return;
    }

    if (e.key.startsWith('Arrow') && selection.length) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      SelectionManager.nudge(dx, dy);
    }
  }

  // --- Toolbar-driven commands ------------------------------------------------

  async function addImage() {
    const result = await AssetManager.pickImageFile();
    if (!result) return;

    const img = AssetManager.createImageElement(result);
    const { w, h } = AssetManager.fitStartingSize(result.naturalWidth, result.naturalHeight);
    const mount = getMountPoint();
    mount.appendChild(img);
    const id = img.dataset.layoutId;
    ComponentRegistry.register(img, { id, name: 'Image', deletable: true, duplicatable: true, editorCreated: true });
    TransformManager.ensurePositioned(img, id);

    const mountRect = mount.getBoundingClientRect();
    const x = window.innerWidth / 2 - w / 2 - mountRect.left + mount.scrollLeft;
    const y = window.innerHeight / 2 - h / 2 - mountRect.top + mount.scrollTop;
    TransformManager.setXYWH(img, id, { x, y, w, h });
    TransformManager.persist(img, id);
    LayoutStorage.setEntry(id, { assetType: 'image', src: result.dataUrl, name: result.name });

    SelectionManager.setSelection([img]);

    HistoryManager.push({
      label: 'Insert image',
      undo() {
        img.remove();
        ComponentRegistry.unregister(img);
        LayoutStorage.removeEntry(id);
        SelectionManager.clearSelection();
      },
      redo() {
        mount.appendChild(img);
        ComponentRegistry.register(img, { id, name: 'Image', deletable: true, duplicatable: true, editorCreated: true });
        LayoutStorage.setEntry(id, { assetType: 'image', src: result.dataUrl, name: result.name });
        SelectionManager.setSelection([img]);
      },
    });
  }

  function armAddText() {
    placingText = true;
    document.body.classList.add('ab-editor-placing-text');
    refreshToolbar();
  }

  function duplicateSelected() {
    const selection = SelectionManager.getSelection().filter((el) => ComponentRegistry.getMeta(el)?.duplicatable);
    if (!selection.length) return;

    const records = selection.map((el) => {
      const clone = el.cloneNode(true);
      const meta = ComponentRegistry.getMeta(el);
      const newId = AssetManager.nextAssetId('dup');
      clone.dataset.layoutId = newId;
      el.parentElement.insertBefore(clone, el.nextSibling);
      ComponentRegistry.register(clone, {
        id: newId,
        name: meta.name,
        movable: meta.movable,
        resizable: meta.resizable,
        lockChildren: meta.lockChildren,
        deletable: true,
        duplicatable: true,
        editorCreated: true,
      });
      TransformManager.ensurePositioned(clone, newId);
      const box = TransformManager.getXYWH(el);
      TransformManager.setXYWH(clone, newId, { x: box.x + 10, y: box.y + 10 });
      TransformManager.persist(clone, newId);
      return { original: el, clone, id: newId, parent: el.parentElement };
    });

    const clones = records.map((r) => r.clone);
    SelectionManager.setSelection(clones);

    HistoryManager.push({
      label: 'Duplicate',
      undo() {
        records.forEach(({ clone, id }) => {
          clone.remove();
          ComponentRegistry.unregister(clone);
          LayoutStorage.removeEntry(id);
        });
        SelectionManager.clearSelection();
      },
      redo() {
        records.forEach(({ clone, original, parent, id }) => {
          parent.insertBefore(clone, original.nextSibling);
          ComponentRegistry.register(clone, { id });
          TransformManager.persist(clone, id);
        });
        SelectionManager.setSelection(clones);
      },
    });
  }

  function deleteSelected() {
    const selection = SelectionManager.getSelection().filter((el) => ComponentRegistry.getMeta(el)?.deletable);
    if (!selection.length) return;

    const records = selection.map((el) => ({
      el,
      id: ComponentRegistry.getMeta(el).id,
      parent: el.parentElement,
      nextSibling: el.nextSibling,
    }));

    records.forEach(({ el, id }) => {
      el.remove();
      ComponentRegistry.unregister(el);
      LayoutStorage.removeEntry(id);
    });
    SelectionManager.setSelection(SelectionManager.getSelection().filter((el) => !selection.includes(el)));

    HistoryManager.push({
      label: 'Delete',
      undo() {
        records.forEach(({ el, id, parent, nextSibling }) => {
          parent.insertBefore(el, nextSibling);
          ComponentRegistry.register(el, { id });
          TransformManager.persist(el, id);
        });
      },
      redo() {
        records.forEach(({ el, id }) => {
          el.remove();
          ComponentRegistry.unregister(el);
          LayoutStorage.removeEntry(id);
        });
        SelectionManager.clearSelection();
      },
    });
  }

  function handleAlign(type) {
    const selection = SelectionManager.getSelection();
    if (!selection.length) return;
    const items = selection.map((el) => ({ el, id: ComponentRegistry.getMeta(el).id }));
    const changes = selection.length > 1 ? AlignmentManager.alignMulti(items, type) : AlignmentManager.alignSingle(selection[0], items[0].id, type);
    SelectionManager.commitChanges(changes, 'Align');
  }

  function handleDistribute(axis) {
    const selection = SelectionManager.getSelection();
    const items = selection.map((el) => ({ el, id: ComponentRegistry.getMeta(el).id }));
    const changes = AlignmentManager.distribute(items, axis);
    SelectionManager.commitChanges(changes, 'Distribute');
  }

  function handleMatch(dimension) {
    const selection = SelectionManager.getSelection();
    const items = selection.map((el) => ({ el, id: ComponentRegistry.getMeta(el).id }));
    const changes = AlignmentManager.matchDimension(items, dimension);
    SelectionManager.commitChanges(changes, 'Match dimension');
  }

  function handleInspectorChange(patch) {
    const selection = SelectionManager.getSelection();
    if (selection.length !== 1) return;
    const el = selection[0];
    const id = ComponentRegistry.getMeta(el).id;
    const before = TransformManager.getXYWH(el);
    TransformManager.setXYWH(el, id, patch);
    const after = TransformManager.getXYWH(el);
    SelectionManager.commitChanges([{ el, id, before, after }], 'Edit dimensions');
  }

  function handleTextStyleChange(patch) {
    const selection = SelectionManager.getSelection();
    const el = selection[0];
    if (!el || !AssetManager.isEditorText(el)) return;
    const id = ComponentRegistry.getMeta(el).id;
    const before = {
      fontSize: el.style.fontSize,
      fontWeight: el.style.fontWeight,
      textAlign: el.style.textAlign,
      color: el.style.color,
    };
    Object.assign(el.style, patch);
    const after = { ...before, ...patch };
    LayoutStorage.setEntry(id, { style: after });
    HistoryManager.push({
      label: 'Text style',
      undo() {
        Object.assign(el.style, before);
        LayoutStorage.setEntry(id, { style: before });
      },
      redo() {
        Object.assign(el.style, after);
        LayoutStorage.setEntry(id, { style: after });
      },
    });
  }

  // --- Save / Reset ------------------------------------------------------------

  function saveLayout() {
    for (const el of document.querySelectorAll('[data-ab-positioned="1"]')) {
      const id = el.dataset.layoutId;
      if (id) TransformManager.persist(el, id);
    }
    toolbar.flashSaved();
  }

  function resetLayout() {
    const proceed = window.confirm(
      'Reset layout? This restores every moved element to its original position and removes any images or text you added with the editor.',
    );
    if (!proceed) return;

    document.querySelectorAll('.ab-editor-asset').forEach((el) => {
      ComponentRegistry.unregister(el);
      el.remove();
    });

    document.querySelectorAll('[data-ab-positioned="1"]').forEach((el) => {
      const id = el.dataset.layoutId;
      TransformManager.restoreOriginal(el, id);
    });

    LayoutStorage.clearAll();
    HistoryManager.clear();
    SelectionManager.clearSelection();
    refreshToolbar();
  }

  function getMountPoint() {
    return document.getElementById('page-root') || appRoot;
  }

  // --- Dynamic component detection + saved-layout restoration ------------------

  function applyAllSavedLayouts() {
    const entries = LayoutStorage.getAllEntries();
    for (const [id, entry] of Object.entries(entries)) {
      if (entry.assetType && !document.querySelector(`[data-layout-id="${cssAttrEscape(id)}"]`)) {
        recreateAsset(id, entry);
        continue;
      }
      let el = document.querySelector(`[data-layout-id="${cssAttrEscape(id)}"]`);
      if (!el && id.startsWith('auto:')) {
        const path = id.slice('auto:'.length);
        try {
          el = appRoot.querySelector(path);
        } catch {
          el = null;
        }
        if (el) el.dataset.layoutId = id;
      }
      if (el && !ComponentRegistry.getMeta(el)) {
        ComponentRegistry.ensureRegistered(el);
      }
      if (el && (entry.x != null || entry.y != null || entry.width != null || entry.height != null)) {
        TransformManager.applyEntry(el, id, entry);
      }
    }
  }

  function recreateAsset(id, entry) {
    const mount = getMountPoint();
    let el;
    if (entry.assetType === 'image') {
      el = AssetManager.createImageElement({ dataUrl: entry.src, name: entry.name });
    } else if (entry.assetType === 'text') {
      el = AssetManager.createTextElement(entry.text || 'Text');
      if (entry.style) Object.assign(el.style, entry.style);
    } else {
      return;
    }
    el.dataset.layoutId = id;
    mount.appendChild(el);
    ComponentRegistry.register(el, { id, deletable: true, duplicatable: true, editorCreated: true });
    if (entry.x != null || entry.y != null || entry.width != null || entry.height != null) {
      TransformManager.ensurePositioned(el, id);
      TransformManager.applyEntry(el, id, entry);
    }
  }

  function cssAttrEscape(value) {
    return value.replace(/"/g, '\\"');
  }

  let mutationScheduled = false;
  const observer = new MutationObserver((mutations) => {
    // Ignore mutations caused entirely by our own dataset bookkeeping.
    const relevant = mutations.some((m) => m.type === 'childList' || m.attributeName === 'class');
    if (!relevant || mutationScheduled) return;
    mutationScheduled = true;
    requestAnimationFrame(() => {
      mutationScheduled = false;
      ComponentRegistry.scan(appRoot);
      applyAllSavedLayouts();
      if (editMode) SelectionManager.render();
    });
  });
  observer.observe(appRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // Initial pass, and a follow-up once the router has mounted the first page.
  ComponentRegistry.scan(appRoot);
  applyAllSavedLayouts();
  requestAnimationFrame(() => applyAllSavedLayouts());

  window.addEventListener('scroll', () => editMode && SelectionManager.render(), true);
  window.addEventListener('resize', () => editMode && SelectionManager.render());

  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('click', onDocumentClickCapture, true);
  document.addEventListener('dblclick', onDocumentDblClick, true);
  document.addEventListener('keydown', onKeyDown);

  refreshToolbar();

  singleton = {
    register: (el, opts) => ComponentRegistry.register(el, opts),
    unregister: (el) => ComponentRegistry.unregister(el),
    toggle: () => setEditMode(!editMode),
    isEditMode: () => editMode,
  };

  return singleton;
}

function injectStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
