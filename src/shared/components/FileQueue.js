import { formatFileSize } from '../utils/fileSize.js';
import { StatusBadge } from './StatusBadge.js';

/**
 * Renders a list of file/model records (see shared/utils/fileStatus.js
 * for the FileRecord shape). Purely presentational — pass the current
 * records array each time state changes and re-render.
 *
 * @param {import('../utils/fileStatus.js').FileRecord[]} records
 * @param {{ onRemove?: (id: string) => void }} [handlers]
 * @returns {HTMLElement}
 */
export function FileQueue(records, { onRemove } = {}) {
  const list = document.createElement('div');
  list.className = 'file-queue';

  if (records.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'file-queue__empty';
    empty.textContent = 'No files queued yet.';
    list.appendChild(empty);
    return list;
  }

  records.forEach((record) => {
    const row = document.createElement('div');
    row.className = 'file-queue__row';

    const name = document.createElement('span');
    name.className = 'file-queue__name';
    name.textContent = record.filename;
    name.title = record.filename;

    const size = document.createElement('span');
    size.className = 'file-queue__size';
    size.textContent = formatFileSize(record.bytes);

    row.append(name, size, StatusBadge(record.status));

    if (onRemove) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn--secondary';
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => onRemove(record.id));
      row.appendChild(removeBtn);
    }

    list.appendChild(row);
  });

  return list;
}
