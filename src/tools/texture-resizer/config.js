export const TEXTURE_RESIZER_CONFIG = {
  maxFiles: 40,
  maxFileBytes: 32 * 1024 * 1024,
  maxDimension: 8192,
  acceptedTypes: ['image/png', 'image/jpeg', 'image/webp'],
  sizePresets: [4096, 2048, 1024, 512, 256, 128],
};

export const FORMAT_OPTIONS = {
  webp: { mime: 'image/webp', extension: 'webp', label: 'WebP' },
  png: { mime: 'image/png', extension: 'png', label: 'PNG' },
  jpeg: { mime: 'image/jpeg', extension: 'jpg', label: 'JPEG' },
};
