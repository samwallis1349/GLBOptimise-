/**
 * Chrome Web Store extensions built from extensions/model-optimiser. Paste a
 * listing's URL once it's approved and the tool's page shows an
 * "Add to Chrome" bar (shared/components/ExtensionBar.js); until then nothing
 * appears.
 */
export const CHROME_EXTENSIONS = {
  'reduce-polys': { name: 'Reduce Polys', url: 'https://chromewebstore.google.com/detail/reduce-polys-%E2%80%93-glb-polygo/naeghdddpphkgjofdejdlnbjcpbkpgda' },
};

export function chromeExtensionFor(toolId) {
  const ext = CHROME_EXTENSIONS[toolId];
  return ext?.url ? ext : null;
}
