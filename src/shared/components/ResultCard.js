/**
 * A single labelled stat, e.g. { label: 'Original size', value: '12.4 MB' }.
 * Callers are responsible for only passing real, computed values — never
 * placeholder statistics.
 *
 * @param {{ label: string, value: string }} data
 * @returns {HTMLElement}
 */
export function ResultCard({ label, value }) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML = `
    <span class="result-card__label">${label}</span>
    <span class="result-card__value">${value}</span>
  `;
  return card;
}
