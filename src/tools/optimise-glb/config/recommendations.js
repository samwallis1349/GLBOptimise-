// Model Check rules. Each rule reads real analysis data and decides
// whether to surface a recommendation. Thresholds are intentionally
// isolated here so they're easy to tune without touching UI code.

export const RECOMMENDATION_RULES = {
  HIGH_RES_TEXTURE: {
    id: 'HIGH_RES_TEXTURE',
    /** Trigger when any texture dimension is >= this many pixels. */
    minDimension: 4096,
    title(count) {
      return `${count} 4K TEXTURE${count === 1 ? '' : 'S'} DETECTED`;
    },
    description(analysis, matches) {
      const dims = matches.map((t) => `${t.width} × ${t.height}`).join(', ');
      return `${matches.length} texture${matches.length === 1 ? ' is' : 's are'} ${dims}. Large textures may be increasing this model's file size.`;
    },
    action: 'Compress Textures →',
    route: '/compress-textures',
  },

  HIGH_GEOMETRY: {
    id: 'HIGH_GEOMETRY',
    /** Trigger when total triangle count is >= this value. */
    minTriangles: 100000,
    title(analysis) {
      return `${formatK(analysis.geometry.triangleCount)} TRIANGLES`;
    },
    description(analysis) {
      return `This model contains ${analysis.geometry.triangleCount.toLocaleString()} triangles. Reducing geometry may improve realtime performance.`;
    },
    action: 'Reduce Polys →',
    route: '/reduce-polys',
  },
};

function formatK(n) {
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

/**
 * Evaluate all rules against a single model's analysis result.
 * Returns an array of { rule, title, description, action, route }.
 * Never mutates analysis; never fabricates numbers not present in it.
 */
export function evaluateRecommendations(analysis) {
  const results = [];

  const highResTextures = (analysis.textures?.items ?? []).filter(
    (t) => t.width >= RECOMMENDATION_RULES.HIGH_RES_TEXTURE.minDimension ||
      t.height >= RECOMMENDATION_RULES.HIGH_RES_TEXTURE.minDimension
  );
  if (highResTextures.length > 0) {
    const rule = RECOMMENDATION_RULES.HIGH_RES_TEXTURE;
    results.push({
      id: rule.id,
      title: rule.title(highResTextures.length),
      description: rule.description(analysis, highResTextures),
      action: rule.action,
      route: rule.route,
    });
  }

  const triangleCount = analysis.geometry?.triangleCount ?? 0;
  if (triangleCount >= RECOMMENDATION_RULES.HIGH_GEOMETRY.minTriangles) {
    const rule = RECOMMENDATION_RULES.HIGH_GEOMETRY;
    results.push({
      id: rule.id,
      title: rule.title(analysis),
      description: rule.description(analysis),
      action: rule.action,
      route: rule.route,
    });
  }

  return results;
}
