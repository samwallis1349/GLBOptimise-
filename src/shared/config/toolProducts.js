/**
 * Single tools sold on their own for £3. A tool's key unlocks just that tool
 * in the browser, on up to TOOL_DEVICE_LIMIT devices (e.g. phone + computer),
 * via services/LicenseService.js. The lifetime license still unlocks all.
 *
 * Each tool needs its own Lemon Squeezy product: £3, licence keys on, and
 * activation limit = TOOL_DEVICE_LIMIT. Fill in its product ID and checkout
 * URL below; the tool's "Unlock" bar and paywall option only show once both
 * are set. (desktop/build.mjs can also build an optional Windows app from
 * the same product, but nothing on the site offers it.)
 */

export const TOOL_PRICE_LABEL = '£3';

/** Devices one tool key unlocks. Must match each product's activation limit in Lemon Squeezy. */
export const TOOL_DEVICE_LIMIT = 2;

export const TOOL_PRODUCTS = {
  'alpha-cutout': { productId: null, checkoutUrl: null },
  'line-studio': { productId: null, checkoutUrl: null },
  'model-to-isometric': { productId: null, checkoutUrl: null },
  'optimise-glb': { productId: null, checkoutUrl: null },
  'reduce-polys': { productId: null, checkoutUrl: null },
  'compress-textures': { productId: null, checkoutUrl: null },
  'ktx2-texture-encoder': { productId: null, checkoutUrl: null },
  'generate-lods': { productId: null, checkoutUrl: null },
  'strip-animations': { productId: null, checkoutUrl: null },
  'animation-optimiser': { productId: null, checkoutUrl: null },
  'pack-pbr': { productId: null, checkoutUrl: null },
  'texture-resizer': { productId: null, checkoutUrl: null },
  'convert-files': { productId: null, checkoutUrl: null },
  'glb-builder': { productId: null, checkoutUrl: null },
  'model-splitter': { productId: null, checkoutUrl: null },
  'inspect-glb': { productId: null, checkoutUrl: null },
  'mobile-ready-checker': { productId: null, checkoutUrl: null },
  'asset-compare': { productId: null, checkoutUrl: null },
  'asset-report': { productId: null, checkoutUrl: null },
  'rig-inspector': { productId: null, checkoutUrl: null },
  'animation-inspector': { productId: null, checkoutUrl: null },
  'thumbnail-maker': { productId: null, checkoutUrl: null },
};

export const SINGLE_TOOL_PRODUCT_ID = 1420925;
export const SINGLE_TOOL_CHECKOUT_URL = 'https://workbenchlabs.lemonsqueezy.com/checkout/buy/228843fe-adb0-4124-bb41-7e572db5d9d5';

/** The tool's single-tool product, or the universal single-tool listing. */
export function toolProduct(toolId) {
  const specific = TOOL_PRODUCTS[toolId];
  if ((specific?.productId || specific?.variantId) && specific?.checkoutUrl) {
    return specific;
  }
  if (SINGLE_TOOL_PRODUCT_ID && SINGLE_TOOL_CHECKOUT_URL) {
    return {
      productId: SINGLE_TOOL_PRODUCT_ID,
      checkoutUrl: `${SINGLE_TOOL_CHECKOUT_URL}?checkout[custom][tool]=${toolId}`,
    };
  }
  return null;
}
