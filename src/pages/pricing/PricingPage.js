export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">Pricing</h1>
        <p class="tool-page__description">Asset Bench is free while the tool suite is being built.</p>
      </div>
    </div>
    <div class="panel" style="max-width: 480px;">
      <p><strong>Every tool is free to use right now.</strong></p>
      <p class="text-secondary" style="margin-top: var(--space-3);">
        An account and credit system is planned for later, for heavier or
        higher-volume processing. Nothing is billed today — there is no
        signup, no account, and no payment integration yet.
      </p>
    </div>
  `;

  container.appendChild(section);
}
