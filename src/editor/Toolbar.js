import * as AssetManager from './AssetManager.js';

const SINGLE_ALIGN = [
  { type: 'left', label: 'Left' },
  { type: 'h-center', label: 'Center H' },
  { type: 'right', label: 'Right' },
  { type: 'top', label: 'Top' },
  { type: 'v-center', label: 'Center V' },
  { type: 'bottom', label: 'Bottom' },
];

const SINGLE_PAGE_ALIGN = [
  { type: 'page-center', label: 'Center on page' },
  { type: 'page-center-h', label: 'Center H on page' },
  { type: 'page-center-v', label: 'Center V on page' },
];

const MULTI_ALIGN = [
  { type: 'left', label: 'Left edges' },
  { type: 'h-center', label: 'Center H' },
  { type: 'right', label: 'Right edges' },
  { type: 'top', label: 'Top edges' },
  { type: 'v-center', label: 'Center V' },
  { type: 'bottom', label: 'Bottom edges' },
];

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  return node;
}

function button(label, title, onClick) {
  const btn = el('button', 'ab-editor-btn', { type: 'button', title: title || label, text: label });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export function createToolbar(handlers) {
  const root = el('div', 'ab-editor-toolbar ab-editor-ui');
  root.style.display = 'none';

  const grip = el('div', 'ab-editor-grip', { title: 'Drag toolbar', text: '⠿' });
  root.appendChild(grip);

  const badge = el('div', 'ab-editor-badge');
  badge.innerHTML = '<span class="ab-editor-badge__dot"></span> EDIT MODE';
  root.appendChild(badge);

  const primaryRow = el('div', 'ab-editor-row');
  root.appendChild(primaryRow);

  const exitBtn = button('Exit (F8)', 'Exit edit mode', handlers.onToggle);
  const textBtn = button('+ Text', 'Click, then click the page to place text', handlers.onAddText);
  const imageBtn = button('+ Image', 'Insert an image', handlers.onAddImage);
  const dupBtn = button('Duplicate', 'Duplicate selection (Ctrl/Cmd+D)', handlers.onDuplicate);
  const delBtn = button('Delete', 'Delete selection (Del)', handlers.onDelete);
  const alignToggleBtn = button('Align ▾', 'Alignment tools', () => {
    alignPanel.classList.toggle('ab-editor-align-panel--open');
  });
  const undoBtn = button('↶', 'Undo (Ctrl/Cmd+Z)', handlers.onUndo);
  const redoBtn = button('↷', 'Redo (Ctrl/Cmd+Shift+Z)', handlers.onRedo);
  const saveBtn = button('Save Layout', 'Save layout to this browser', handlers.onSave);
  const resetBtn = button('Reset Layout', 'Restore the original coded layout', handlers.onReset);

  primaryRow.append(exitBtn, textBtn, imageBtn, dupBtn, delBtn, alignToggleBtn, undoBtn, redoBtn, saveBtn, resetBtn);

  const alignPanel = el('div', 'ab-editor-align-panel');
  root.appendChild(alignPanel);

  const inspector = el('div', 'ab-editor-inspector');
  root.appendChild(inspector);

  const selectedLabel = el('div', 'ab-editor-selected-label');
  inspector.appendChild(selectedLabel);

  const xywhRow = el('div', 'ab-editor-row ab-editor-row--xywh');
  const fields = {};
  ['x', 'y', 'w', 'h'].forEach((key) => {
    const wrap = el('label', 'ab-editor-field');
    wrap.append(el('span', null, { text: key.toUpperCase() }));
    const input = el('input', null, { type: 'number', step: '1' });
    input.addEventListener('change', () => {
      const value = Number(input.value);
      if (Number.isNaN(value)) return;
      handlers.onInspectorChange({ [key]: value });
    });
    wrap.appendChild(input);
    fields[key] = input;
    xywhRow.appendChild(wrap);
  });
  inspector.appendChild(xywhRow);

  const textRow = el('div', 'ab-editor-row ab-editor-row--text');
  const fontSize = el('input', null, { type: 'number', min: '8', max: '160', title: 'Font size' });
  fontSize.addEventListener('change', () => handlers.onTextStyleChange({ fontSize: `${fontSize.value}px` }));
  const fontWeight = el('select', null, { title: 'Font weight' });
  [['400', 'Regular'], ['600', 'Semibold'], ['700', 'Bold']].forEach(([value, label]) => {
    const opt = el('option', null, { value, text: label });
    fontWeight.appendChild(opt);
  });
  fontWeight.addEventListener('change', () => handlers.onTextStyleChange({ fontWeight: fontWeight.value }));
  const alignSelect = el('select', null, { title: 'Text align' });
  ['left', 'center', 'right'].forEach((value) => {
    alignSelect.appendChild(el('option', null, { value, text: value }));
  });
  alignSelect.addEventListener('change', () => handlers.onTextStyleChange({ textAlign: alignSelect.value }));
  const colorInput = el('input', null, { type: 'color', title: 'Text color' });
  colorInput.addEventListener('input', () => handlers.onTextStyleChange({ color: colorInput.value }));
  textRow.append(fontSize, fontWeight, alignSelect, colorInput);
  inspector.appendChild(textRow);

  function renderAlignPanel(selectionCount) {
    alignPanel.innerHTML = '';
    if (selectionCount === 0) return;

    if (selectionCount === 1) {
      const group1 = el('div', 'ab-editor-align-group');
      SINGLE_ALIGN.forEach(({ type, label }) => group1.appendChild(button(label, label, () => handlers.onAlign(type))));
      const group2 = el('div', 'ab-editor-align-group');
      SINGLE_PAGE_ALIGN.forEach(({ type, label }) => group2.appendChild(button(label, label, () => handlers.onAlign(type))));
      alignPanel.append(group1, group2);
    } else {
      const group1 = el('div', 'ab-editor-align-group');
      MULTI_ALIGN.forEach(({ type, label }) => group1.appendChild(button(label, label, () => handlers.onAlign(type))));
      const group2 = el('div', 'ab-editor-align-group');
      group2.appendChild(button('Distribute H', 'Distribute horizontally', () => handlers.onDistribute('horizontal')));
      group2.appendChild(button('Distribute V', 'Distribute vertically', () => handlers.onDistribute('vertical')));
      group2.appendChild(button('Match W', 'Match width', () => handlers.onMatch('width')));
      group2.appendChild(button('Match H', 'Match height', () => handlers.onMatch('height')));
      alignPanel.append(group1, group2);
    }
  }

  function update({ editMode, selection, canUndo, canRedo, placingText }) {
    root.style.display = editMode ? 'flex' : 'none';
    if (!editMode) return;

    textBtn.classList.toggle('ab-editor-btn--active', !!placingText);
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;

    dupBtn.disabled = !selection.some((e) => e.hasAttribute('data-layout-duplicatable'));
    delBtn.disabled = !selection.some((e) => e.hasAttribute('data-layout-deletable'));

    alignToggleBtn.disabled = selection.length === 0;
    if (selection.length === 0) alignPanel.classList.remove('ab-editor-align-panel--open');
    renderAlignPanel(selection.length);

    if (selection.length === 0) {
      inspector.style.display = 'none';
      return;
    }

    inspector.style.display = 'flex';
    const primary = selection[selection.length - 1];
    const meta = primary.dataset.layoutName || primary.tagName.toLowerCase();
    selectedLabel.textContent = selection.length === 1 ? `Selected: ${meta}` : `Selected: ${selection.length} items`;

    const showXYWH = selection.length === 1;
    xywhRow.style.display = showXYWH ? 'flex' : 'none';
    if (showXYWH) {
      const rect = primary.getBoundingClientRect();
      const parentRect = primary.parentElement.getBoundingClientRect();
      fields.x.value = Math.round(rect.left - parentRect.left);
      fields.y.value = Math.round(rect.top - parentRect.top);
      fields.w.value = Math.round(rect.width);
      fields.h.value = Math.round(rect.height);
    }

    const isText = selection.length === 1 && AssetManager.isEditorText(primary);
    textRow.style.display = isText ? 'flex' : 'none';
    if (isText) {
      fontSize.value = parseInt(primary.style.fontSize, 10) || 16;
      fontWeight.value = primary.style.fontWeight || '400';
      alignSelect.value = primary.style.textAlign || 'left';
    }
  }

  // Draggable toolbar (grip only).
  let dragging = false;
  grip.addEventListener('pointerdown', (e) => {
    dragging = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = root.getBoundingClientRect();
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.right = 'auto';
    root.style.transform = 'none';

    function onMove(ev) {
      if (!dragging) return;
      root.style.left = `${rect.left + (ev.clientX - startX)}px`;
      root.style.top = `${rect.top + (ev.clientY - startY)}px`;
    }
    function onUp() {
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });

  function flashSaved() {
    saveBtn.classList.add('ab-editor-btn--flash');
    saveBtn.textContent = 'Saved ✓';
    setTimeout(() => {
      saveBtn.classList.remove('ab-editor-btn--flash');
      saveBtn.textContent = 'Save Layout';
    }, 1100);
  }

  return { el: root, update, flashSaved };
}
