/**
 * @param {number} percent 0-100
 * @returns {HTMLElement}
 */
export function ProgressBar(percent = 0) {
  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');

  const fill = document.createElement('div');
  fill.className = 'progress-bar__fill';

  bar.appendChild(fill);
  setProgress(bar, percent);
  return bar;
}

/** Updates an existing ProgressBar element in place. */
export function setProgress(barEl, percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  barEl.setAttribute('aria-valuenow', String(clamped));
  barEl.querySelector('.progress-bar__fill').style.width = `${clamped}%`;
}
