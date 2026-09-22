export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';
  section.style.textAlign = 'center';
  section.innerHTML = `
    <h1 class="tool-page__title">404</h1>
    <p class="tool-page__description" style="margin: 0 auto var(--space-5);">
      That page doesn't exist.
    </p>
    <a class="btn btn--primary" href="#/">Back to Home</a>
  `;

  container.appendChild(section);
}
