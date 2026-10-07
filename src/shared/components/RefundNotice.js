/**
 * Shown next to every buy button. UK law lets buyers cancel digital content
 * within 14 days unless, before buying, they agree to immediate delivery and
 * acknowledge losing that right — so this has to be visible pre-checkout,
 * not only on /refunds.
 */
export function refundNoticeHtml() {
  return `<p class="refund-notice">
    Your licence key is delivered straight away. By buying, you ask for immediate
    delivery and accept that you lose the 14-day right to cancel once it's delivered.
    All sales are final — see the <a href="/refunds">refund policy</a>.
  </p>`;
}

/** One-line version for slim offer bars. */
export function refundNoticeShortHtml() {
  return `Delivered instantly, so the 14-day right to cancel ends on delivery and sales are final (<a href="/refunds">refund policy</a>).`;
}
