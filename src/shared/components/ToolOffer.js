import { TOOL_DEVICE_LIMIT, TOOL_PRICE_LABEL, toolProduct } from '../config/toolProducts.js';
import { hasStoredLicense, hasToolLicense } from '../../services/LicenseService.js';
import { refundNoticeShortHtml } from './RefundNotice.js';
import { LicenseActivationForm } from './LicenseActivationForm.js';
import { hasAccess } from '../config/billing.js';
import { TOOLS } from '../config/tools.js';

/**
 * Slim bar above a tool offering just that tool for £5 — the key from the
 * receipt email unlocks it in the browser on the buyer's phone and computer.
 * Renders nothing until the tool's product is configured in
 * shared/config/toolProducts.js, or when the visitor already owns it.
 */
export function ToolOffer(tool) {
  const product = toolProduct(tool.id);
  if (!product || hasStoredLicense() || hasToolLicense(tool.id)) return null;

  const bar = document.createElement('aside');
  bar.className = 'tool-offer';
  bar.innerHTML = `
    <span class="tool-offer__text">
      <strong>Keep ${tool.name} for ${TOOL_PRICE_LABEL}</strong>
      <span class="text-secondary">One-time · works in your browser on up to ${TOOL_DEVICE_LIMIT} devices, phone included · nothing to install</span>
      <span class="tool-offer__refund">${refundNoticeShortHtml()}</span>
    </span>
    <div class="tool-offer__actions">
      <a class="btn btn--primary tool-offer__buy" href="${product.checkoutUrl}" target="_blank" rel="noopener">
        Unlock for ${TOOL_PRICE_LABEL}
      </a>
      <button type="button" class="btn btn--secondary tool-offer__key-toggle">Enter key</button>
    </div>
    <div class="tool-offer__form-wrap" style="display: none;"></div>
  `;

  const toggleBtn = bar.querySelector('.tool-offer__key-toggle');
  const formWrap = bar.querySelector('.tool-offer__form-wrap');
  let formAppended = false;

  toggleBtn.addEventListener('click', () => {
    const isHidden = formWrap.style.display === 'none';
    if (isHidden && !formAppended) {
      formWrap.appendChild(
        LicenseActivationForm({
          toolId: tool.id,
          onActivated: (result) => {
            if (hasAccess(tool.id)) {
              bar.remove();
              return null;
            }
            const other = TOOLS.find((t) => t.id === result.toolId);
            return `That key unlocks ${other?.name ?? 'a different tool'}, not ${tool.name}.`;
          },
        }),
      );
      formAppended = true;
    }
    formWrap.style.display = isHidden ? 'block' : 'none';
    toggleBtn.textContent = isHidden ? 'Close' : 'Enter key';
  });

  return bar;
}
