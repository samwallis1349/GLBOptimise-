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

/**
 * Every browser extension, for the homepage "Web extensions" popup. `url` is
 * the store listing once it's approved; until then the extension shows as
 * "In review" (built and submitted) or "Coming soon" (planned).
 * Built extensions live in extensions/model-optimiser/editions.js. `download`
 * offers the build as a zip to load unpacked in Chrome, Edge or Brave
 * (public/extensions/assetbench-<id>.zip, made by npm run build:extensions:site).
 */
export const EXTENSIONS = [
  {
    id: 'reduce-polys',
    name: 'Reduce Polys',
    blurb: 'Cut GLB triangle counts in your browser. Free model check, 10 free reduces, then 99p once.',
    tools: ['reduce-polys'],
    url: CHROME_EXTENSIONS['reduce-polys'].url,
    status: 'live',
    download: true,
  },
  {
    id: 'texture-compressor',
    name: 'GLB Texture Compressor',
    blurb: 'Free texture check, plus 10 free KTX2 compressions and resizes, then 99p once.',
    tools: ['compress-textures', 'texture-resizer'],
    url: null,
    status: 'review',
    download: true,
  },
  {
    id: 'inspector',
    name: 'GLB Inspector',
    blurb: 'Free health check, plus 10 free rig, animation and compare runs, then 99p once.',
    tools: ['inspect-glb', 'rig-inspector', 'animation-inspector', 'asset-compare'],
    url: null,
    status: 'review',
    download: true,
  },
  // Built and tested (extensions/model-optimiser/editions.js); downloadable now, 'planned' until submitted to the store.
  {
    id: 'animation-tools',
    name: 'Animation Tools',
    blurb: 'Free clip list for GLB, glTF and FBX, plus 10 free strips and keyframe optimisations, then 99p once.',
    tools: ['strip-animations', 'animation-optimiser'],
    url: null,
    status: 'planned',
    download: true,
  },
  {
    id: 'converter',
    name: '3D Converter',
    blurb: 'Convert FBX, GLB, OBJ and glTF, split, merge and make LODs. Free file info, 10 free runs, then 99p once.',
    tools: ['convert-files', 'glb-builder', 'model-splitter', 'generate-lods'],
    url: null,
    status: 'planned',
    download: true,
  },
  {
    id: 'app-assets',
    name: 'App Assets',
    blurb: 'Free icon check, plus 10 free icon sets, Xcode image sets and store screenshots, then 99p once.',
    tools: ['app-icon-generator', 'xcassets-generator', 'app-store-screenshot-generator'],
    url: null,
    status: 'planned',
    download: true,
  },
  {
    id: 'image-tools',
    name: 'Sprite Studio',
    blurb: 'Free sprite-sheet check, plus 10 free cutouts, line-art clean-ups and iso sprite sheets, then 99p once.',
    tools: ['alpha-cutout', 'line-studio', 'model-to-iso-sprites'],
    url: null,
    status: 'planned',
    download: true,
  },
];
