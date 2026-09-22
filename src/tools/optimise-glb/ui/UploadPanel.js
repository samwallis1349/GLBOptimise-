import { validateFile, isLikelyGlb, extractFilesFromDataTransfer } from '../utils/files.js';

/**
 * Wires the dropzone + file input. Delegates actual file intake to
 * `onFilesSelected(files)` — this module only handles DOM events and
 * client-side validation, never touches app state directly.
 */
export function initUploadPanel({ onFilesSelected, onValidationIssues }) {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const chooseBtn = document.getElementById('choose-file-btn');

  const openPicker = (e) => {
    e?.stopPropagation();
    fileInput.click();
  };

  dropzone.addEventListener('click', openPicker);
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  });
  chooseBtn.addEventListener('click', openPicker);

  fileInput.addEventListener('change', async () => {
    await handleFiles(Array.from(fileInput.files || []));
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-active');
    });
  });

  ['dragleave', 'dragend'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
    });
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');
    const files = extractFilesFromDataTransfer(e.dataTransfer);
    await handleFiles(files);
  });

  async function handleFiles(files) {
    if (!files.length) return;

    const accepted = [];
    const issues = [];

    for (const file of files) {
      const result = validateFile(file);
      if (!result.accepted) {
        issues.push({ file, message: result.error });
        continue;
      }
      const looksReal = await isLikelyGlb(file);
      if (!looksReal) {
        issues.push({
          file,
          message: `"${file.name}" does not look like a valid GLB (bad file signature). It may be corrupt.`,
        });
        continue;
      }
      if (result.warning) issues.push({ file, message: result.warning, level: 'warning' });
      accepted.push(file);
    }

    if (issues.length) onValidationIssues(issues);
    if (accepted.length) onFilesSelected(accepted);
  }
}
