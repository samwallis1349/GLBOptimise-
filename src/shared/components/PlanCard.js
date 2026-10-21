/**
 * One pricing plan card, shared by the Pricing page and the locked-tool
 * Paywall so every price on the site looks the same:
 *
 *   TITLE [badge]
 *   lede
 *   ┌ ✦ allowance headline ┐
 *   │   = detail lines     │
 *   └──────────────────────┘
 *   £10 per month
 *   [ CTA button ]
 *   └ renews note ┘
 *   ✓ included feature
 *   ✕ not included
 *
 * tone: 'plain' (white CTA) | 'amber' (featured, amber wash + amber CTA) | 'copper'.
 * features: strings, or { text, off: true } for not-included, or { text, tag } for a pill.
 */
export function PlanCard({ title, badge, badgeStyle = 'tag', lede, head, lines = [], price, cta, ctaHref, renews, features = [], tone = 'plain' }) {
  const card = document.createElement('article');
  card.className = `panel plan-card plan-card--${tone}`;
  const items = features.map((f) => (typeof f === 'string' ? { text: f } : f));
  card.innerHTML = `
    <h2 class="plan-card__title">
      <span>${title}</span>
      ${badge ? `<span class="plan-card__badge plan-card__badge--${badgeStyle}">${badgeStyle === 'star' ? '★ ' : ''}${badge}</span>` : ''}
    </h2>
    <p class="plan-card__lede">${lede}</p>
    <div class="plan-card__credits">
      <svg class="plan-card__spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8zM18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9z"/></svg>
      <div>
        <strong>${head}</strong>
        ${lines.map((l) => `<span>${l}</span>`).join('')}
      </div>
    </div>
    <p class="plan-card__price">${price}</p>
    <a class="plan-card__cta" href="${ctaHref}" target="_blank" rel="noopener">${cta}</a>
    ${renews ? `<p class="plan-card__renews">${renews}</p>` : ''}
    <ul class="plan-card__features">
      ${items.map((f) => `<li class="${f.off ? 'is-off' : ''}"><span>${f.text}</span>${f.tag ? `<em class="plan-card__tag">${f.tag}</em>` : ''}</li>`).join('')}
    </ul>
  `;
  return card;
}

/** "£10/month" -> "<b>£10</b>/month, billed monthly" */
export function monthlyPriceHtml(label) {
  const [amount, per] = label.split('/');
  return `<b>${amount}</b>/${per}, billed monthly`;
}
