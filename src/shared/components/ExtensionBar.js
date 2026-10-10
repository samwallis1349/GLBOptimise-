import { chromeExtensionFor } from '../config/extensions.js';
import { TOOL_PRICE_LABEL } from '../config/toolProducts.js';

/**
 * Slim bar on a tool page pointing to its Chrome extension. Same look as the
 * single-tool offer bar; renders nothing until the extension's store URL is
 * set in shared/config/extensions.js.
 */
export function ExtensionBar(tool) {
  const ext = chromeExtensionFor(tool.id);
  if (!ext) return null;

  const bar = document.createElement('aside');
  bar.className = 'tool-offer tool-offer--extension';
  bar.innerHTML = `
    <span class="tool-offer__text">
      <strong>${ext.name} for Chrome</strong>
      <span class="text-secondary">Use it from a side panel on any page · free model check · reducing is ${TOOL_PRICE_LABEL} once</span>
    </span>
    <div class="tool-offer__actions">
      <a class="btn btn--secondary" href="${ext.url}" target="_blank" rel="noopener">Add to Chrome</a>
    </div>
  `;
  return bar;
}
