export const PACK_PBR_CONFIG = {
  maxFileBytes: 64 * 1024 * 1024,
  maxDimension: 8192,
  acceptedTypes: ['image/png', 'image/jpeg', 'image/webp'],
  sources: [
    { id: 'ao', label: 'Ambient Occlusion', short: 'AO', hint: 'White = unoccluded' },
    { id: 'roughness', label: 'Roughness', short: 'R', hint: 'White = rough' },
    { id: 'metallic', label: 'Metallic', short: 'M', hint: 'White = metal' },
    { id: 'height', label: 'Height / Detail', short: 'H', hint: 'Optional detail mask' },
  ],
  presets: {
    orm: { label: 'ORM · glTF / Unreal', filename: '_orm', map: ['ao', 'roughness', 'metallic', 'white'], invert: [false, false, false, false] },
    rma: { label: 'RMA · Custom', filename: '_rma', map: ['roughness', 'metallic', 'ao', 'white'], invert: [false, false, false, false] },
    unity: { label: 'Unity Mask Map', filename: '_mask', map: ['metallic', 'ao', 'white', 'roughness'], invert: [false, false, false, true] },
  },
};
