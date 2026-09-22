/** Simple linear undo/redo stack of {undo(), redo()} commands. */

const MAX_HISTORY = 100;

let undoStack = [];
let redoStack = [];
const changeListeners = new Set();

function notify() {
  changeListeners.forEach((fn) => fn(canUndo(), canRedo()));
}

export function push(command) {
  undoStack.push(command);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  notify();
}

export function undo() {
  const command = undoStack.pop();
  if (!command) return false;
  command.undo();
  redoStack.push(command);
  notify();
  return true;
}

export function redo() {
  const command = redoStack.pop();
  if (!command) return false;
  command.redo();
  undoStack.push(command);
  notify();
  return true;
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

export function clear() {
  undoStack = [];
  redoStack = [];
  notify();
}

export function onChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
