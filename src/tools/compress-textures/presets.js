/**
 * Compress Textures — presets, per-role rules and capability facts.
 *
 * The primary control is RESOLUTION, in the Blender sense: your model ships
 * with 4K maps and the game only ever shows it at arm's length, so you drop
 * everything to 1K. Format is the secondary win on top of that.
 */

/**
 * Resolution presets cap the LONGEST edge. A texture already at or below the
 * cap is left alone rather than upscaled — upscaling adds bytes and no detail.
 */
export const RESOLUTION_PRESETS = {
  4096: { id: '4096', label: '4K', max: 4096, blurb: 'Hero assets' },
  2048: { id: '2048', label: '2K', max: 2048, blurb: 'Close-up props' },
  1024: { id: '1024', label: '1K', max: 1024, blurb: 'Most game assets' },
  512: { id: '512', label: '512', max: 512, blurb: 'Background props' },
  256: { id: '256', label: '256', max: 256, blurb: 'Distant / mobile' },
  original: { id: 'original', label: 'Keep', max: null, blurb: 'Format only' },
};

export const DEFAULT_RESOLUTION = '1024';

/**
 * Display order, largest cap first. Object keys that look like integers are
 * iterated in ascending numeric order by the language itself, so the order
 * they are declared in above cannot be relied on for the UI.
 */
export const RESOLUTION_ORDER = ['4096', '2048', '1024', '512', '256', 'original'];

/**
 * Output formats. `supported` is set at runtime by probing the browser —
 * nothing here is presented as available until the browser has proved it can
 * actually encode it (see detectFormatSupport below).
 */
export const FORMATS = {
  keep: {
    id: 'keep',
    label: 'Keep original',
    blurb: 'Resize only, PNG stays PNG',
    mime: null,
  },
  webp: {
    id: 'webp',
    label: 'WebP',
    blurb: 'Smaller files, universal browser support',
    mime: 'image/webp',
    lossy: true,
  },
  jpeg: {
    id: 'jpeg',
    label: 'JPEG',
    blurb: 'Widest compatibility, no alpha channel',
    mime: 'image/jpeg',
    lossy: true,
    noAlpha: true,
  },
  ktx2: {
    id: 'ktx2',
    label: 'KTX2 / Basis',
    blurb: 'GPU-compressed — stays compressed in video memory',
    mime: 'image/ktx2',
    lossy: true,
    slow: true,
  },
};

export const DEFAULT_FORMAT = 'webp';

/**
 * Texture roles. This is the part that stops the tool from quietly wrecking a
 * model: only `colour` roles carry colour. Everything else stores NUMBERS in
 * its channels — a normal map's RGB is a direction vector, an ORM map's
 * channels are three independent scalars. Lossy block compression of those
 * shows up as lighting errors, not as "slightly softer texture".
 *
 * So data maps are resized freely (scaling preserves channel meaning) but are
 * never lossy-recompressed by default. The user can override per texture; the
 * UI says what the risk is rather than hiding the option.
 */
export const ROLES = {
  colour: {
    id: 'colour',
    label: 'Colour',
    slots: /^(baseColorTexture|emissiveTexture|sheenColorTexture|specularColorTexture)$/,
    lossySafe: true,
    note: 'Interpreted as colour — lossy compression is what these formats are designed for.',
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    slots: /^(normalTexture|clearcoatNormalTexture)$/,
    lossySafe: false,
    note: 'RGB encodes a direction vector. Lossy compression bends surface normals and shows up as wrong lighting.',
    ktx2Hint: 'normal',
  },
  orm: {
    id: 'orm',
    label: 'Packed data',
    slots: /^(metallicRoughnessTexture|occlusionTexture|transmissionTexture|thicknessTexture|clearcoatTexture|clearcoatRoughnessTexture|specularTexture|iridescenceTexture|iridescenceThicknessTexture|anisotropyTexture)$/,
    lossySafe: false,
    note: 'Each channel is a separate scalar (occlusion, roughness, metalness…). Lossy compression bleeds them into each other.',
  },
  other: {
    id: 'other',
    label: 'Unassigned',
    slots: null,
    lossySafe: false,
    note: 'Not referenced by a known material slot, so its channel meaning is unknown. Resized only, unless you override it.',
  },
};

export function roleForSlots(slots) {
  if (!slots || slots.length === 0) return ROLES.other;
  for (const role of [ROLES.colour, ROLES.normal, ROLES.orm]) {
    if (slots.some((s) => role.slots.test(s))) return role;
  }
  return ROLES.other;
}

/**
 * A texture used in more than one role (an ORM map also bound as occlusion is
 * fine; a base colour map also bound as a normal map is not) takes the most
 * conservative role present.
 */
export function isMixedRole(slots) {
  const roles = new Set(slots.map((s) => roleForSlots([s]).id));
  return roles.size > 1;
}

export const ADVANCED_DEFAULTS = {
  /** Quality for lossy WebP/JPEG, 0–1. */
  quality: 0.82,
  /** Basis ETC1S quality, 1–255. Higher is better looking and bigger. */
  ktx2Quality: 128,
  /** UASTC is higher quality and much larger; ETC1S is the usual choice. */
  ktx2Mode: 'etc1s',
  /** Round dimensions down to the nearest power of two. */
  powerOfTwo: false,
  /** Let data maps (normal/ORM) be lossy-compressed too. Off by default. */
  recompressDataMaps: false,
  /** Generate mipmaps when writing KTX2. */
  mipmaps: true,
};

/**
 * Asks the browser what it can genuinely encode, rather than assuming.
 * Chromium, for instance, accepts `image/avif` in toBlob() and silently
 * returns a PNG — which would look like a working AVIF button and produce
 * files that are not AVIF. Anything that fails this probe is shown as
 * unavailable in the UI and cannot be selected.
 *
 * @returns {Promise<Record<string, {supported: boolean, reason?: string}>>}
 */
export async function detectFormatSupport() {
  const support = {
    keep: { supported: true },
    ktx2: { supported: true },
  };

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff8800';
  ctx.fillRect(0, 0, 8, 8);

  for (const id of ['webp', 'jpeg']) {
    const mime = FORMATS[id].mime;
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.8));
      const ok = Boolean(blob) && blob.type === mime;
      support[id] = ok
        ? { supported: true }
        : { supported: false, reason: `This browser returned ${blob?.type || 'nothing'} instead of ${mime}.` };
    } catch (err) {
      support[id] = { supported: false, reason: err?.message || 'Encoder unavailable.' };
    }
  }

  return support;
}

/**
 * Formats deliberately not offered, with the honest reason. Shown in the
 * Advanced panel so it's clear these were considered, not forgotten.
 */
export const UNAVAILABLE_FORMATS = [
  {
    label: 'AVIF',
    reason:
      'No browser currently encodes AVIF from a canvas — Chrome accepts the request and hands back a PNG instead. Offering it would produce mislabelled files, so it is not offered at all.',
  },
  {
    label: 'DDS / BCn',
    reason:
      'Desktop-only block formats with no glTF extension and no browser encoder. KTX2 covers the same ground portably.',
  },
];
